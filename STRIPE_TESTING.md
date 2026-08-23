# Stripe TEST MODE Checkout

This deployment integrates Stripe **in TEST MODE only**. `payments.py` refuses to
start if `STRIPE_SECRET_KEY` or `STRIPE_PUBLISHABLE_KEY` is anything other than a
`sk_test_...` / `pk_test_...` key pair, so a live key can never be used by accident.

## Architecture

```
customer checkout
   -> POST /api/checkout/draft            (server prices everything, integer fils)
   -> POST /api/checkout/draft/{token}/intent   (creates a Stripe PaymentIntent)
   -> Stripe.js Payment Element confirms the card on the client
   -> POST /api/checkout/confirm          (synchronous verification + order creation)

Stripe also calls:
   -> POST /api/stripe/webhook            (payment_intent.succeeded / .payment_failed / .canceled)
```

Both `/api/checkout/confirm` and `/api/stripe/webhook` call the exact same
`materialize_order_from_paid_intent()` function in `app.py`. Whichever request
arrives first creates the real order and returns `is_new=True`; the other gets
`is_new=False` back for the same, already-created order. Callers only broadcast
the `order_created` WebSocket event to the Shop when `is_new` is `True`, so a
duplicate webhook delivery or the webhook and synchronous confirm racing each
other can never send the Shop two notifications for one order. An order is
only ever created after the server independently re-verifies with Stripe that
the PaymentIntent status is `succeeded` and that the amount/currency match
what the checkout draft was priced at.

`payment_intent.payment_failed` and `payment_intent.canceled` never create an
order — both are handled by `_mark_draft_payment_state()`, which only updates
the matching `checkout_drafts.status` (`payment_failed` / `canceled`) for
audit/cleanup. The synchronous confirm path applies the same status update
when it independently observes those PaymentIntent states.

## Required Railway environment variables

| Variable | Where to get it | Notes |
|---|---|---|
| `STRIPE_SECRET_KEY` | Stripe Dashboard → Developers → API keys (**Test mode** toggle on) | Must start with `sk_test_`. Server-side only, never sent to the client. |
| `STRIPE_PUBLISHABLE_KEY` | Same page as above | Must start with `pk_test_`. Safe to expose to the browser — served from `GET /api/checkout/config`. |
| `STRIPE_WEBHOOK_SECRET` | Stripe Dashboard → Developers → Webhooks → your endpoint → Signing secret | Starts with `whsec_`. Used only to verify webhook signatures. |

Set these as Railway service variables (never commit them to the repo).
Existing variables (`DATABASE_URL`, etc.) are unaffected.

## Stripe webhook endpoint

Exact URL to register in the Stripe Dashboard (Developers → Webhooks → Add endpoint):

```
https://YOUR-RAILWAY-DOMAIN/api/stripe/webhook
```

### Required events

Subscribe the endpoint to all three of:

- `payment_intent.succeeded` — triggers `materialize_order_from_paid_intent()`;
  creates the real order (only once — see idempotency note above).
- `payment_intent.payment_failed` — records `checkout_drafts.status='payment_failed'`
  for audit/cleanup. **Never creates an order.**
- `payment_intent.canceled` — records `checkout_drafts.status='canceled'` for
  audit/cleanup. **Never creates an order.**

No other events are required. Extra events can be selected without issue — the
handler acknowledges (`200 {"received": true}`) and ignores anything it doesn't
recognize.

## Testing with Stripe test cards

With `STRIPE_SECRET_KEY`/`STRIPE_PUBLISHABLE_KEY` configured, checkout on `/` uses
the Stripe Payment Element. Use any of Stripe's standard test cards, for example:

- `4242 4242 4242 4242` — succeeds
- `4000 0000 0000 9995` — declined (insufficient funds)
- `4000 0025 0000 3155` — requires authentication (3D Secure)

Any future expiry date, any 3-digit CVC, any postal code.

## What's intentionally NOT implemented yet

- **Refunds** — out of scope for this iteration.
- **Wallet / stored-balance accounting** — out of scope for this iteration.
- **Live Stripe mode** — hard-blocked at startup; do not attempt to enable it here.

## Revenue reporting

Every order created through this Stripe integration is stored with `is_test=1`
and `payment_method='Stripe (Test Mode)'`, so it is automatically excluded from
`/api/reports`, `/report`, and `/api/reports.csv` (all of which already filter on
`is_test=0`), the same way existing "Test Payment" orders are excluded today.
