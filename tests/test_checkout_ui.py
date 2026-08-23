"""Browser-level regression tests for the checkout button/label DOM bug.

HOTFIX CONTEXT: resetCheckoutPaymentUI() (and the try/finally blocks in
startStripeCheckout()/submitStripePayment()) used to set
`payBtn.textContent = '...'` / `confirmPayBtn.textContent = '...'`
directly. Since those buttons contain a nested price span
(`<span id="checkoutTotal">` / `<span id="checkoutTotal2">`), setting
`.textContent` on the button wiped out the child span entirely. checkout()
calls resetCheckoutPaymentUI() and then immediately does
`$('checkoutTotal').textContent = ...` — on a destroyed span that's now
`document.getElementById(...) === null`, which throws a TypeError and
silently aborts checkout() before the overlay is ever shown. This is
exactly why "Continue to checkout" appeared to do nothing.

The fix gives each button a dedicated `<span id="...Label">` for its text
and never touches the button's own .textContent/.innerHTML again, so the
price span can never be destroyed. A second, related bug is also covered
here: handlePaymentRedirectReturn() called bare `history.replaceState(...)`,
which resolves to this page's own `function history()` (order history
helper) instead of `window.history` — now explicitly `window.history`.

This can only be caught with a real DOM, so it uses a real headless
Chromium (the one already provisioned for this environment) against a
real local uvicorn server. Both Stripe.js and the Stripe API are faked
(see FAKE_STRIPE_INIT_SCRIPT and the payments.py monkeypatches below) so
this runs fully offline, with no external network calls.
"""
from __future__ import annotations

import pathlib
import socket
import threading
import time

import pytest

playwright_sync_api = pytest.importorskip("playwright.sync_api")
sync_playwright = playwright_sync_api.sync_playwright

import uvicorn

import app as app_module
import db as db_module
import payments

CHROMIUM_PATH = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"
if not pathlib.Path(CHROMIUM_PATH).exists():
    pytest.skip(f"chromium not found at {CHROMIUM_PATH}", allow_module_level=True)

FAKE_STRIPE_INIT_SCRIPT = """
window.Stripe = function(publishableKey) {
  return {
    elements: function(opts) {
      return { create: function(type) { return { mount: function(sel) {
        var el = document.querySelector(sel);
        if (el) el.textContent = '[fake payment element]';
      } } } };
    },
    confirmPayment: async function(opts) {
      if (window.__fakeStripeOutcome === 'decline') {
        return { error: { message: 'Your card was declined.' } };
      }
      return { error: undefined };
    }
  };
};
"""


def _free_port() -> int:
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    return port


_fake_intent_counter = {"n": 0}


def _fake_create_payment_intent(*, amount_minor, idempotency_key, metadata):
    # A real Stripe PaymentIntent id is unique per intent; checkout_drafts.
    # stripe_payment_intent_id has a UNIQUE constraint, so this fake must
    # mint a fresh id per call (each "Continue to payment" click creates a
    # new draft) rather than reuse one fixed id across the whole module.
    _fake_intent_counter["n"] += 1
    n = _fake_intent_counter["n"]
    return {"id": f"pi_fake_ui_test_{n}", "client_secret": f"pi_fake_ui_test_{n}_secret_test"}


@pytest.fixture(scope="module")
def live_server(tmp_path_factory):
    db_module.SQLITE_PATH = tmp_path_factory.mktemp("ui") / "ui.db"
    app_module.init_db()

    # Fake the Stripe side server-side too: draft creation is local/real,
    # but PaymentIntent creation normally calls the real Stripe API. Fake
    # it so the whole flow works with zero external network access.
    payments.stripe_configured = lambda: True
    payments.STRIPE_PUBLISHABLE_KEY = "pk_test_fake_ui"
    payments.create_payment_intent = _fake_create_payment_intent

    port = _free_port()
    config = uvicorn.Config(app_module.app, host="127.0.0.1", port=port, log_level="warning")
    server = uvicorn.Server(config)
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    for _ in range(200):
        if server.started:
            break
        time.sleep(0.05)
    else:
        raise RuntimeError("live test server did not start in time")

    yield f"http://127.0.0.1:{port}"

    server.should_exit = True
    thread.join(timeout=5)


