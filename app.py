from __future__ import annotations

from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional
import asyncio
import base64
import csv
import hashlib
import hmac
import io
import json
import os
import secrets

from fastapi import FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse, StreamingResponse, RedirectResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel, Field

from db import get_conn, ensure_column, IntegrityError as DBIntegrityError

BASE = Path(__file__).resolve().parent

app = FastAPI(title="Saleh Order Ahead V4")
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
        message = json.dumps(payload, default=str)
        dead = []
        for ws in list(self.connections):
            try:
                await ws.send_text(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws)


manager = ConnectionManager()


def db():
    return get_conn()


ORDER_STATUSES = {
    "awaiting_acceptance",
    "pending",
    "preparing",
    "ready",
    "completed",
    "rejected",
    "cancelled",
}
ACTIVE_STATUSES = ("awaiting_acceptance", "pending", "preparing")
PENDING_ESCALATION_SECONDS = 90
# Orders placed without a connected live payment gateway are flagged as test
# orders so they never inflate real paid-sales reporting.
TEST_PAYMENT_METHODS = {"Test Payment"}

# Manually settable transitions via /api/orders/{id}/status. 'pending' is
# reached only through the server-side 90-second escalation task, never
# accepted directly from a client here.
STATUS_TRANSITIONS = {
    "awaiting_acceptance": {"preparing", "rejected", "cancelled"},
    "pending": {"preparing", "rejected", "cancelled"},
    "preparing": {"ready", "cancelled"},
    "ready": {"completed"},
}


PRODUCTS = [
    ("Spanish Latte Cold", "Coffee Hot/Cold", 30, "spanish-latte-cold.png", "bar"),
    ("Spanish Latte Hot", "Coffee Hot/Cold", 28, "spanish-latte-hot.png", "bar"),
    ("Cortado", "Coffee Hot/Cold", 24, "cortado.png", "bar"),
    ("Espresso", "Coffee Hot/Cold", 20, "espresso.png", "bar"),
    ("Flat White", "Coffee Hot/Cold", 24, "flat-white.png", "bar"),
    ("Latte", "Coffee Hot/Cold", 25, "latte.png", "bar"),
    ("Long Black", "Coffee Hot/Cold", 22, "long-black.png", "bar"),
    ("Macchiato", "Coffee Hot/Cold", 23, "macchiato.png", "bar"),
    ("Piccolo", "Coffee Hot/Cold", 23, "piccolo.png", "bar"),
    ("V60", "Coffee Hot/Cold", 30, "v60.png", "bar"),
    ("Cloudy Matcha", "Smoothies & Matcha", 36, "cloudy-matcha.png", "bar"),
    ("Acai Smoothie", "Smoothies & Matcha", 42, "acai-smoothie.png", "bar"),
    ("Matcha", "Smoothies & Matcha", 32, "matcha.png", "bar"),
    ("Labneh & Zaatar Toast", "Sourdough", 28, "labneh-zaatar-toast.png", "kitchen"),
    ("Jam with Peanut Butter & Nuts", "Sourdough", 34, "jam-peanut-butter-nuts.png", "kitchen"),
    ("Avocado with Egg Sourdough", "Sourdough", 36, "avocado-egg-sourdough.png", "kitchen"),
    ("Acai Bowl", "Healthy Bowls", 42, "acai-bowl.png", "kitchen"),
    ("Coconut Pudding", "Dessert", 32, "coconut-pudding.png", "kitchen"),
    ("Latte Pudding", "Dessert", 32, "latte-pudding.png", "kitchen"),
    ("Banana Pudding", "Dessert", 34, "banana-pudding.png", "kitchen"),
    ("Tiramisu", "Dessert", 26, "tiramisu.png", "kitchen"),
    ("Fresh Orange Juice", "Fresh Juices", 20, "fresh-orange-juice.png", "bar"),
]

BRANCHES = [
    ("Marsa Al Bateen", 1, 10, 8),
    ("SSMC Station", 1, 10, 8),
    ("Saadiyat Rotana", 1, 12, 7),
    ("Al Wathba Station", 0, 10, 7),
    ("Mussafah Station", 0, 12, 6),
]

INVENTORY_ITEMS = [
    ("House Blend Beans", "kg", 18.0, 10.0),
    ("Oat Milk", "cartons", 18.0, 12.0),
    ("Regular Milk", "units", 34.0, 15.0),
    ("12oz Cups", "pcs", 220.0, 150.0),
    ("Matcha Powder", "kg", 3.2, 2.0),
    ("Orange Juice Bottles", "pcs", 32.0, 15.0),
]


