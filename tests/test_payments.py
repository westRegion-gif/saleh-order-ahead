"""Stripe TEST MODE checkout tests.

Exercises the draft -> PaymentIntent -> materialize_order_from_paid_intent
pipeline end to end against the real app.py logic, with the Stripe network
calls replaced by tests/conftest.py's FakeGateway (see the `gateway`
fixture) so nothing here needs real network access or a real Stripe key.
"""
from __future__ import annotations

import payments

from tests.conftest import db_conn, order_count, product_id


def _bag(qty=1, **overrides):
    item = {
        "product_id": product_id("Latte"),
        "qty": qty,
        "serve": "Hot",
        "size": "Large",
        "milk": "Oat Milk",
        "sweetness": "Less Sweet",
        "beans": "House Blend",
        "item_note": "no foam please",
    }
    item.update(overrides)
    return [item]


def _draft_payload(**overrides):
    payload = {
        "branch_id": 1,
        "customer_name": "Aisha",
        "mobile": "+971500000001",
        "pickup_type": "Walk-in",
        "pickup_time": "ASAP",
        "customer_note": "extra napkins",
        "items": _bag(),
    }
    payload.update(overrides)
    return payload


def _create_draft(client, **overrides):
    r = client.post("/api/checkout/draft", json=_draft_payload(**overrides))
    assert r.status_code == 200, r.text
    return r.json()


def _create_intent(client, draft_token):
    r = client.post(f"/api/checkout/draft/{draft_token}/intent")
    assert r.status_code == 200, r.text
    return r.json()


def _save_car(client, mobile="+971500000002"):
    client.post("/api/customers/profile", json={"mobile": mobile, "name": "Fatima"})
    r = client.post(
        f"/api/customers/{mobile}/cars",
        json={"brand": "Toyota", "emirate": "Abu Dhabi", "plate_category": "A", "plate_number": "12345"},
    )
    assert r.status_code == 200, r.text
    return r.json()["id"]


# ---------------------------------------------------------------------
# Pricing / integer minor units
# ---------------------------------------------------------------------

def test_draft_prices_in_integer_minor_units(client):
    draft = _create_draft(client)
    # Latte (25 AED) + Large (+4) + Oat Milk (+3) = 32 AED = 3200 fils
    assert draft["amount_minor"] == 3200
    assert isinstance(draft["amount_minor"], int)
    assert draft["currency"] == "aed"


# ---------------------------------------------------------------------
# Walk-in / Drive pickup validation
# ---------------------------------------------------------------------

def test_walkin_draft_succeeds_without_car(client):
    draft = _create_draft(client, pickup_type="Walk-in")
    assert draft["amount_minor"] > 0


def test_drive_without_car_is_rejected(client):
    r = client.post(
        "/api/checkout/draft",
        json=_draft_payload(pickup_type="Drive", car_id=None, mobile="+971500000002"),
    )
    assert r.status_code == 400
    assert "car" in r.json()["detail"].lower()


def test_drive_with_valid_car_succeeds(client):
    mobile = "+971500000002"
    car_id = _save_car(client, mobile)
    draft = _create_draft(client, pickup_type="Drive", car_id=car_id, mobile=mobile)
    assert draft["amount_minor"] > 0


def test_drive_with_another_customers_car_is_rejected(client):
    other_mobile = "+971500000099"
    car_id = _save_car(client, other_mobile)
    # A different mobile number tries to check out with someone else's car.
    r = client.post(
        "/api/checkout/draft",
        json=_draft_payload(pickup_type="Drive", car_id=car_id, mobile="+971500000003"),
    )
    assert r.status_code == 400


# ---------------------------------------------------------------------
# Customization persistence: product page -> draft -> paid order
# ---------------------------------------------------------------------