@pytest.fixture(scope="module")
def browser():
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=CHROMIUM_PATH, headless=True)
        yield b
        b.close()


@pytest.fixture()
def page(browser, live_server):
    context = browser.new_context(viewport={"width": 1280, "height": 900})
    context.add_init_script(FAKE_STRIPE_INIT_SCRIPT)
    pg = context.new_page()
    errors: list[str] = []
    pg.on("pageerror", lambda exc: errors.append(str(exc)))
    pg.js_errors = errors
    yield pg
    context.close()


def _open_checkout(page, base_url):
    """Load the app, pick the first branch, add the first menu item to the
    bag, open the bag, and click 'Continue to checkout'."""
    page.goto(base_url + "/")
    page.wait_for_selector("#branchList .branch-option", timeout=5000)
    page.click("#branchList .branch-option")
    page.wait_for_selector("#menu .product", timeout=5000)
    page.click("#menu .product")
    page.click("#prodOv .primary")  # Add to bag
    page.click(".bag-top")  # open the bag
    page.wait_for_selector("#cartBody .primary", timeout=3000)
    page.click("#cartBody .primary")  # Continue to checkout -> checkout()


def test_continue_to_checkout_opens_overlay_without_js_error(page, live_server):
    _open_checkout(page, live_server)
    page.wait_for_selector("#checkoutOv.show", timeout=3000)
    assert page.js_errors == []


def test_checkout_total_spans_exist_after_reset(page, live_server):
    _open_checkout(page, live_server)
    page.wait_for_selector("#checkoutOv.show", timeout=3000)
    # resetCheckoutPaymentUI() runs as part of checkout() opening the
    # overlay — both price spans must survive it.
    assert page.locator("#checkoutTotal").count() == 1
    assert page.locator("#checkoutTotal2").count() == 1
    assert page.locator("#checkoutTotal").inner_text().strip() != ""
    assert page.js_errors == []


def test_continue_to_payment_can_be_retried_without_destroying_total(page, live_server):
    _open_checkout(page, live_server)
    page.wait_for_selector("#checkoutOv.show", timeout=3000)
    total_before = page.locator("#checkoutTotal").inner_text()

    page.click("#payBtn")
    page.wait_for_selector("#payStep2:not(.hidden)", timeout=5000)
    page.click(".back-link")  # backToDetails()
    page.wait_for_selector("#payStep1:not(.hidden)", timeout=3000)
    assert page.locator("#checkoutTotal").count() == 1
    assert page.locator("#checkoutTotal").inner_text() == total_before

    # Retry the same action a second time.
    page.click("#payBtn")
    page.wait_for_selector("#payStep2:not(.hidden)", timeout=5000)
    assert page.locator("#checkoutTotal").count() == 1
    assert page.js_errors == []


def test_declined_payment_error_path_preserves_total_spans(page, live_server):
    _open_checkout(page, live_server)
    page.evaluate("window.__fakeStripeOutcome = 'decline'")
    page.wait_for_selector("#checkoutOv.show", timeout=3000)
    page.click("#payBtn")
    page.wait_for_selector("#payStep2:not(.hidden)", timeout=5000)
    total_before = page.locator("#checkoutTotal2").inner_text()

    page.click("#confirmPayBtn")
    page.wait_for_selector("#payError:not(.hidden)", timeout=5000)

    assert page.locator("#checkoutTotal2").count() == 1
    assert page.locator("#checkoutTotal2").inner_text() == total_before
    assert "declined" in page.locator("#payError").inner_text().lower()
    assert page.js_errors == []


def test_stripe_redirect_return_does_not_throw_on_history_shadowing(page, live_server):
    """handlePaymentRedirectReturn() used bare `history.replaceState(...)`,
    which resolved to this page's own history() helper (order history),
    not window.history — history().replaceState is not a function. A
    nonexistent draft_token is enough to exercise the code path; the
    important assertion is that no JS exception is thrown and the URL is
    actually cleaned up (proving window.history.replaceState ran)."""
    page.goto(live_server + "/?draft_token=nonexistent-draft&payment_intent_client_secret=fake_secret")
    page.wait_for_timeout(500)
    assert page.js_errors == []
    assert "draft_token" not in page.url
    assert "payment_intent_client_secret" not in page.url
