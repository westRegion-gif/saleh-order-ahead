from __future__ import annotations

from datetime import datetime
from pathlib import Path
from typing import Optional
import json
import sqlite3

from fastapi import FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel, Field

BASE = Path(__file__).resolve().parent
DB_PATH = BASE / "saleh.db"

app = FastAPI(title="Saleh Order Ahead MVP")
app.mount("/static", StaticFiles(directory=BASE / "static"), name="static")
templates = Jinja2Templates(directory=BASE / "templates")


class ConnectionManager:
    def __init__(self):
        self.connections: set[WebSocket] = set()

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.connections.add(websocket)

    def disconnect(self, websocket: WebSocket):
        self.connections.discard(websocket)

    async def broadcast(self, payload: dict):
        dead = []
        message = json.dumps(payload)
        for ws in list(self.connections):
            try:
                await ws.send_text(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws)

manager = ConnectionManager()


def db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = db()
    conn.executescript(
        """
        PRAGMA foreign_keys = ON;
        CREATE TABLE IF NOT EXISTS branches(
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            active INTEGER NOT NULL DEFAULT 1
        );
        CREATE TABLE IF NOT EXISTS products(
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            category TEXT NOT NULL,
            price REAL NOT NULL,
            active INTEGER NOT NULL DEFAULT 1
        );
        CREATE TABLE IF NOT EXISTS orders(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            order_no TEXT UNIQUE,
            branch_id INTEGER NOT NULL,
            customer_name TEXT NOT NULL,
            mobile TEXT,
            pickup_time TEXT,
            payment_method TEXT NOT NULL,
            payment_status TEXT NOT NULL,
            status TEXT NOT NULL,
            total REAL NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY(branch_id) REFERENCES branches(id)
        );
        CREATE TABLE IF NOT EXISTS order_items(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            order_id INTEGER NOT NULL,
            product_id INTEGER NOT NULL,
            product_name TEXT NOT NULL,
            qty INTEGER NOT NULL,
            unit_price REAL NOT NULL,
            size TEXT,
            milk TEXT,
            FOREIGN KEY(order_id) REFERENCES orders(id),
            FOREIGN KEY(product_id) REFERENCES products(id)
        );
        CREATE TABLE IF NOT EXISTS inventory(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            branch_id INTEGER NOT NULL,
            item_name TEXT NOT NULL,
            unit TEXT NOT NULL,
            on_hand REAL NOT NULL,
            minimum REAL NOT NULL,
            UNIQUE(branch_id, item_name),
            FOREIGN KEY(branch_id) REFERENCES branches(id)
        );
        """
    )
    if conn.execute("SELECT COUNT(*) FROM branches").fetchone()[0] == 0:
        branches = ["Marsa Al Bateen", "SSMC Station", "Saadiyat Rotana", "Al Wathba Station", "Mussafah Station"]
        conn.executemany("INSERT INTO branches(name) VALUES(?)", [(x,) for x in branches])
    if conn.execute("SELECT COUNT(*) FROM products").fetchone()[0] == 0:
        products = [
            ("Spanish Latte Cold","Coffee Hot/Cold",30),("Spanish Latte Hot","Coffee Hot/Cold",28),
            ("Cortado","Coffee Hot/Cold",24),("Espresso","Coffee Hot/Cold",20),("Flat White","Coffee Hot/Cold",24),
            ("Latte","Coffee Hot/Cold",25),("V60","Coffee Hot/Cold",30),("Coconut Pudding","Dessert",32),
            ("Banana Pudding","Dessert",34),("Tiramisu","Dessert",26),("Fresh Orange Juice","Fresh Juices",20),
            ("Acai Bowl","Healthy Bowls",42),("Cloudy Matcha","Smoothies & Matcha",36),("Matcha","Smoothies & Matcha",32),
            ("Labneh & Zaatar Toast","Sourdough",28),("Avocado with Egg Sourdough","Sourdough",36),
        ]
        conn.executemany("INSERT INTO products(name,category,price) VALUES(?,?,?)", products)
    if conn.execute("SELECT COUNT(*) FROM inventory").fetchone()[0] == 0:
        branch_ids = [r[0] for r in conn.execute("SELECT id FROM branches").fetchall()]
        items = [("House Blend Beans","kg",18,10),("Oat Milk","cartons",18,12),("Regular Milk","units",34,15),("12oz Cups","pcs",220,150),("Matcha Powder","kg",3.2,2)]
        rows=[]
        for bid in branch_ids:
            for name,unit,onhand,minv in items:
                adjust = ((bid*7 + len(name)) % 5) - 2
                val = max(0.5, onhand + adjust)
                rows.append((bid,name,unit,val,minv))
        conn.executemany("INSERT INTO inventory(branch_id,item_name,unit,on_hand,minimum) VALUES(?,?,?,?,?)", rows)
    conn.commit(); conn.close()

