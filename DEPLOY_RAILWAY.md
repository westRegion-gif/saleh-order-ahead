# Deploy Saleh Order Ahead to Railway

## Fastest test deployment (SQLite)

1. Create a new GitHub repository, e.g. `saleh-order-ahead`.
2. Upload **the contents of this folder** to the repository root.
3. In Railway: **New Project → Deploy from GitHub repo → choose `saleh-order-ahead`**.
4. Railway will detect Python and install `requirements.txt`.
5. `railway.json` provides the start command automatically:
   `python -m uvicorn app:app --host 0.0.0.0 --port $PORT`
6. When deployment is green, open the service → **Settings → Networking → Generate Domain**.
7. Use the generated `https://...railway.app` URL.

Routes:
- Customer: `/`
- Management: `/admin`
- Branch 1: `/branch/1`
- Health check: `/health`

## Important
This trial build uses SQLite. It is fine to test the online flow, but Railway application files are not the right persistence model for production. Before live customer use, migrate to PostgreSQL and add authentication/payment/production printing.
