"""Shop-terminal timestamp regression tests (timezone-naive server timestamp
misparsed as local time on non-UTC browsers).

BUG: order created_at is stored server-side as a timezone-naive string —
Python's `datetime.now().isoformat(timespec="seconds")` on a Railway
container running in UTC, e.g. "2026-08-23T13:14:58" (UTC wall-clock, but
with no trailing "Z" or UTC offset). templates/branch.html's secondsAgo(ts)
did `new Date(ts)` directly. Per the ECMAScript Date Time String Format
spec, a date-time string with NO timezone marker is parsed as LOCAL
browser time, not UTC. On a UAE browser (Asia/Dubai, UTC+4), the string
"13:14:58" gets read as 13:14:58 *UAE-local* — whose UTC-equivalent
instant is 4 hours (14400s) earlier than the real creation instant. Since
secondsAgo() computes `Date.now() - parsedDate`, that 4-hour error shows
up as a ~14400-second-too-large "age", which is exactly what was observed
on order #SALEH-1009 (~14410 sec immediately after creation) and which
also broke scheduleAlerts()'s 30s/60s alerts (age already >90 on arrival,
so it skipped straight to the pending-reminder path).

FIX: parseServerTimestamp(ts) appends "Z" to a timestamp only when it has
no existing zone marker, then secondsAgo()/minutesAgo() use it instead of
`new Date(ts)` directly. Verified here with a real headless Chromium
Asia/Dubai timezone context against the real branch.html page (a bug this
timezone-dependent can't be caught by a UTC-only test environment).
"""
from __future__ import annotations

import hashlib
import pathlib
import secrets
import socket
import threading
import time
from datetime import datetime, timedelta

import pytest

playwright_sync_api = pytest.importorskip("playwright.sync_api")
sync_playwright = playwright_sync_api.sync_playwright

import uvicorn

import app as app_module
import db as db_module

CHROMIUM_PATH = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"
if not pathlib.Path(CHROMIUM_PATH).exists():
    pytest.skip(f"chromium not found at {CHROMIUM_PATH}", allow_module_level=True)


def _free_port() -> int:
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    return port


@pytest.fixture(scope="module")
def live_server(tmp_path_factory):
    db_module.SQLITE_PATH = tmp_path_factory.mktemp("shop-tz") / "shop-tz.db"
    app_module.init_db()

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


def _branch_session_cookie(branch_id: int = 1) -> tuple[str, dict]:
    """Create a branch-staff user + session directly in the DB (the same
    way create_session_response() does it) and return the raw cookie
    value, bypassing the login form for test setup speed/reliability."""
    conn = app_module.db()
    now = datetime.now().isoformat(timespec="seconds")
    username = f"shop_tz_test_{secrets.token_hex(4)}"
    cur = conn.execute(
        "INSERT INTO users(username,password_hash,role,branch_id,active,created_at) VALUES(?,?,?,?,1,?)",
        (username, app_module.hash_password("test-password-not-real"), "branch", branch_id, now),
    )
    user_id = cur.lastrowid
    raw = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(raw.encode("utf-8")).hexdigest()
    expires = (datetime.now() + timedelta(days=1)).isoformat(timespec="seconds")
    conn.execute(
        "INSERT INTO sessions(token_hash,user_id,expires_at,created_at) VALUES(?,?,?,?)",
        (token_hash, user_id, expires, now),
    )
    conn.commit()
    conn.close()
    return raw, {"name": app_module.SESSION_COOKIE, "value": raw}


def _create_order_created_now(branch_id: int = 1) -> tuple[int, str]:
    """Insert an order the exact same way materialize_order_from_paid_intent()
    / create_order() do: created_at as a naive UTC isoformat string with no
    zone marker. Returns (order_id, created_at)."""
    conn = app_module.db()
    created_at = datetime.now().isoformat(timespec="seconds")
    cur = conn.execute(
        """
        INSERT INTO orders(order_no,branch_id,customer_name,mobile,car_id,pickup_type,pickup_time,scheduled_for,
            payment_method,payment_status,status,is_test,total,customer_note,created_at)
        VALUES(NULL,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        """,
        (
            branch_id, "TZ Test Customer", "+971500000000", None, "Walk-in", "ASAP", None,
            "Stripe (Test Mode)", "paid", "awaiting_acceptance", 1, 25.0, "", created_at,
        ),
    )
    order_id = cur.lastrowid
    conn.execute("UPDATE orders SET order_no=? WHERE id=?", (f"SALEH-TZ-{order_id}", order_id))
    conn.commit()
    conn.close()
    return order_id, created_at


@pytest.fixture()
def dubai_page(browser, live_server):
    context = browser.new_context(timezone_id="Asia/Dubai", viewport={"width": 1280, "height": 900})
    raw_cookie, cookie_spec = _branch_session_cookie()
    context.add_cookies(
        [
            {
                "name": cookie_spec["name"],
                "value": cookie_spec["value"],
                "url": live_server,
            }
        ]
    )
    pg = context.new_page()
    errors: list[str] = []
    pg.on("pageerror", lambda exc: errors.append(str(exc)))
    pg.js_errors = errors
    yield pg
    context.close()


