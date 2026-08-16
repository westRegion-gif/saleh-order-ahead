# Saleh Order Ahead V4 — Ready-to-Test Build

Unified FastAPI MVP for customer ordering, branch live operations, management, inventory, and reporting.

## V4 scope implemented

### Customer
- Original supplied product images (22 products)
- Original supplied astronaut/falcon artwork used unchanged as the app hero background
- Branch selection + favorite branch
- Live ETA based on branch queue/capacity
- Branch-specific product availability
- Walk-in / Drive pickup
- ASAP / scheduled pickup choices
- Favorites, recent orders, quick reorder (browser local storage)
- Guest checkout and mock Apple Pay/Card adapter
- Live order tracking

### Branch live orders
- New → Preparing → Ready → Collected
- Live WebSocket notifications + sound
- Optional browser auto-print attempt + manual reprint
- Live order timer
- Internal Bar / Kitchen station split
- Order is marked Ready only after all required stations are complete
- Kitchen tab hidden for branches without kitchen
- Pause/resume new orders
- Completed-order history

### Management
- Today dashboard
- Inventory Overall / By Branch
- Top Products Overall / By Branch
- Low stock alerts
- Branch comparison
- Product availability per branch
- Branch configuration (Kitchen, pause, prep time, capacity)
- Weekly / Monthly reports, Overall / By Branch
- Printable report (browser Save as PDF) + CSV download
- Daily closing summary
- Waste / expired / damaged / staff use / count / transfer adjustment log
- Peak hours
- Simple sales forecast

## Run locally

```bash
python -m pip install -r requirements.txt
python -m uvicorn app:app --reload --host 0.0.0.0 --port 8000
```

- Customer: http://localhost:8000/
- Management: http://localhost:8000/admin
- Branch 1: http://localhost:8000/branch/1

## Railway

The included `railway.json` is ready for the same GitHub → Railway flow.

> Important: V4 still uses SQLite for development/testing. Before real multi-branch production use, migrate persistence to PostgreSQL and connect a real payment gateway and printer agent/ESC-POS integration.

## Menu note

This build includes the 22 products for which original product images were supplied. Two items visible on the current public menu (Avocado & Scrambled Egg and Scrambled Egg Sandwich) are intentionally not shown because their original images were not supplied; no placeholder images were invented.


## V4 authentication
- First deployment opens `/setup` until the first Admin account is created.
- Passwords are PBKDF2-SHA256 hashed; no password is hardcoded in the public repository.
- Roles:
  - `admin`: all management features + user management.
  - `manager`: all management and all branches, but cannot manage users.
  - `branch`: restricted to one assigned branch screen.
- Sessions use an HttpOnly, SameSite=Lax cookie and expire after 7 days.
- Customer ordering remains guest-friendly and does not require a login.