def test_customizations_survive_to_the_materialized_order(client, gateway):
    draft = _create_draft(
        client,
        items=_bag(qty=2, serve="Iced", size="Large", milk="Oat Milk", sweetness="Extra Sweet", item_note="light ice"),
    )
    intent = _create_intent(client, draft["draft_token"])
    pi_id = next(iter(gateway.intents))
    gateway.mark_succeeded(pi_id)

    r = client.post("/api/checkout/confirm", json={"draft_token": draft["draft_token"]})
    assert r.status_code == 200, r.text
    order = r.json()
    item = order["items"][0]
    assert item["qty"] == 2
    assert item["serve"] == "Iced"
    assert item["size"] == "Large"
    assert item["milk"] == "Oat Milk"
    assert item["sweetness"] == "Extra Sweet"
    assert item["item_note"] == "light ice"
    assert "stripe_payment_intent_id" not in order  # redacted from the customer-facing response
    assert order["is_test"] == 1  # Stripe TEST MODE order must never count as real revenue.

    conn = db_conn()
    row = conn.execute("SELECT stripe_payment_intent_id FROM orders WHERE id=?", (order["id"],)).fetchone()
    conn.close()
    assert row["stripe_payment_intent_id"] == pi_id  # still recorded server-side


# ---------------------------------------------------------------------
# Successful payment
# ---------------------------------------------------------------------

def test_successful_payment_creates_order_only_after_payment_succeeds(client, gateway):
    draft = _create_draft(client)
    intent = _create_intent(client, draft["draft_token"])
    pi_id = next(iter(gateway.intents))

    assert order_count() == 0  # no order yet — payment hasn't succeeded

    gateway.mark_succeeded(pi_id)
    r = client.post("/api/checkout/confirm", json={"draft_token": draft["draft_token"]})
    assert r.status_code == 200, r.text
    order = r.json()
    assert order["payment_status"] == "paid"
    assert order["status"] == "awaiting_acceptance"
    assert order_count() == 1


# ---------------------------------------------------------------------
# Declined payment
# ---------------------------------------------------------------------

def test_declined_payment_creates_no_order(client, gateway):
    draft = _create_draft(client)
    intent = _create_intent(client, draft["draft_token"])
    pi_id = next(iter(gateway.intents))

    gateway.mark_declined(pi_id)
    r = client.post("/api/checkout/confirm", json={"draft_token": draft["draft_token"]})
    assert r.status_code == 402
    assert order_count() == 0


# ---------------------------------------------------------------------
# Canceled payment
# ---------------------------------------------------------------------

def test_canceled_payment_creates_no_order(client, gateway):
    draft = _create_draft(client)
    intent = _create_intent(client, draft["draft_token"])
    pi_id = next(iter(gateway.intents))

    gateway.mark_canceled(pi_id)
    r = client.post("/api/checkout/confirm", json={"draft_token": draft["draft_token"]})
    assert r.status_code == 402
    assert order_count() == 0


# ---------------------------------------------------------------------
# Duplicate webhook delivery
# ---------------------------------------------------------------------

def test_duplicate_webhook_delivery_creates_one_order(client, gateway, monkeypatch):
    draft = _create_draft(client)
    intent = _create_intent(client, draft["draft_token"])
    pi_id = next(iter(gateway.intents))
    gateway.mark_succeeded(pi_id)
    event = gateway.event_for(pi_id)
    monkeypatch.setattr(payments, "verify_webhook_signature", lambda body, sig: event)

    r1 = client.post("/api/stripe/webhook", content=b"{}", headers={"stripe-signature": "t=1,v1=fake"})
    r2 = client.post("/api/stripe/webhook", content=b"{}", headers={"stripe-signature": "t=1,v1=fake"})
    assert r1.status_code == 200
    assert r2.status_code == 200
    assert order_count() == 1


def test_webhook_then_sync_confirm_creates_one_order(client, gateway, monkeypatch):
    """Webhook and synchronous confirmation both call
    materialize_order_from_paid_intent(); whichever lands first wins and
    the other must be a no-op, not a second order."""
    draft = _create_draft(client)
    intent = _create_intent(client, draft["draft_token"])
    pi_id = next(iter(gateway.intents))
    gateway.mark_succeeded(pi_id)
    event = gateway.event_for(pi_id)
    monkeypatch.setattr(payments, "verify_webhook_signature", lambda body, sig: event)

    webhook_resp = client.post("/api/stripe/webhook", content=b"{}", headers={"stripe-signature": "t=1,v1=fake"})
    assert webhook_resp.status_code == 200

    confirm_resp = client.post("/api/checkout/confirm", json={"draft_token": draft["draft_token"]})
    assert confirm_resp.status_code == 200
    assert order_count() == 1
    assert confirm_resp.json()["order_no"] is not None