def test_new_uae_order_shows_near_zero_seconds_not_14400(dubai_page, live_server):
    """This is the exact reported bug: a brand-new order, viewed from a
    UAE (Asia/Dubai, UTC+4) browser, must show an age near 0 seconds, not
    ~14400 seconds (~4 hours) from the timezone misparse."""
    order_id, created_at = _create_order_created_now()
    dubai_page.goto(live_server + "/branch/1")
    dubai_page.wait_for_selector(".order-clock", timeout=5000)
    card = dubai_page.locator(".shop-order", has_text=f"#SALEH-TZ-{order_id}")
    clock_text = card.locator(".order-clock").inner_text()
    assert "sec" in clock_text
    seconds = int("".join(ch for ch in clock_text if ch.isdigit()))
    # Generous bound for test/CI slowness, but nowhere near the ~14400s bug value.
    assert seconds < 30, f"expected a near-zero age for a brand-new order, got {clock_text!r} (created_at={created_at!r})"
    assert dubai_page.js_errors == []


def test_old_order_still_shows_its_real_elapsed_age_in_dubai(dubai_page, live_server):
    """An order genuinely created 5 minutes ago must still show ~5 minutes
    old, not 0 and not offset by another 4 hours — the fix must only
    normalize the missing zone marker, not change what the timestamp means."""
    conn = app_module.db()
    five_min_ago = (datetime.now() - timedelta(minutes=5)).isoformat(timespec="seconds")
    cur = conn.execute(
        """
        INSERT INTO orders(order_no,branch_id,customer_name,mobile,car_id,pickup_type,pickup_time,scheduled_for,
            payment_method,payment_status,status,is_test,total,customer_note,created_at)
        VALUES(NULL,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        """,
        (1, "Old Order Customer", "+971500000001", None, "Walk-in", "ASAP", None,
         "Stripe (Test Mode)", "paid", "awaiting_acceptance", 1, 25.0, "", five_min_ago),
    )
    order_id = cur.lastrowid
    conn.execute("UPDATE orders SET order_no=? WHERE id=?", (f"SALEH-TZ-OLD-{order_id}", order_id))
    conn.commit()
    conn.close()

    dubai_page.goto(live_server + "/branch/1")
    dubai_page.wait_for_selector(".order-clock", timeout=5000)
    # minutesAgo() is used once an order is displayed via the "min" clock
    # for anything not using the sec-precision awaiting-decision badge;
    # read it back through the page's own helper directly for a precise,
    # deterministic assertion instead of parsing rendered text.
    minutes = dubai_page.evaluate(f"minutesAgo('{five_min_ago}')")
    assert 4 <= minutes <= 6, f"expected ~5 minutes elapsed, got {minutes} (created_at={five_min_ago!r})"


def test_parse_server_timestamp_treats_naive_string_as_utc_in_dubai(dubai_page, live_server):
    """Direct check of the parsing helper itself, independent of rendering,
    covering both the naive case and the already-zoned case (Z / +HH:MM),
    in a real Asia/Dubai browser context."""
    dubai_page.goto(live_server + "/branch/1")
    dubai_page.wait_for_selector(".order-clock", timeout=5000)

    now_utc_naive = datetime.utcnow().isoformat(timespec="seconds")
    age_from_naive = dubai_page.evaluate(f"secondsAgo('{now_utc_naive}')")
    assert age_from_naive < 30, f"naive UTC timestamp misparsed as local time: secondsAgo={age_from_naive}"

    now_utc_zoned = datetime.utcnow().isoformat(timespec="seconds") + "Z"
    age_from_zoned = dubai_page.evaluate(f"secondsAgo('{now_utc_zoned}')")
    assert age_from_zoned < 30, f"already-Z-marked timestamp should also parse correctly: secondsAgo={age_from_zoned}"

    now_utc_offset = datetime.utcnow().isoformat(timespec="seconds") + "+00:00"
    age_from_offset = dubai_page.evaluate(f"secondsAgo('{now_utc_offset}')")
    assert age_from_offset < 30, f"explicit +00:00 offset should also parse correctly: secondsAgo={age_from_offset}"


def test_scheduled_alerts_are_not_immediately_in_pending_state_for_new_uae_order(dubai_page, live_server):
    """scheduleAlerts() computes age=secondsAgo(created_at) and only jumps
    straight to the 90s pending-reminder path when age>=90. Before the fix,
    a brand-new UAE order had age~=14400, so it always skipped the 30s/60s
    alerts. After the fix, age must be small enough that the 30s/60s timers
    are the ones that get scheduled instead."""
    order_id, created_at = _create_order_created_now()
    dubai_page.goto(live_server + "/branch/1")
    dubai_page.wait_for_selector(".order-clock", timeout=5000)
    age = dubai_page.evaluate(f"secondsAgo('{created_at}')")
    assert age < 90, f"age={age}s must be under 90s for a brand-new order so 30s/60s alerts are scheduled, not skipped"
