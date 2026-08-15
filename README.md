# Saleh Order Ahead MVP

A unified working MVP for:
- Customer pre-order and checkout
- Branch live order screen with sound, print receipt, Preparing/Ready/Collected flow
- Management dashboard across all branches
- Central inventory with demo automatic consumption when a branch accepts an order
- SQLite persistence
- WebSocket live updates between customer, branch, and management screens

## Run

```bash
pip install -r requirements.txt
uvicorn app:app --reload --host 0.0.0.0 --port 8000
```

Open:
- Customer: http://localhost:8000/
- Management: http://localhost:8000/admin
- Branch example: http://localhost:8000/branch/1

## Important production integrations still required

1. **Live payment gateway**: replace the current mock-paid behavior in `POST /api/orders` with Network International, Stripe, Checkout.com, Adyen, or your selected UAE gateway. Never store card numbers in this app.
2. **Thermal auto-print**: browser printing works for the MVP. Silent/automatic 80mm printing normally needs a supported POS printer integration or a small local print agent running inside each branch.
3. **Authentication & permissions**: add staff login, branch-role scoping, manager/admin roles, password reset, and audit logs before public deployment.
4. **Production database**: migrate SQLite to PostgreSQL for multi-branch production usage.
5. **Hosting / domain / TLS**: deploy behind HTTPS, e.g. `your-domain.com`.
6. **Inventory recipes**: the included inventory deduction is a simple demo. Production should use recipes/BOMs per product and size.
7. **Notifications**: optionally add SMS/WhatsApp/push when the order becomes Ready.

## Suggested production stack

FastAPI + PostgreSQL + Redis/WebSockets + managed payment gateway + local thermal print service.
