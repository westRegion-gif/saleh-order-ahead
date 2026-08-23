"""Stripe TEST MODE payment gateway wrapper.

Isolated from app.py and db.py so it can be unit-tested by monkeypatching
the functions below, without needing real network access or real Stripe
credentials. This module never touches the database — it only talks to
Stripe. Order materialization lives in app.py's
`materialize_order_from_paid_intent()`.

All money amounts here are integer minor units (fils; 1 AED = 100 fils).
Nothing in this module ever accepts a client-supplied amount for anything
that gets charged — amounts are computed server-side by the caller.
"""
from __future__ import annotations

import os
from decimal import Decimal, ROUND_HALF_UP
from typing import Any, Optional

import stripe

CURRENCY = "aed"

STRIPE_SECRET_KEY = os.getenv("STRIPE_SECRET_KEY", "").strip()
STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET", "").strip()
STRIPE_PUBLISHABLE_KEY = os.getenv("STRIPE_PUBLISHABLE_KEY", "").strip()

# Hard safety rail: this deployment is TEST MODE only. Refuse to boot with a
# live secret key so a misconfigured environment variable can never take a
# real payment.
if STRIPE_SECRET_KEY and not STRIPE_SECRET_KEY.startswith("sk_test_"):
    raise RuntimeError(
        "STRIPE_SECRET_KEY must be a Stripe TEST MODE secret key (starts with "
        "'sk_test_'). Live-mode keys are not permitted in this deployment."
    )
if STRIPE_PUBLISHABLE_KEY and not STRIPE_PUBLISHABLE_KEY.startswith("pk_test_"):
    raise RuntimeError(
        "STRIPE_PUBLISHABLE_KEY must be a Stripe TEST MODE publishable key "
        "(starts with 'pk_test_'). Live-mode keys are not permitted in this "
        "deployment."
    )

stripe.api_key = STRIPE_SECRET_KEY


class PaymentError(Exception):
    """Raised for any Stripe/payment failure that the caller should surface."""


class SignatureVerificationError(PaymentError):
    """Raised when a webhook payload fails signature verification."""


def stripe_configured() -> bool:
    return bool(STRIPE_SECRET_KEY)


def webhook_configured() -> bool:
    return bool(STRIPE_WEBHOOK_SECRET)


def to_minor_units(amount_major) -> int:
    """Convert an AED amount to integer fils using exact decimal arithmetic.

    Stripe money math must never go through binary float (e.g. 2.675 * 100
    == 267.49999999999994 in IEEE-754 float, which rounds down to the wrong
    fil amount). Converting via Decimal(str(amount_major)) reads the value
    the same way a human would, and quantization is exact from there.
    """
    exact = Decimal(str(amount_major))
    minor = (exact * 100).quantize(Decimal("1"), rounding=ROUND_HALF_UP)
    return int(minor)


def create_payment_intent(
    *, amount_minor: int, idempotency_key: str, metadata: dict[str, Any]
) -> stripe.PaymentIntent:
    if not stripe_configured():
        raise PaymentError("Stripe is not configured on this server (STRIPE_SECRET_KEY missing)")
    if amount_minor <= 0:
        raise PaymentError("Payment amount must be greater than zero")
    try:
        return stripe.PaymentIntent.create(
            amount=amount_minor,
            currency=CURRENCY,
            metadata=metadata,
            automatic_payment_methods={"enabled": True},
            idempotency_key=idempotency_key,
        )
    except stripe.error.StripeError as exc:
        raise PaymentError(str(exc)) from exc


def retrieve_payment_intent(payment_intent_id: str) -> stripe.PaymentIntent:
    if not stripe_configured():
        raise PaymentError("Stripe is not configured on this server (STRIPE_SECRET_KEY missing)")
    try:
        return stripe.PaymentIntent.retrieve(payment_intent_id)
    except stripe.error.StripeError as exc:
        raise PaymentError(str(exc)) from exc


def verify_webhook_signature(payload: bytes, sig_header: Optional[str]) -> stripe.Event:
    if not webhook_configured():
        raise PaymentError("Stripe webhook secret is not configured on this server")
    if not sig_header:
        raise SignatureVerificationError("Missing Stripe-Signature header")
    try:
        return stripe.Webhook.construct_event(payload, sig_header, STRIPE_WEBHOOK_SECRET)
    except (stripe.error.SignatureVerificationError, ValueError) as exc:
        raise SignatureVerificationError(str(exc)) from exc