init_db()


class OrderItemIn(BaseModel):
    product_id: int
    qty: int = Field(ge=1, le=20)
    size: str = "Regular"
    milk: str = "Regular Milk"

class OrderIn(BaseModel):
    branch_id: int
    customer_name: str
    mobile: str = ""
    pickup_time: str = "ASAP · 10–15 min"
    payment_method: str = "Card"
    items: list[OrderItemIn]

class StatusIn(BaseModel):
    status: str


def serialize_order(conn, row):
    items = [dict(x) for x in conn.execute("SELECT product_name, qty, unit_price, size, milk FROM order_items WHERE order_id=?", (row["id"],)).fetchall()]
    d = dict(row); d["items"] = items
    return d

@app.get("/health")
def health():
    return {"status": "ok", "service": "saleh-order-ahead"}

@app.get("/", response_class=HTMLResponse)
def customer(request: Request):
    return templates.TemplateResponse(request=request, name="customer.html", context={})

@app.get("/branch/{branch_id}", response_class=HTMLResponse)
def branch_screen(branch_id: int, request: Request):
    conn=db(); branch=conn.execute("SELECT * FROM branches WHERE id=?",(branch_id,)).fetchone(); conn.close()
    if not branch: raise HTTPException(404,"Branch not found")
    return templates.TemplateResponse(request=request, name="branch.html", context={"branch": dict(branch)})

@app.get("/admin", response_class=HTMLResponse)
def admin(request: Request):
    return templates.TemplateResponse(request=request, name="admin.html", context={})

@app.get("/receipt/{order_id}", response_class=HTMLResponse)
def receipt(order_id: int, request: Request):
    conn=db(); row=conn.execute("SELECT o.*, b.name branch_name FROM orders o JOIN branches b ON b.id=o.branch_id WHERE o.id=?",(order_id,)).fetchone()
    if not row: conn.close(); raise HTTPException(404,"Order not found")
    order=serialize_order(conn,row); conn.close()
    return templates.TemplateResponse(request=request, name="receipt.html", context={"order": order})

@app.get("/api/branches")
def branches():
    conn=db(); rows=[dict(x) for x in conn.execute("SELECT * FROM branches WHERE active=1 ORDER BY name")]; conn.close(); return rows

@app.get("/api/products")
def products():
    conn=db(); rows=[dict(x) for x in conn.execute("SELECT * FROM products WHERE active=1 ORDER BY category,name")]; conn.close(); return rows

@app.post("/api/orders")
async def create_order(payload: OrderIn):
    conn=db()
    branch=conn.execute("SELECT id FROM branches WHERE id=? AND active=1",(payload.branch_id,)).fetchone()
    if not branch: conn.close(); raise HTTPException(400,"Invalid branch")
    total=0.0; priced=[]
    for item in payload.items:
        p=conn.execute("SELECT * FROM products WHERE id=? AND active=1",(item.product_id,)).fetchone()
        if not p: conn.close(); raise HTTPException(400,f"Invalid product {item.product_id}")
        unit=float(p["price"])
        if item.size.lower()=="large": unit += 4
        if "oat" in item.milk.lower(): unit += 3
        total += unit*item.qty
        priced.append((item,p,unit))
    created=datetime.now().isoformat(timespec="seconds")
    cur=conn.execute("INSERT INTO orders(order_no,branch_id,customer_name,mobile,pickup_time,payment_method,payment_status,status,total,created_at) VALUES(NULL,?,?,?,?,?,?,?,?,?)",
                     (payload.branch_id,payload.customer_name,payload.mobile,payload.pickup_time,payload.payment_method,"paid","new",round(total,2),created))
    order_id=cur.lastrowid; order_no=f"SALEH-{240+order_id}"
    conn.execute("UPDATE orders SET order_no=? WHERE id=?",(order_no,order_id))
    for item,p,unit in priced:
        conn.execute("INSERT INTO order_items(order_id,product_id,product_name,qty,unit_price,size,milk) VALUES(?,?,?,?,?,?,?)",
                     (order_id,p["id"],p["name"],item.qty,unit,item.size,item.milk))
    conn.commit()
    row=conn.execute("SELECT o.*, b.name branch_name FROM orders o JOIN branches b ON b.id=o.branch_id WHERE o.id=?",(order_id,)).fetchone()
    order=serialize_order(conn,row); conn.close()
    await manager.broadcast({"type":"order_created","order":order})
    return order