def init_db():
    conn = db()
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS branches(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            active INTEGER NOT NULL DEFAULT 1,
            has_kitchen INTEGER NOT NULL DEFAULT 0,
            base_prep_minutes INTEGER NOT NULL DEFAULT 10,
            capacity INTEGER NOT NULL DEFAULT 8,
            paused INTEGER NOT NULL DEFAULT 0,
            walkin_enabled INTEGER NOT NULL DEFAULT 1,
            drive_enabled INTEGER NOT NULL DEFAULT 1
        );
        CREATE TABLE IF NOT EXISTS products(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            category TEXT NOT NULL,
            price REAL NOT NULL,
            image TEXT NOT NULL,
            station TEXT NOT NULL DEFAULT 'bar',
            active INTEGER NOT NULL DEFAULT 1
        );
        CREATE TABLE IF NOT EXISTS branch_products(
            branch_id INTEGER NOT NULL,
            product_id INTEGER NOT NULL,
            available INTEGER NOT NULL DEFAULT 1,
            price_override REAL,
            PRIMARY KEY(branch_id, product_id),
            FOREIGN KEY(branch_id) REFERENCES branches(id) ON DELETE CASCADE,
            FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS orders(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            order_no TEXT UNIQUE,
            branch_id INTEGER NOT NULL,
            customer_name TEXT NOT NULL,
            mobile TEXT,
            car_id INTEGER,
            pickup_type TEXT NOT NULL DEFAULT 'Walk-in',
            pickup_time TEXT NOT NULL DEFAULT 'ASAP',
            scheduled_for TEXT,
            payment_method TEXT NOT NULL,
            payment_status TEXT NOT NULL,
            status TEXT NOT NULL,
            is_test INTEGER NOT NULL DEFAULT 0,
            total REAL NOT NULL,
            customer_note TEXT,
            rejection_reason TEXT,
            created_at TEXT NOT NULL,
            accepted_at TEXT,
            pending_at TEXT,
            rejected_at TEXT,
            ready_at TEXT,
            completed_at TEXT,
            FOREIGN KEY(branch_id) REFERENCES branches(id)
        );
        CREATE TABLE IF NOT EXISTS order_items(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            order_id INTEGER NOT NULL,
            product_id INTEGER NOT NULL,
            product_name TEXT NOT NULL,
            qty INTEGER NOT NULL,
            unit_price REAL NOT NULL,
            serve TEXT,
            size TEXT,
            milk TEXT,
            sweetness TEXT,
            beans TEXT,
            item_note TEXT,
            station TEXT NOT NULL,
            station_status TEXT NOT NULL DEFAULT 'pending',
            FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE,
            FOREIGN KEY(product_id) REFERENCES products(id)
        );
        CREATE TABLE IF NOT EXISTS customer_profiles(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            mobile TEXT NOT NULL UNIQUE,
            name TEXT,
            email TEXT,
            favorite_branch_id INTEGER,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY(favorite_branch_id) REFERENCES branches(id)
        );
        CREATE TABLE IF NOT EXISTS customer_cars(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            customer_id INTEGER NOT NULL,
            brand TEXT NOT NULL,
            emirate TEXT NOT NULL,
            plate_category TEXT,
            plate_number TEXT NOT NULL,
            nickname TEXT,
            active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL,
            FOREIGN KEY(customer_id) REFERENCES customer_profiles(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS inventory(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            branch_id INTEGER NOT NULL,
            item_name TEXT NOT NULL,
            unit TEXT NOT NULL,
            on_hand REAL NOT NULL,
            minimum REAL NOT NULL,
            UNIQUE(branch_id,item_name),
            FOREIGN KEY(branch_id) REFERENCES branches(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS inventory_adjustments(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            branch_id INTEGER NOT NULL,
            item_name TEXT NOT NULL,
            delta REAL NOT NULL,
            reason TEXT NOT NULL,
            note TEXT,
            created_at TEXT NOT NULL,
            FOREIGN KEY(branch_id) REFERENCES branches(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS users(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE COLLATE NOCASE,
            password_hash TEXT NOT NULL,
            role TEXT NOT NULL CHECK(role IN ('admin','manager','branch')),
            branch_id INTEGER,
            active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL,
            FOREIGN KEY(branch_id) REFERENCES branches(id)
        );
        CREATE TABLE IF NOT EXISTS sessions(
            token_hash TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL,
            expires_at TEXT NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        """
    )

    # Additive migrations for databases created before these columns existed.
    # Never drops or rewrites existing data.
    ensure_column(conn, "orders", "car_id", "INTEGER")
    ensure_column(conn, "orders", "is_test", "INTEGER NOT NULL DEFAULT 0")
    ensure_column(conn, "orders", "rejection_reason", "TEXT")
    ensure_column(conn, "orders", "pending_at", "TEXT")
    ensure_column(conn, "orders", "rejected_at", "TEXT")
    ensure_column(conn, "order_items", "serve", "TEXT")
    ensure_column(conn, "order_items", "sweetness", "TEXT")
    ensure_column(conn, "order_items", "beans", "TEXT")
    ensure_column(conn, "order_items", "item_note", "TEXT")
    conn.commit()

    # Older rows used 'new' for the pre-decision state and 'cancelled' for a
    # branch rejection; align them with the persistent status set without
    # touching any other order data.
    conn.execute("UPDATE orders SET status='awaiting_acceptance' WHERE status='new'")
    conn.commit()

    if conn.execute("SELECT COUNT(*) FROM branches").fetchone()[0] == 0:
        conn.executemany(
            "INSERT INTO branches(name,has_kitchen,base_prep_minutes,capacity) VALUES(?,?,?,?)",
            BRANCHES,
        )

    if conn.execute("SELECT COUNT(*) FROM products").fetchone()[0] == 0:
        conn.executemany(
            "INSERT INTO products(name,category,price,image,station) VALUES(?,?,?,?,?)",
            PRODUCTS,
        )

    # Ensure all supplied-image products are up to date on each startup without deleting data.
    for name, category, price, image, station in PRODUCTS:
        conn.execute(
            "UPDATE products SET category=?,price=?,image=?,station=? WHERE name=?",
            (category, price, image, station, name),
        )

    branch_rows = conn.execute("SELECT id,has_kitchen FROM branches").fetchall()
    product_rows = conn.execute("SELECT id,station FROM products").fetchall()
    for b in branch_rows:
        for p in product_rows:
            exists = conn.execute(
                "SELECT 1 FROM branch_products WHERE branch_id=? AND product_id=?",
                (b["id"], p["id"]),
            ).fetchone()
            if not exists:
                available = 1 if p["station"] == "bar" or b["has_kitchen"] else 0
                conn.execute(
                    "INSERT INTO branch_products(branch_id,product_id,available) VALUES(?,?,?)",
                    (b["id"], p["id"], available),
                )

    if conn.execute("SELECT COUNT(*) FROM inventory").fetchone()[0] == 0:
        rows = []
        for b in branch_rows:
            for idx, (name, unit, on_hand, minimum) in enumerate(INVENTORY_ITEMS):
                factor = ((b["id"] * 5 + idx * 3) % 7) - 2
                rows.append((b["id"], name, unit, max(0.5, on_hand + factor), minimum))
        conn.executemany(
            "INSERT INTO inventory(branch_id,item_name,unit,on_hand,minimum) VALUES(?,?,?,?,?)",
            rows,
        )

    conn.commit()
    conn.close()


init_db()


# ----------------------------
# Authentication & permissions
# ----------------------------
SESSION_COOKIE = "saleh_session"
SESSION_DAYS = 7
PBKDF2_ITERATIONS = 260_000


def hash_password(password: str) -> str:
    salt = os.urandom(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PBKDF2_ITERATIONS)
    return f"pbkdf2_sha256${PBKDF2_ITERATIONS}${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        algo, iterations, salt_hex, digest_hex = stored.split("$", 3)
        if algo != "pbkdf2_sha256":
            return False
        digest = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode("utf-8"),
            bytes.fromhex(salt_hex),
            int(iterations),
        )
        return hmac.compare_digest(digest.hex(), digest_hex)
    except Exception:
        return False


def users_exist() -> bool:
    conn = db()
    exists = conn.execute("SELECT 1 FROM users LIMIT 1").fetchone() is not None
    conn.close()
    return exists


def current_user(request: Request):
    raw = request.cookies.get(SESSION_COOKIE)
    if not raw:
        return None
    token_hash = hashlib.sha256(raw.encode("utf-8")).hexdigest()
    conn = db()
    row = conn.execute(
        """
        SELECT u.id,u.username,u.role,u.branch_id,u.active,s.expires_at
        FROM sessions s JOIN users u ON u.id=s.user_id
        WHERE s.token_hash=?
        """,
        (token_hash,),
    ).fetchone()
    if not row:
        conn.close()
        return None
    try:
        expired = datetime.fromisoformat(row["expires_at"]) <= datetime.now()
    except Exception:
        expired = True
    if expired or not row["active"]:
        conn.execute("DELETE FROM sessions WHERE token_hash=?", (token_hash,))
        conn.commit()
        conn.close()
        return None
    user = dict(row)
    conn.close()
    return user


def require_api_user(request: Request, roles: set[str], branch_id: Optional[int] = None):
    user = current_user(request)
    if not user:
        raise HTTPException(401, "Login required")
    if user["role"] not in roles:
        raise HTTPException(403, "Not permitted")
    if branch_id is not None and user["role"] == "branch" and user["branch_id"] != branch_id:
        raise HTTPException(403, "This account is assigned to another branch")
    return user


def page_auth(request: Request, roles: set[str], branch_id: Optional[int] = None):
    user = current_user(request)
    if not user:
        target = request.url.path
        return None, RedirectResponse(url=f"/login?next={target}", status_code=303)
    if user["role"] not in roles:
        raise HTTPException(403, "Not permitted")
    if branch_id is not None and user["role"] == "branch" and user["branch_id"] != branch_id:
        raise HTTPException(403, "This account is assigned to another branch")
    return user, None


def create_session_response(request: Request, user_id: int, payload: dict):
    raw = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(raw.encode("utf-8")).hexdigest()
    expires = datetime.now() + timedelta(days=SESSION_DAYS)
    conn = db()
    conn.execute(
        "INSERT INTO sessions(token_hash,user_id,expires_at,created_at) VALUES(?,?,?,?)",
        (token_hash, user_id, expires.isoformat(timespec="seconds"), datetime.now().isoformat(timespec="seconds")),
    )
    conn.commit()
    conn.close()
    response = JSONResponse(payload)
    response.set_cookie(
        SESSION_COOKIE,
        raw,
        max_age=SESSION_DAYS * 86400,
        httponly=True,
        secure=request.url.scheme == "https",
        samesite="lax",
        path="/",
    )
    return response


class LoginIn(BaseModel):
    username: str
    password: str
    next: str = ""


class SetupIn(BaseModel):
    username: str
    password: str


class UserCreateIn(BaseModel):
    username: str
    password: str
    role: str
    branch_id: Optional[int] = None


class UserUpdateIn(BaseModel):
    active: Optional[bool] = None
    password: Optional[str] = None


class OrderItemIn(BaseModel):
    product_id: int
    qty: int = Field(ge=1, le=20)
    serve: str = "Hot"
    size: str = "Regular"
    milk: str = "Regular Milk"
    sweetness: str = "Regular"
    beans: str = "House Blend"
    item_note: str = ""


class OrderIn(BaseModel):
    branch_id: int
    customer_name: str = "Guest"
    mobile: str = ""
    car_id: Optional[int] = None
    pickup_type: str = "Walk-in"
    pickup_time: str = "ASAP"
    scheduled_for: Optional[str] = None
    payment_method: str = "Card"
    customer_note: str = ""
    items: list[OrderItemIn]


class StatusIn(BaseModel):
    status: str
    reason: str = ""


class CustomerProfileIn(BaseModel):
    mobile: str
    name: str = ""
    email: str = ""
    favorite_branch_id: Optional[int] = None


class CustomerCarIn(BaseModel):
    brand: str
    emirate: str
    plate_category: str = ""
    plate_number: str
    nickname: str = ""


class BranchSettingsIn(BaseModel):
    has_kitchen: Optional[bool] = None
    base_prep_minutes: Optional[int] = Field(default=None, ge=5, le=60)
    capacity: Optional[int] = Field(default=None, ge=1, le=50)
    paused: Optional[bool] = None
    walkin_enabled: Optional[bool] = None
    drive_enabled: Optional[bool] = None


class AvailabilityIn(BaseModel):
    available: bool
    price_override: Optional[float] = Field(default=None, ge=0)


class AdjustmentIn(BaseModel):
    branch_id: int
    item_name: str
    delta: float
    reason: str
    note: str = ""


def serialize_order(conn, row):
    items = [
        dict(x)
        for x in conn.execute(
            """
            SELECT id,product_id,product_name,qty,unit_price,serve,size,milk,sweetness,beans,item_note,station,station_status
            FROM order_items WHERE order_id=? ORDER BY id
            """,
            (row["id"],),
        ).fetchall()
    ]
    d = dict(row)
    d["items"] = items
    if d.get("car_id"):
        car = conn.execute(
            "SELECT id,brand,emirate,plate_category,plate_number,nickname FROM customer_cars WHERE id=?",
            (d["car_id"],),
        ).fetchone()
        d["car"] = dict(car) if car else None
    else:
        d["car"] = None
    return d


def active_order_count(conn, branch_id: int):
    placeholders = ",".join("?" for _ in ACTIVE_STATUSES)
    return conn.execute(
        f"SELECT COUNT(*) FROM orders WHERE branch_id=? AND status IN ({placeholders})",
        (branch_id, *ACTIVE_STATUSES),
    ).fetchone()[0]


def branch_eta(conn, branch_row):
    active = active_order_count(conn, branch_row["id"])
    base = int(branch_row["base_prep_minutes"])
    cap = max(1, int(branch_row["capacity"]))
    queue_steps = active // cap
    return base + queue_steps * 5


def consume_inventory(conn, order_id: int, branch_id: int):
    items = conn.execute(
        "SELECT product_name,qty,milk,station FROM order_items WHERE order_id=?",
        (order_id,),
    ).fetchall()
    consumption = {}
    for item in items:
        q = float(item["qty"])
        name = item["product_name"].lower()
        if item["station"] == "bar":
            consumption["12oz Cups"] = consumption.get("12oz Cups", 0) + q
        if any(k in name for k in ["latte", "cortado", "flat white", "piccolo", "macchiato"]):
            consumption["House Blend Beans"] = consumption.get("House Blend Beans", 0) + 0.018 * q
            milk_item = "Oat Milk" if "oat" in (item["milk"] or "").lower() else "Regular Milk"
            consumption[milk_item] = consumption.get(milk_item, 0) + q
        elif any(k in name for k in ["espresso", "long black", "v60"]):
            consumption["House Blend Beans"] = consumption.get("House Blend Beans", 0) + 0.018 * q
        if "matcha" in name:
            consumption["Matcha Powder"] = consumption.get("Matcha Powder", 0) + 0.008 * q
        if "orange juice" in name:
            consumption["Orange Juice Bottles"] = consumption.get("Orange Juice Bottles", 0) + q

    now = datetime.now().isoformat(timespec="seconds")
    for item_name, qty in consumption.items():
        inv = conn.execute(
            "SELECT * FROM inventory WHERE branch_id=? AND item_name=?",
            (branch_id, item_name),
        ).fetchone()
        if inv:
            new_value = max(0, float(inv["on_hand"]) - qty)
            conn.execute("UPDATE inventory SET on_hand=? WHERE id=?", (new_value, inv["id"]))
            conn.execute(
                "INSERT INTO inventory_adjustments(branch_id,item_name,delta,reason,note,created_at) VALUES(?,?,?,?,?,?)",
                (branch_id, item_name, -qty, "sale_consumption", f"Order #{order_id}", now),
            )


def period_bounds(period: str):
    now = datetime.now()
    if period == "monthly":
        start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    elif period == "daily":
        start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    else:
        start = (now - timedelta(days=now.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)
    return start, now


def report_data(conn, period: str = "weekly", branch_id: Optional[int] = None):
    start, end = period_bounds(period)
    where = "o.created_at>=? AND o.created_at<=? AND o.payment_status='paid' AND o.status NOT IN ('cancelled','rejected') AND o.is_test=0"
    args: list = [start.isoformat(timespec="seconds"), end.isoformat(timespec="seconds")]
    if branch_id:
        where += " AND o.branch_id=?"
        args.append(branch_id)

    totals = conn.execute(
        f"SELECT COALESCE(SUM(o.total),0) sales,COUNT(*) orders,COALESCE(AVG(o.total),0) avg_order FROM orders o WHERE {where}",
        args,
    ).fetchone()
    top = [
        dict(x)
        for x in conn.execute(
            f"""
            SELECT oi.product_name,SUM(oi.qty) qty,SUM(oi.qty*oi.unit_price) sales
            FROM order_items oi JOIN orders o ON o.id=oi.order_id
            WHERE {where}
            GROUP BY oi.product_name ORDER BY qty DESC,sales DESC LIMIT 10
            """,
            args,
        ).fetchall()
    ]
    branches = [
        dict(x)
        for x in conn.execute(
            f"""
            SELECT b.id,b.name,COALESCE(SUM(o.total),0) sales,COUNT(o.id) orders,COALESCE(AVG(o.total),0) avg_order
            FROM branches b LEFT JOIN orders o ON o.branch_id=b.id AND o.created_at>=? AND o.created_at<=? AND o.payment_status='paid' AND o.status NOT IN ('cancelled','rejected') AND o.is_test=0
            {"WHERE b.id=?" if branch_id else ""}
            GROUP BY b.id,b.name ORDER BY sales DESC
            """,
            [start.isoformat(timespec="seconds"), end.isoformat(timespec="seconds")] + ([branch_id] if branch_id else []),
        ).fetchall()
    ]
    peak = [
        dict(x)
        for x in conn.execute(
            f"SELECT substr(o.created_at,12,2) hour,COUNT(*) orders,COALESCE(SUM(o.total),0) sales FROM orders o WHERE {where} GROUP BY hour ORDER BY orders DESC,hour LIMIT 8",
            args,
        ).fetchall()
    ]
    return {
        "period": period,
        "start": start.isoformat(timespec="minutes"),
        "end": end.isoformat(timespec="minutes"),
        "sales": float(totals["sales"]),
        "orders": int(totals["orders"]),
        "avg_order": float(totals["avg_order"]),
        "top_products": top,
        "branches": branches,
        "peak_hours": peak,
    }



@app.get("/login", response_class=HTMLResponse)
def login_page(request: Request, next: str = ""):
    if current_user(request):
        return RedirectResponse("/admin", status_code=303)
    if not users_exist():
        return RedirectResponse("/setup", status_code=303)
    return templates.TemplateResponse(request=request, name="login.html", context={"next": next})


@app.get("/setup", response_class=HTMLResponse)
def setup_page(request: Request):
    if users_exist():
        return RedirectResponse("/login", status_code=303)
    return templates.TemplateResponse(request=request, name="setup.html", context={})


@app.post("/api/auth/setup")
def setup_admin(payload: SetupIn, request: Request):
    if users_exist():
        raise HTTPException(409, "Initial setup has already been completed")
    username = payload.username.strip()
    if len(username) < 3:
        raise HTTPException(400, "Username must be at least 3 characters")
    if len(payload.password) < 10:
        raise HTTPException(400, "Password must be at least 10 characters")
    conn = db()
    cur = conn.execute(
        "INSERT INTO users(username,password_hash,role,branch_id,active,created_at) VALUES(?,?,?,?,1,?)",
        (username, hash_password(payload.password), "admin", None, datetime.now().isoformat(timespec="seconds")),
    )
    user_id = cur.lastrowid
    conn.commit()
    conn.close()
    return create_session_response(request, user_id, {"ok": True, "redirect": "/admin"})


@app.post("/api/auth/login")
def login(payload: LoginIn, request: Request):
    conn = db()
    row = conn.execute(
        "SELECT * FROM users WHERE username=? COLLATE NOCASE AND active=1",
        (payload.username.strip(),),
    ).fetchone()
    conn.close()
    if not row or not verify_password(payload.password, row["password_hash"]):
        raise HTTPException(401, "Invalid username or password")
    redirect = payload.next.strip()
    if not redirect.startswith("/"):
        redirect = ""
    if not redirect:
        redirect = f"/branch/{row['branch_id']}" if row["role"] == "branch" else "/admin"
    return create_session_response(
        request,
        row["id"],
        {"ok": True, "redirect": redirect, "role": row["role"], "branch_id": row["branch_id"]},
    )


@app.post("/api/auth/logout")
def logout(request: Request):
    raw = request.cookies.get(SESSION_COOKIE)
    if raw:
        conn = db()
        conn.execute("DELETE FROM sessions WHERE token_hash=?", (hashlib.sha256(raw.encode("utf-8")).hexdigest(),))
        conn.commit()
        conn.close()
    response = JSONResponse({"ok": True})
    response.delete_cookie(SESSION_COOKIE, path="/")
    return response


@app.get("/api/me")
def me(request: Request):
    user = current_user(request)
    if not user:
        raise HTTPException(401, "Not logged in")
    return {k: user[k] for k in ("id", "username", "role", "branch_id")}


@app.get("/api/users")
def list_users(request: Request):
    require_api_user(request, {"admin"})
    conn = db()
    rows = [
        dict(x)
        for x in conn.execute(
            """
            SELECT u.id,u.username,u.role,u.branch_id,u.active,u.created_at,b.name branch_name
            FROM users u LEFT JOIN branches b ON b.id=u.branch_id
            ORDER BY u.role,u.username
            """
        ).fetchall()
    ]
    conn.close()
    return rows


@app.post("/api/users")
def create_user(payload: UserCreateIn, request: Request):
    require_api_user(request, {"admin"})
    username = payload.username.strip()
    role = payload.role.strip().lower()
    if role not in {"admin", "manager", "branch"}:
        raise HTTPException(400, "Invalid role")
    if len(username) < 3:
        raise HTTPException(400, "Username must be at least 3 characters")
    if len(payload.password) < 10:
        raise HTTPException(400, "Password must be at least 10 characters")
    if role == "branch" and not payload.branch_id:
        raise HTTPException(400, "Branch account requires a branch")
    branch_id = payload.branch_id if role == "branch" else None
    conn = db()
    if branch_id and not conn.execute("SELECT 1 FROM branches WHERE id=?", (branch_id,)).fetchone():
        conn.close()
        raise HTTPException(400, "Branch not found")
    try:
        cur = conn.execute(
            "INSERT INTO users(username,password_hash,role,branch_id,active,created_at) VALUES(?,?,?,?,1,?)",
            (username, hash_password(payload.password), role, branch_id, datetime.now().isoformat(timespec="seconds")),
        )
        conn.commit()
    except DBIntegrityError:
        conn.close()
        raise HTTPException(409, "Username already exists")
    user_id = cur.lastrowid
    conn.close()
    return {"ok": True, "id": user_id}


@app.patch("/api/users/{user_id}")
def update_user(user_id: int, payload: UserUpdateIn, request: Request):
    me_user = require_api_user(request, {"admin"})
    conn = db()
    row = conn.execute("SELECT * FROM users WHERE id=?", (user_id,)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(404, "User not found")
    if payload.active is not None:
        if user_id == me_user["id"] and payload.active is False:
            conn.close()
            raise HTTPException(400, "You cannot disable your own account")
        conn.execute("UPDATE users SET active=? WHERE id=?", (1 if payload.active else 0, user_id))
        if payload.active is False:
            conn.execute("DELETE FROM sessions WHERE user_id=?", (user_id,))
    if payload.password:
        if len(payload.password) < 10:
            conn.close()
            raise HTTPException(400, "Password must be at least 10 characters")
        conn.execute("UPDATE users SET password_hash=? WHERE id=?", (hash_password(payload.password), user_id))
        if user_id != me_user["id"]:
            conn.execute("DELETE FROM sessions WHERE user_id=?", (user_id,))
    conn.commit()
    conn.close()
    return {"ok": True}


@app.get("/health")
def health():
    return {"status": "ok", "service": "saleh-order-ahead-v4"}


@app.get("/", response_class=HTMLResponse)
def customer(request: Request):
    return templates.TemplateResponse(request=request, name="customer.html", context={})


@app.get("/branch/{branch_id}", response_class=HTMLResponse)
def branch_screen(branch_id: int, request: Request):
    user, redirect = page_auth(request, {"admin","manager","branch"}, branch_id)
    if redirect:
        return redirect
    conn = db()
    branch = conn.execute("SELECT * FROM branches WHERE id=?", (branch_id,)).fetchone()
    conn.close()
    if not branch:
        raise HTTPException(404, "Branch not found")
    return templates.TemplateResponse(request=request, name="branch.html", context={"branch": dict(branch), "user": user})


@app.get("/admin", response_class=HTMLResponse)
def admin(request: Request):
    user, redirect = page_auth(request, {"admin","manager"})
    if redirect:
        return redirect
    return templates.TemplateResponse(request=request, name="admin.html", context={"user": user})


@app.get("/track/{order_no}", response_class=HTMLResponse)
def tracking(order_no: str, request: Request):
    return templates.TemplateResponse(request=request, name="tracking.html", context={"order_no": order_no})


@app.get("/receipt/{order_id}", response_class=HTMLResponse)
def receipt(order_id: int, request: Request):
    user = current_user(request)
    if not user:
        return RedirectResponse(url=f"/login?next=/receipt/{order_id}", status_code=303)
    conn = db()
    row = conn.execute(
        "SELECT o.*,b.name branch_name FROM orders o JOIN branches b ON b.id=o.branch_id WHERE o.id=?",
        (order_id,),
    ).fetchone()
    if not row:
        conn.close()
        raise HTTPException(404, "Order not found")
    if user["role"] == "branch" and user["branch_id"] != row["branch_id"]:
        conn.close()
        raise HTTPException(403, "Not permitted")
    order = serialize_order(conn, row)
    conn.close()
    return templates.TemplateResponse(request=request, name="receipt.html", context={"order": order})


@app.get("/report", response_class=HTMLResponse)
def report_page(request: Request, period: str = "weekly", branch_id: Optional[int] = None):
    user, redirect = page_auth(request, {"admin","manager"})
    if redirect:
        return redirect
    if period not in {"weekly", "monthly", "daily"}:
        period = "weekly"
    conn = db()
    data = report_data(conn, period, branch_id)
    branch = conn.execute("SELECT name FROM branches WHERE id=?", (branch_id,)).fetchone() if branch_id else None
    conn.close()
    return templates.TemplateResponse(
        request=request,
        name="report.html",
        context={"data": data, "branch_name": branch["name"] if branch else "Overall"},
    )


@app.get("/api/branches")
def branches():
    conn = db()
    rows = []
    for r in conn.execute("SELECT * FROM branches WHERE active=1 ORDER BY name").fetchall():
        d = dict(r)
        d["eta_minutes"] = branch_eta(conn, r)
        d["active_orders"] = active_order_count(conn, r["id"])
        rows.append(d)
    conn.close()
    return rows


@app.get("/api/products")
def products(branch_id: Optional[int] = None):
    conn = db()
    if branch_id:
        rows = [
            dict(x)
            for x in conn.execute(
                """
                SELECT p.*,bp.available,bp.price_override,
                       CASE WHEN bp.price_override IS NULL THEN p.price ELSE bp.price_override END effective_price
                FROM products p JOIN branch_products bp ON bp.product_id=p.id
                WHERE p.active=1 AND bp.branch_id=? ORDER BY p.category,p.name
                """,
                (branch_id,),
            ).fetchall()
        ]
    else:
        rows = [dict(x) | {"effective_price": x["price"]} for x in conn.execute("SELECT * FROM products WHERE active=1 ORDER BY category,name")]
    conn.close()
    return rows


def _serialize_car(row):
    return {
        "id": row["id"],
        "brand": row["brand"],
        "emirate": row["emirate"],
        "plate_category": row["plate_category"],
        "plate_number": row["plate_number"],
        "nickname": row["nickname"],
    }


@app.get("/api/customers/{mobile}")
def get_customer(mobile: str):
    mobile = mobile.strip()
    conn = db()
    profile = conn.execute("SELECT * FROM customer_profiles WHERE mobile=?", (mobile,)).fetchone()
    if not profile:
        conn.close()
        return {"profile": None, "cars": []}
    cars = [
        _serialize_car(x)
        for x in conn.execute(
            "SELECT * FROM customer_cars WHERE customer_id=? AND active=1 ORDER BY id", (profile["id"],)
        ).fetchall()
    ]
    conn.close()
    return {"profile": dict(profile), "cars": cars}


@app.post("/api/customers/profile")
def upsert_customer_profile(payload: CustomerProfileIn):
    mobile = payload.mobile.strip()
    if not mobile:
        raise HTTPException(400, "Mobile number is required")
    now = datetime.now().isoformat(timespec="seconds")
    conn = db()
    existing = conn.execute("SELECT * FROM customer_profiles WHERE mobile=?", (mobile,)).fetchone()
    if existing:
        conn.execute(
            "UPDATE customer_profiles SET name=?,email=?,favorite_branch_id=?,updated_at=? WHERE id=?",
            (
                payload.name.strip() or existing["name"],
                payload.email.strip() or existing["email"],
                payload.favorite_branch_id if payload.favorite_branch_id is not None else existing["favorite_branch_id"],
                now,
                existing["id"],
            ),
        )
        profile_id = existing["id"]
    else:
        cur = conn.execute(
            "INSERT INTO customer_profiles(mobile,name,email,favorite_branch_id,created_at,updated_at) VALUES(?,?,?,?,?,?)",
            (mobile, payload.name.strip(), payload.email.strip(), payload.favorite_branch_id, now, now),
        )
        profile_id = cur.lastrowid
    conn.commit()
    row = conn.execute("SELECT * FROM customer_profiles WHERE id=?", (profile_id,)).fetchone()
    conn.close()
    return dict(row)


@app.post("/api/customers/{mobile}/cars")
def add_customer_car(mobile: str, payload: CustomerCarIn):
    mobile = mobile.strip()
    if not mobile:
        raise HTTPException(400, "Mobile number is required")
    if not payload.brand.strip() or not payload.plate_number.strip():
        raise HTTPException(400, "Car brand and plate number are required")
    now = datetime.now().isoformat(timespec="seconds")
    conn = db()
    profile = conn.execute("SELECT * FROM customer_profiles WHERE mobile=?", (mobile,)).fetchone()
    if not profile:
        cur = conn.execute(
            "INSERT INTO customer_profiles(mobile,name,email,favorite_branch_id,created_at,updated_at) VALUES(?,?,?,?,?,?)",
            (mobile, "", "", None, now, now),
        )
        profile_id = cur.lastrowid
    else:
        profile_id = profile["id"]
    cur = conn.execute(
        """
        INSERT INTO customer_cars(customer_id,brand,emirate,plate_category,plate_number,nickname,active,created_at)
        VALUES(?,?,?,?,?,?,1,?)
        """,
        (
            profile_id,
            payload.brand.strip(),
            payload.emirate.strip(),
            payload.plate_category.strip(),
            payload.plate_number.strip(),
            payload.nickname.strip(),
            now,
        ),
    )
    car_id = cur.lastrowid
    conn.commit()
    row = conn.execute("SELECT * FROM customer_cars WHERE id=?", (car_id,)).fetchone()
    conn.close()
    return _serialize_car(row)


@app.delete("/api/customers/cars/{car_id}")
def delete_customer_car(car_id: int):
    conn = db()
    row = conn.execute("SELECT id FROM customer_cars WHERE id=?", (car_id,)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(404, "Car not found")
    conn.execute("UPDATE customer_cars SET active=0 WHERE id=?", (car_id,))
    conn.commit()
    conn.close()
    return {"ok": True}


@app.get("/api/order/{order_no}")
def order_by_no(order_no: str):
    conn = db()
    row = conn.execute(
        "SELECT o.*,b.name branch_name FROM orders o JOIN branches b ON b.id=o.branch_id WHERE o.order_no=?",
        (order_no,),
    ).fetchone()
    if not row:
        conn.close()
        raise HTTPException(404, "Order not found")
    result = serialize_order(conn, row)
    conn.close()
    return result


@app.post("/api/orders")
async def create_order(payload: OrderIn):
    conn = db()
    branch = conn.execute("SELECT * FROM branches WHERE id=? AND active=1", (payload.branch_id,)).fetchone()
    if not branch:
        conn.close()
        raise HTTPException(400, "Invalid branch")
    if branch["paused"]:
        conn.close()
        raise HTTPException(409, "This branch has temporarily paused new orders")
    if payload.pickup_type == "Drive" and not branch["drive_enabled"]:
        conn.close()
        raise HTTPException(400, "Drive pickup is not available at this branch")
    if payload.pickup_type == "Walk-in" and not branch["walkin_enabled"]:
        conn.close()
        raise HTTPException(400, "Walk-in pickup is not available at this branch")

    car_id = None
    if payload.pickup_type == "Drive":
        if not payload.car_id:
            conn.close()
            raise HTTPException(400, "Select a saved car for Drive Pickup")
        car = conn.execute(
            "SELECT id FROM customer_cars WHERE id=? AND active=1", (payload.car_id,)
        ).fetchone()
        if not car:
            conn.close()
            raise HTTPException(400, "Selected car was not found. Save it again under My Cars.")
        car_id = payload.car_id

    total = 0.0
    priced = []
    for item in payload.items:
        p = conn.execute(
            """
            SELECT p.*,bp.available,bp.price_override
            FROM products p JOIN branch_products bp ON bp.product_id=p.id
            WHERE p.id=? AND bp.branch_id=? AND p.active=1
            """,
            (item.product_id, payload.branch_id),
        ).fetchone()
        if not p or not p["available"]:
            conn.close()
            raise HTTPException(400, f"Product {item.product_id} is unavailable")
        if p["station"] == "kitchen" and not branch["has_kitchen"]:
            conn.close()
            raise HTTPException(400, f"{p['name']} is not available at this branch")
        unit = float(p["price_override"] if p["price_override"] is not None else p["price"])
        if item.size.lower() == "large" and p["station"] == "bar":
            unit += 4
        if "oat" in item.milk.lower() and p["station"] == "bar":
            unit += 3
        total += unit * item.qty
        priced.append((item, p, unit))

    created = datetime.now().isoformat(timespec="seconds")
    eta = branch_eta(conn, branch)
    pickup_time = payload.pickup_time or f"ASAP · ~{eta} min"
    is_test = 1 if payload.payment_method in TEST_PAYMENT_METHODS else 0
    cur = conn.execute(
        """
        INSERT INTO orders(order_no,branch_id,customer_name,mobile,car_id,pickup_type,pickup_time,scheduled_for,
            payment_method,payment_status,status,is_test,total,customer_note,created_at)
        VALUES(NULL,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        """,
        (
            payload.branch_id,
            payload.customer_name.strip() or "Guest",
            payload.mobile,
            car_id,
            payload.pickup_type,
            pickup_time,
            payload.scheduled_for,
            payload.payment_method,
            "paid",
            "awaiting_acceptance",
            is_test,
            round(total, 2),
            payload.customer_note,
            created,
        ),
    )
    order_id = cur.lastrowid
    order_no = f"SALEH-{1000 + order_id}"
    conn.execute("UPDATE orders SET order_no=? WHERE id=?", (order_no, order_id))
    for item, p, unit in priced:
        conn.execute(
            """
            INSERT INTO order_items(order_id,product_id,product_name,qty,unit_price,serve,size,milk,sweetness,beans,item_note,station,station_status)
            VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)
            """,
            (
                order_id, p["id"], p["name"], item.qty, unit,
                item.serve, item.size, item.milk, item.sweetness, item.beans, item.item_note,
                p["station"], "pending",
            ),
        )
    conn.commit()
    row = conn.execute(
        "SELECT o.*,b.name branch_name FROM orders o JOIN branches b ON b.id=o.branch_id WHERE o.id=?",
        (order_id,),
    ).fetchone()
    order = serialize_order(conn, row)
    conn.close()
    await manager.broadcast({"type": "order_created", "order": {"id": order["id"], "branch_id": order["branch_id"], "order_no": order["order_no"]}})
    return order


@app.get("/api/orders")
def orders(request: Request, branch_id: Optional[int] = None, status: Optional[str] = None, limit: int = 200):
    user = require_api_user(request, {"admin","manager","branch"})
    if user["role"] == "branch":
        if branch_id is not None and branch_id != user["branch_id"]:
            raise HTTPException(403, "Not permitted")
        branch_id = user["branch_id"]
    conn = db()
    q = "SELECT o.*,b.name branch_name FROM orders o JOIN branches b ON b.id=o.branch_id WHERE 1=1"
    args: list = []
    if branch_id:
        q += " AND o.branch_id=?"
        args.append(branch_id)
    if status:
        q += " AND o.status=?"
        args.append(status)
    q += " ORDER BY o.id DESC LIMIT ?"
    args.append(min(limit, 500))
    result = [serialize_order(conn, x) for x in conn.execute(q, args).fetchall()]
    conn.close()
    return result


@app.patch("/api/orders/{order_id}/status")
async def set_status(order_id: int, payload: StatusIn, request: Request):
    if payload.status not in ORDER_STATUSES:
        raise HTTPException(400, "Invalid status")
    conn = db()
    row = conn.execute("SELECT * FROM orders WHERE id=?", (order_id,)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(404, "Order not found")
    require_api_user(request, {"admin","manager","branch"}, row["branch_id"])

    current = row["status"]
    if payload.status not in STATUS_TRANSITIONS.get(current, set()):
        conn.close()
        raise HTTPException(400, f"Cannot move an order from '{current}' to '{payload.status}'")

    now = datetime.now().isoformat(timespec="seconds")
    if payload.status == "preparing":
        conn.execute("UPDATE orders SET status='preparing',accepted_at=? WHERE id=?", (now, order_id))
        consume_inventory(conn, order_id, row["branch_id"])
    elif payload.status == "rejected":
        reason = payload.reason.strip()
        if not reason:
            conn.close()
            raise HTTPException(400, "A rejection reason is required")
        conn.execute(
            "UPDATE orders SET status='rejected',rejected_at=?,rejection_reason=? WHERE id=?",
            (now, reason, order_id),
        )
    elif payload.status == "ready":
        conn.execute("UPDATE order_items SET station_status='done' WHERE order_id=?", (order_id,))
        conn.execute("UPDATE orders SET status='ready',ready_at=? WHERE id=?", (now, order_id))
    elif payload.status == "completed":
        conn.execute("UPDATE orders SET status='completed',completed_at=? WHERE id=?", (now, order_id))
    else:
        conn.execute("UPDATE orders SET status=? WHERE id=?", (payload.status, order_id))
    conn.commit()
    updated = conn.execute(
        "SELECT o.*,b.name branch_name FROM orders o JOIN branches b ON b.id=o.branch_id WHERE o.id=?",
        (order_id,),
    ).fetchone()
    order = serialize_order(conn, updated)
    conn.close()
    await manager.broadcast({"type": "order_updated", "order": {"id": order["id"], "branch_id": order["branch_id"], "order_no": order["order_no"], "status": order["status"]}})
    return order


@app.patch("/api/orders/{order_id}/station/{station}/done")
async def station_done(order_id: int, station: str, request: Request):
    if station not in {"bar", "kitchen"}:
        raise HTTPException(400, "Invalid station")
    conn = db()
    order_row = conn.execute("SELECT * FROM orders WHERE id=?", (order_id,)).fetchone()
    if not order_row:
        conn.close()
        raise HTTPException(404, "Order not found")
    require_api_user(request, {"admin","manager","branch"}, order_row["branch_id"])
    conn.execute(
        "UPDATE order_items SET station_status='done' WHERE order_id=? AND station=?",
        (order_id, station),
    )
    pending = conn.execute(
        "SELECT COUNT(*) FROM order_items WHERE order_id=? AND station_status!='done'",
        (order_id,),
    ).fetchone()[0]
    if pending == 0:
        now = datetime.now().isoformat(timespec="seconds")
        conn.execute("UPDATE orders SET status='ready',ready_at=? WHERE id=?", (now, order_id))
    conn.commit()
    updated = conn.execute(
        "SELECT o.*,b.name branch_name FROM orders o JOIN branches b ON b.id=o.branch_id WHERE o.id=?",
        (order_id,),
    ).fetchone()
    order = serialize_order(conn, updated)
    conn.close()
    await manager.broadcast({"type": "order_updated", "order": {"id": order["id"], "branch_id": order["branch_id"], "order_no": order["order_no"], "status": order["status"]}})
    return order


@app.get("/api/dashboard")
def dashboard(request: Request, branch_id: Optional[int] = None):
    require_api_user(request, {"admin","manager"})
    conn = db()
    today = datetime.now().strftime("%Y-%m-%d")
    where = "substr(o.created_at,1,10)=? AND o.payment_status='paid' AND o.status NOT IN ('cancelled','rejected') AND o.is_test=0"
    args: list = [today]
    if branch_id:
        where += " AND o.branch_id=?"
        args.append(branch_id)
    totals = conn.execute(
        f"SELECT COALESCE(SUM(o.total),0) sales,COUNT(*) orders,COALESCE(AVG(o.total),0) avg_order FROM orders o WHERE {where}",
        args,
    ).fetchone()
    top = [
        dict(x)
        for x in conn.execute(
            f"""
            SELECT oi.product_name,SUM(oi.qty) qty,SUM(oi.qty*oi.unit_price) sales
            FROM order_items oi JOIN orders o ON o.id=oi.order_id
            WHERE {where}
            GROUP BY oi.product_name ORDER BY qty DESC,sales DESC LIMIT 8
            """,
            args,
        ).fetchall()
    ]
    branch_metrics = [
        dict(x)
        for x in conn.execute(
            """
            SELECT b.id,b.name,b.has_kitchen,b.paused,b.base_prep_minutes,b.capacity,
                   COALESCE(SUM(CASE WHEN substr(o.created_at,1,10)=? AND o.payment_status='paid' AND o.status NOT IN ('cancelled','rejected') AND o.is_test=0 THEN o.total ELSE 0 END),0) sales,
                   SUM(CASE WHEN substr(o.created_at,1,10)=? AND o.payment_status='paid' AND o.status NOT IN ('cancelled','rejected') AND o.is_test=0 THEN 1 ELSE 0 END) orders,
                   SUM(CASE WHEN o.status IN ('awaiting_acceptance','pending','preparing','ready') THEN 1 ELSE 0 END) active_orders
            FROM branches b LEFT JOIN orders o ON o.branch_id=b.id
            WHERE b.active=1 GROUP BY b.id ORDER BY sales DESC,b.name
            """,
            (today, today),
        ).fetchall()
    ]
    low = conn.execute("SELECT COUNT(*) FROM inventory WHERE on_hand<minimum").fetchone()[0]
    peak = [dict(x) for x in conn.execute(
        f"SELECT substr(o.created_at,12,2) hour,COUNT(*) orders FROM orders o WHERE {where} GROUP BY hour ORDER BY orders DESC,hour LIMIT 6",
        args,
    ).fetchall()]
    conn.close()
    return {
        "sales": float(totals["sales"]),
        "orders": int(totals["orders"]),
        "avg_order": float(totals["avg_order"]),
        "low_stock": low,
        "top_products": top,
        "branches": branch_metrics,
        "peak_hours": peak,
    }


@app.get("/api/inventory")
def inventory(request: Request, branch_id: Optional[int] = None, overall: bool = False):
    require_api_user(request, {"admin","manager"})
    conn = db()
    if overall:
        rows = [
            dict(x)
            for x in conn.execute(
                """
                SELECT 'Overall' branch_name,item_name,unit,SUM(on_hand) on_hand,SUM(minimum) minimum
                FROM inventory GROUP BY item_name,unit ORDER BY item_name
                """
            ).fetchall()
        ]
    elif branch_id:
        rows = [
            dict(x)
            for x in conn.execute(
                "SELECT b.name branch_name,i.* FROM inventory i JOIN branches b ON b.id=i.branch_id WHERE i.branch_id=? ORDER BY i.item_name",
                (branch_id,),
            ).fetchall()
        ]
    else:
        rows = [
            dict(x)
            for x in conn.execute(
                "SELECT b.name branch_name,i.* FROM inventory i JOIN branches b ON b.id=i.branch_id ORDER BY b.name,i.item_name"
            ).fetchall()
        ]
    conn.close()
    return rows


@app.get("/api/low-stock")
def low_stock(request: Request, branch_id: Optional[int] = None):
    require_api_user(request, {"admin","manager"})
    conn = db()
    q = "SELECT b.name branch_name,i.* FROM inventory i JOIN branches b ON b.id=i.branch_id WHERE i.on_hand<i.minimum"
    args = []
    if branch_id:
        q += " AND i.branch_id=?"
        args.append(branch_id)
    q += " ORDER BY (i.on_hand/i.minimum),b.name,i.item_name"
    rows = [dict(x) for x in conn.execute(q, args).fetchall()]
    conn.close()
    return rows


@app.post("/api/inventory/adjustments")
async def add_adjustment(payload: AdjustmentIn, request: Request):
    require_api_user(request, {"admin","manager"})
    conn = db()
    inv = conn.execute(
        "SELECT * FROM inventory WHERE branch_id=? AND item_name=?",
        (payload.branch_id, payload.item_name),
    ).fetchone()
    if not inv:
        conn.close()
        raise HTTPException(404, "Inventory item not found")
    new_value = max(0, float(inv["on_hand"]) + payload.delta)
    conn.execute("UPDATE inventory SET on_hand=? WHERE id=?", (new_value, inv["id"]))
    conn.execute(
        "INSERT INTO inventory_adjustments(branch_id,item_name,delta,reason,note,created_at) VALUES(?,?,?,?,?,?)",
        (payload.branch_id, payload.item_name, payload.delta, payload.reason, payload.note, datetime.now().isoformat(timespec="seconds")),
    )
    conn.commit()
    conn.close()
    await manager.broadcast({"type": "inventory_updated"})
    return {"ok": True, "on_hand": new_value}


@app.get("/api/inventory/adjustments")
def adjustments(request: Request, branch_id: Optional[int] = None, limit: int = 100):
    require_api_user(request, {"admin","manager"})
    conn = db()
    q = "SELECT a.*,b.name branch_name FROM inventory_adjustments a JOIN branches b ON b.id=a.branch_id WHERE 1=1"
    args = []
    if branch_id:
        q += " AND a.branch_id=?"
        args.append(branch_id)
    q += " ORDER BY a.id DESC LIMIT ?"
    args.append(min(limit, 500))
    rows = [dict(x) for x in conn.execute(q, args).fetchall()]
    conn.close()
    return rows


@app.patch("/api/branches/{branch_id}/settings")
async def update_branch_settings(branch_id: int, payload: BranchSettingsIn, request: Request):
    user = require_api_user(request, {"admin","manager","branch"}, branch_id)
    if user["role"] == "branch":
        # Branch staff may only pause/resume their own store; structural settings stay management-only.
        requested = payload.model_dump(exclude_none=True)
        if set(requested) - {"paused"}:
            raise HTTPException(403, "Branch staff can only pause or resume orders")
    conn = db()
    branch = conn.execute("SELECT * FROM branches WHERE id=?", (branch_id,)).fetchone()
    if not branch:
        conn.close()
        raise HTTPException(404, "Branch not found")
    fields = []
    args = []
    for key in ["has_kitchen", "base_prep_minutes", "capacity", "paused", "walkin_enabled", "drive_enabled"]:
        val = getattr(payload, key)
        if val is not None:
            fields.append(f"{key}=?")
            args.append(int(val) if isinstance(val, bool) else val)
    if fields:
        args.append(branch_id)
        conn.execute(f"UPDATE branches SET {','.join(fields)} WHERE id=?", args)
        if payload.has_kitchen is False:
            conn.execute(
                "UPDATE branch_products SET available=0 WHERE branch_id=? AND product_id IN (SELECT id FROM products WHERE station='kitchen')",
                (branch_id,),
            )
    conn.commit()
    updated = dict(conn.execute("SELECT * FROM branches WHERE id=?", (branch_id,)).fetchone())
    conn.close()
    await manager.broadcast({"type": "branch_settings_updated", "branch_id": branch_id})
    return updated


@app.get("/api/availability")
def availability(branch_id: int, request: Request):
    require_api_user(request, {"admin","manager"})
    conn = db()
    rows = [
        dict(x)
        for x in conn.execute(
            """
            SELECT p.id product_id,p.name,p.category,p.price,p.image,p.station,bp.available,bp.price_override
            FROM products p JOIN branch_products bp ON bp.product_id=p.id
            WHERE bp.branch_id=? ORDER BY p.category,p.name
            """,
            (branch_id,),
        ).fetchall()
    ]
    conn.close()
    return rows


@app.patch("/api/availability/{branch_id}/{product_id}")
async def set_availability(branch_id: int, product_id: int, payload: AvailabilityIn, request: Request):
    require_api_user(request, {"admin","manager"})
    conn = db()
    branch = conn.execute("SELECT * FROM branches WHERE id=?", (branch_id,)).fetchone()
    product = conn.execute("SELECT * FROM products WHERE id=?", (product_id,)).fetchone()
    if not branch or not product:
        conn.close()
        raise HTTPException(404, "Branch or product not found")
    if payload.available and product["station"] == "kitchen" and not branch["has_kitchen"]:
        conn.close()
        raise HTTPException(409, "Enable kitchen for this branch first")
    conn.execute(
        "UPDATE branch_products SET available=?,price_override=? WHERE branch_id=? AND product_id=?",
        (int(payload.available), payload.price_override, branch_id, product_id),
    )
    conn.commit()
    conn.close()
    await manager.broadcast({"type": "availability_updated", "branch_id": branch_id, "product_id": product_id})
    return {"ok": True}


@app.get("/api/reports")
def reports(request: Request, period: str = "weekly", branch_id: Optional[int] = None):
    require_api_user(request, {"admin","manager"})
    if period not in {"weekly", "monthly", "daily"}:
        raise HTTPException(400, "Invalid period")
    conn = db()
    data = report_data(conn, period, branch_id)
    conn.close()
    return data


@app.get("/api/reports.csv")
def report_csv(request: Request, period: str = "weekly", branch_id: Optional[int] = None):
    require_api_user(request, {"admin","manager"})
    conn = db()
    data = report_data(conn, period, branch_id)
    branch = conn.execute("SELECT name FROM branches WHERE id=?", (branch_id,)).fetchone() if branch_id else None
    conn.close()
    sio = io.StringIO()
    w = csv.writer(sio)
    w.writerow(["Saleh Order Ahead Report"])
    w.writerow(["Scope", branch["name"] if branch else "Overall"])
    w.writerow(["Period", period])
    w.writerow(["Start", data["start"]])
    w.writerow(["End", data["end"]])
    w.writerow([])
    w.writerow(["Sales", data["sales"]])
    w.writerow(["Orders", data["orders"]])
    w.writerow(["Average Order", data["avg_order"]])
    w.writerow([])
    w.writerow(["Top Products"])
    w.writerow(["Product", "Qty", "Sales"])
    for p in data["top_products"]:
        w.writerow([p["product_name"], p["qty"], p["sales"]])
    sio.seek(0)
    filename = f"saleh-{period}-report.csv"
    return StreamingResponse(
        iter([sio.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.get("/api/closing")
def closing(branch_id: int, request: Request):
    require_api_user(request, {"admin","manager"})
    conn = db()
    data = report_data(conn, "daily", branch_id)
    low = [dict(x) for x in conn.execute(
        "SELECT item_name,unit,on_hand,minimum FROM inventory WHERE branch_id=? AND on_hand<minimum ORDER BY item_name",
        (branch_id,),
    ).fetchall()]
    cancelled = conn.execute(
        "SELECT COUNT(*) FROM orders WHERE branch_id=? AND substr(created_at,1,10)=? AND status IN ('cancelled','rejected')",
        (branch_id, datetime.now().strftime("%Y-%m-%d")),
    ).fetchone()[0]
    data["low_stock"] = low
    data["cancelled_orders"] = cancelled
    conn.close()
    return data


@app.get("/api/forecast")
def forecast(request: Request, branch_id: Optional[int] = None):
    require_api_user(request, {"admin","manager"})
    conn = db()
    end = datetime.now()
    start = end - timedelta(days=28)
    q = "SELECT substr(created_at,1,10) day,SUM(total) sales,COUNT(*) orders FROM orders WHERE created_at>=? AND payment_status='paid' AND status NOT IN ('cancelled','rejected') AND is_test=0"
    args: list = [start.isoformat(timespec="seconds")]
    if branch_id:
        q += " AND branch_id=?"
        args.append(branch_id)
    q += " GROUP BY day ORDER BY day"
    rows = [dict(x) for x in conn.execute(q, args).fetchall()]
    conn.close()
    recent = rows[-7:]
    avg_sales = sum(float(x["sales"]) for x in recent) / max(1, len(recent))
    avg_orders = sum(int(x["orders"]) for x in recent) / max(1, len(recent))
    return {
        "based_on_days": len(recent),
        "daily_sales_forecast": round(avg_sales, 2),
        "daily_orders_forecast": round(avg_orders, 1),
        "next_7_days_sales": round(avg_sales * 7, 2),
        "next_7_days_orders": round(avg_orders * 7),
    }


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)


async def escalate_pending_orders():
    """Server-backed 90-second escalation: awaiting_acceptance -> pending.

    Persists the transition to the database (not just a client-side timer)
    so every screen watching an order sees the same authoritative state.
    """
    while True:
        try:
            cutoff = (datetime.now() - timedelta(seconds=PENDING_ESCALATION_SECONDS)).isoformat(timespec="seconds")
            now = datetime.now().isoformat(timespec="seconds")
            conn = db()
            due = conn.execute(
                "SELECT id,branch_id,order_no FROM orders WHERE status='awaiting_acceptance' AND created_at<=?",
                (cutoff,),
            ).fetchall()
            escalated = []
            for row in due:
                conn.execute(
                    "UPDATE orders SET status='pending',pending_at=? WHERE id=? AND status='awaiting_acceptance'",
                    (now, row["id"]),
                )
                escalated.append(dict(row))
            conn.commit()
            conn.close()
            for row in escalated:
                await manager.broadcast(
                    {
                        "type": "order_updated",
                        "order": {"id": row["id"], "branch_id": row["branch_id"], "order_no": row["order_no"], "status": "pending"},
                    }
                )
        except Exception:
            pass
        await asyncio.sleep(5)


@app.on_event("startup")
async def start_background_tasks():
    asyncio.create_task(escalate_pending_orders())
