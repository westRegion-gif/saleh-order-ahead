from __future__ import annotations

import os
import pathlib
import sys
import tempfile

import pytest

ROOT = pathlib.Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

# Import-time safety rail in payments.py rejects anything but test-mode
# keys; keep the test environment key-free so every Stripe call goes
# through the fakes in conftest/test fixtures instead of real network calls.
os.environ.pop("DATABASE_URL", None)
os.environ["STRIPE_SECRET_KEY"] = ""
os.environ["STRIPE_WEBHOOK_SECRET"] = ""
os.environ["STRIPE_PUBLISHABLE_KEY"] = ""

import db as db_module  # noqa: E402

# Importing app.py runs init_db() once immediately, before any per-test
# fixture gets a chance to redirect the database path. Point it at a throwaway
# file first so that one-time import-time run never touches (or creates) a
# real saleh.db in the project directory.
_import_time_db = tempfile.NamedTemporaryFile(prefix="saleh-import-", suffix=".db", delete=False)
_import_time_db.close()
db_module.SQLITE_PATH = pathlib.Path(_import_time_db.name)

import app as app_module  # noqa: E402
import payments  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402


class FakeGateway:
    """Stands in for the real Stripe API so tests never need network access
    or a real Stripe key. Mimics just enough of PaymentIntent behavior
    (dict-style field access, idempotency-key dedup, status transitions)
    for app.py's checkout/webhook code to exercise its real logic."""

    def __init__(self):
        self.intents: dict[str, dict] = {}
        self._next_id = 1

    def create_payment_intent(self, *, amount_minor, idempotency_key, metadata):
        for pi in self.intents.values():
            if pi["_idempotency_key"] == idempotency_key:
                return pi
        pid = f"pi_test_{self._next_id}"
        self._next_id += 1
        pi = {
            "id": pid,
            "client_secret": f"{pid}_secret_test",
            "amount": amount_minor,
            "amount_received": 0,
            "currency": "aed",
            "status": "requires_payment_method",
            "metadata": dict(metadata),
            "_idempotency_key": idempotency_key,
        }
        self.intents[pid] = pi
        return pi

    def retrieve_payment_intent(self, payment_intent_id):
        if payment_intent_id not in self.intents:
            raise payments.PaymentError(f"No such payment_intent: {payment_intent_id}")
        return self.intents[payment_intent_id]

    def mark_succeeded(self, payment_intent_id, amount_override=None):
        pi = self.intents[payment_intent_id]
        pi["status"] = "succeeded"
        pi["amount_received"] = pi["amount"] if amount_override is None else amount_override
        return pi

    def mark_declined(self, payment_intent_id):
        pi = self.intents[payment_intent_id]
        pi["status"] = "requires_payment_method"
        return pi

    def mark_canceled(self, payment_intent_id):
        pi = self.intents[payment_intent_id]
        pi["status"] = "canceled"
        return pi

    def event_for(self, payment_intent_id, event_type="payment_intent.succeeded"):
        return {"type": event_type, "data": {"object": self.intents[payment_intent_id]}}


@pytest.fixture()
def client(tmp_path, monkeypatch):
    """A TestClient backed by a brand-new, isolated SQLite file per test."""
    monkeypatch.setattr(db_module, "SQLITE_PATH", tmp_path / "test.db")
    app_module.init_db()
    with TestClient(app_module.app) as c:
        yield c


@pytest.fixture()
def gateway(monkeypatch):
    fake = FakeGateway()
    monkeypatch.setattr(payments, "stripe_configured", lambda: True)
    monkeypatch.setattr(payments, "create_payment_intent", fake.create_payment_intent)
    monkeypatch.setattr(payments, "retrieve_payment_intent", fake.retrieve_payment_intent)
    return fake


def db_conn():
    return app_module.db()


def product_id(name: str) -> int:
    conn = db_conn()
    row = conn.execute("SELECT id FROM products WHERE name=?", (name,)).fetchone()
    conn.close()
    assert row, f"seed product {name!r} not found"
    return row["id"]


def order_count() -> int:
    conn = db_conn()
    n = conn.execute("SELECT COUNT(*) FROM orders").fetchone()[0]
    conn.close()
    return n