@app.get("/api/orders")
def orders(branch_id: Optional[int]=None, limit:int=100):
    conn=db()
    q="SELECT o.*, b.name branch_name FROM orders o JOIN branches b ON b.id=o.branch_id"
    args=[]
    if branch_id:
        q += " WHERE branch_id=?"; args.append(branch_id)
    q += " ORDER BY o.id DESC LIMIT ?"; args.append(limit)
    rows=[serialize_order(conn,x) for x in conn.execute(q,args).fetchall()]; conn.close(); return rows

@app.patch("/api/orders/{order_id}/status")
async def set_status(order_id:int, payload:StatusIn):
    allowed={"new","preparing","ready","completed","cancelled"}
    if payload.status not in allowed: raise HTTPException(400,"Invalid status")
    conn=db(); row=conn.execute("SELECT * FROM orders WHERE id=?",(order_id,)).fetchone()
    if not row: conn.close(); raise HTTPException(404,"Order not found")
    old=row["status"]
    conn.execute("UPDATE orders SET status=? WHERE id=?",(payload.status,order_id))
    # Simple demo inventory consumption when order is accepted.
    if old=="new" and payload.status=="preparing":
        items=conn.execute("SELECT product_name,qty,milk FROM order_items WHERE order_id=?",(order_id,)).fetchall()
        for it in items:
            qty=it["qty"]
            conn.execute("UPDATE inventory SET on_hand=MAX(0,on_hand-?) WHERE branch_id=? AND item_name='12oz Cups'",(qty,row["branch_id"]))
            if any(k in it["product_name"].lower() for k in ["latte","flat white","cortado"]):
                milk="Oat Milk" if "oat" in (it["milk"] or "").lower() else "Regular Milk"
                conn.execute("UPDATE inventory SET on_hand=MAX(0,on_hand-?) WHERE branch_id=? AND item_name=?",(.2*qty,row["branch_id"],milk))
            if any(k in it["product_name"].lower() for k in ["latte","flat white","cortado","espresso","v60"]):
                conn.execute("UPDATE inventory SET on_hand=MAX(0,on_hand-?) WHERE branch_id=? AND item_name='House Blend Beans'",(.02*qty,row["branch_id"]))
            if "matcha" in it["product_name"].lower():
                conn.execute("UPDATE inventory SET on_hand=MAX(0,on_hand-?) WHERE branch_id=? AND item_name='Matcha Powder'",(.01*qty,row["branch_id"]))
    conn.commit()
    row2=conn.execute("SELECT o.*, b.name branch_name FROM orders o JOIN branches b ON b.id=o.branch_id WHERE o.id=?",(order_id,)).fetchone(); order=serialize_order(conn,row2); conn.close()
    await manager.broadcast({"type":"order_updated","order":order})
    return order

@app.get("/api/inventory")
def inventory(branch_id: Optional[int]=None):
    conn=db(); q="SELECT i.*, b.name branch_name FROM inventory i JOIN branches b ON b.id=i.branch_id"; args=[]
    if branch_id: q+=" WHERE branch_id=?"; args.append(branch_id)
    q+=" ORDER BY b.name,i.item_name"
    rows=[dict(x) for x in conn.execute(q,args)]; conn.close(); return rows

@app.get("/api/dashboard")
def dashboard():
    conn=db()
    today=datetime.now().date().isoformat()
    base="FROM orders WHERE substr(created_at,1,10)=? AND status!='cancelled'"
    total=conn.execute(f"SELECT COALESCE(SUM(total),0) {base}",(today,)).fetchone()[0]
    count=conn.execute(f"SELECT COUNT(*) {base}",(today,)).fetchone()[0]
    branches=[dict(x) for x in conn.execute("""
        SELECT b.id,b.name,COALESCE(SUM(o.total),0) sales,COUNT(o.id) orders
        FROM branches b LEFT JOIN orders o ON o.branch_id=b.id AND substr(o.created_at,1,10)=? AND o.status!='cancelled'
        GROUP BY b.id,b.name ORDER BY sales DESC
    """,(today,)).fetchall()]
    products=[dict(x) for x in conn.execute("""
        SELECT oi.product_name, SUM(oi.qty) qty, SUM(oi.qty*oi.unit_price) sales
        FROM order_items oi JOIN orders o ON o.id=oi.order_id
        WHERE substr(o.created_at,1,10)=? AND o.status!='cancelled'
        GROUP BY oi.product_name ORDER BY qty DESC LIMIT 5
    """,(today,)).fetchall()]
    low=conn.execute("SELECT COUNT(*) FROM inventory WHERE on_hand < minimum").fetchone()[0]
    conn.close()
    return {"sales":round(total,2),"orders":count,"avg_order":round(total/count,2) if count else 0,"low_stock":low,"branches":branches,"top_products":products}

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)