# ---------------------------------------------------------------------
# Invalid webhook signature
# ---------------------------------------------------------------------

def test_invalid_webhook_signature_is_rejected(client, monkeypatch):
    def _raise(body, sig):
        raise payments.SignatureVerificationError("signature mismatch")

    monkeypatch.setattr(payments, "verify_webhook_signature", _raise)
    r = client.post("/api/stripe/webhook", content=b"{}", headers={"stripe-signature": "bad"})
    assert r.status_code == 400
    assert order_count() == 0


# ---------------------------------------------------------------------
# Amount tampering
# ---------------------------------------------------------------------

def test_amount_tampering_is_rejected(client, gateway):
    """Even if a Stripe PaymentIntent somehow reports a different
    amount_received than what the draft was priced at, the server must
    refuse to materialize an order rather than trust the mismatch."""
    draft = _create_draft(client)
    intent = _create_intent(client, draft["draft_token"])
    pi_id = next(iter(gateway.intents))

    # Simulate a tampered/mismatched amount (e.g. 1 fils instead of the real total).
    gateway.mark_succeeded(pi_id, amount_override=1)

    r = client.post("/api/checkout/confirm", json={"draft_token": draft["draft_token"]})
    assert r.status_code == 409
    assert order_count() == 0


def test_amount_tampering_via_webhook_is_rejected(client, gateway, monkeypatch):
    draft = _create_draft(client)
    intent = _create_intent(client, draft["draft_token"])
    pi_id = next(iter(gateway.intents))
    gateway.mark_succeeded(pi_id, amount_override=1)
    event = gateway.event_for(pi_id)
    monkeypatch.setattr(payments, "verify_webhook_signature", lambda body, sig: event)

    r = client.post("/api/stripe/webhook", content=b"{}", headers={"stripe-signature": "t=1,v1=fake"})
    assert r.status_code == 400
    assert order_count() == 0


# ---------------------------------------------------------------------
# Retry / refresh without duplicate order
# ---------------------------------------------------------------------

def test_confirm_retry_after_success_does_not_duplicate_order(client, gateway):
    draft = _create_draft(client)
    intent = _create_intent(client, draft["draft_token"])
    pi_id = next(iter(gateway.intents))
    gateway.mark_succeeded(pi_id)

    r1 = client.post("/api/checkout/confirm", json={"draft_token": draft["draft_token"]})
    r2 = client.post("/api/checkout/confirm", json={"draft_token": draft["draft_token"]})
    assert r1.status_code == 200 and r2.status_code == 200
    assert r1.json()["order_no"] == r2.json()["order_no"]
    assert order_count() == 1


def test_intent_creation_retry_reuses_same_payment_intent(client, gateway):
    draft = _create_draft(client)
    intent1 = _create_intent(client, draft["draft_token"])
    intent2 = _create_intent(client, draft["draft_token"])
    assert intent1["client_secret"] == intent2["client_secret"]
    assert len(gateway.intents) == 1


# ---------------------------------------------------------------------
# The legacy unpaid /api/orders endpoint must not exist anymore — it was
# a full bypass of "create the real order only after verified successful
# payment" (no payment step, and a weaker car-ownership check).
# ---------------------------------------------------------------------

def test_legacy_unpaid_orders_endpoint_is_gone(client):
    r = client.post("/api/orders", json=_draft_payload())
    assert r.status_code in (404, 405)
    assert order_count() == 0


# ---------------------------------------------------------------------
# Internal payment-gateway identifiers must not leak to customer-facing
# responses (order tracking, checkout confirmation).
# ---------------------------------------------------------------------

def test_stripe_payment_intent_id_not_exposed_to_customer(client, gateway):
    draft = _create_draft(client)
    intent = _create_intent(client, draft["draft_token"])
    pi_id = next(iter(gateway.intents))
    gateway.mark_succeeded(pi_id)

    confirm_resp = client.post("/api/checkout/confirm", json={"draft_token": draft["draft_token"]})
    assert confirm_resp.status_code == 200
    order = confirm_resp.json()
    assert "stripe_payment_intent_id" not in order

    track_resp = client.get(f"/api/order/{order['order_no']}")
    assert track_resp.status_code == 200
    assert "stripe_payment_intent_id" not in track_resp.json()
