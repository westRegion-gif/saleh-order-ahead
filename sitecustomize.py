"""Railway PostgreSQL compatibility for the existing SQLite-style application.

When DATABASE_URL is present, this module transparently routes sqlite3.connect()
to PostgreSQL while preserving the small DB-API surface used by app.py.
Without DATABASE_URL the app continues to use the original SQLite database.
"""
from __future__ import annotations

import os
import re
import sqlite3 as _sqlite3

_DATABASE_URL = os.getenv("DATABASE_URL", "").strip()
_REAL_CONNECT = _sqlite3.connect

if _DATABASE_URL.lower().startswith(("postgres://", "postgresql://")):
    import psycopg

    class HybridRow(dict):
        """Dictionary row that also supports SQLite-style numeric indexing."""
        def __getitem__(self, key):
            if isinstance(key, int):
                return list(self.values())[key]
            return super().__getitem__(key)

    def _row_factory(cursor):
        cols = [c.name for c in cursor.description]
        def make_row(values):
            return HybridRow(zip(cols, values))
        return make_row

    def _sql(sql: str) -> str:
        s = sql.strip()
        if s.upper().startswith("PRAGMA "):
            return ""
        s = s.replace("?", "%s")
        s = re.sub(r"\s+COLLATE\s+NOCASE", "", s, flags=re.I)
        s = re.sub(r"INTEGER\s+PRIMARY\s+KEY\s+AUTOINCREMENT", "BIGSERIAL PRIMARY KEY", s, flags=re.I)
        s = re.sub(r"\bREAL\b", "DOUBLE PRECISION", s, flags=re.I)
        return s

    class PGCursor:
        def __init__(self, cursor=None, lastrowid=None):
            self._cursor = cursor
            self.lastrowid = lastrowid

        def fetchone(self):
            return None if self._cursor is None else self._cursor.fetchone()

        def fetchall(self):
            return [] if self._cursor is None else self._cursor.fetchall()

        def __iter__(self):
            return iter([] if self._cursor is None else self._cursor)

    class PGConnection:
        def __init__(self):
            self._conn = psycopg.connect(_DATABASE_URL, row_factory=_row_factory)
            self.row_factory = _sqlite3.Row

        def execute(self, sql, args=()):
            q = _sql(sql)
            if not q:
                return PGCursor()
            # app.py expects cursor.lastrowid for single-row inserts into id tables.
            wants_id = bool(re.match(r"^\s*INSERT\s+INTO\s+(users|orders|inventory|inventory_adjustments|products|branches|order_items)\b", q, re.I))
            if wants_id and " RETURNING " not in q.upper():
                q = q.rstrip().rstrip(";") + " RETURNING id"
                cur = self._conn.execute(q, args)
                row = cur.fetchone()
                rid = row["id"] if row else None
                return PGCursor(None, rid)
            return PGCursor(self._conn.execute(q, args))

        def executemany(self, sql, seq):
            q = _sql(sql)
            if not q:
                return PGCursor()
            return PGCursor(self._conn.cursor().executemany(q, seq))

        def executescript(self, script):
            for statement in script.split(";"):
                q = _sql(statement)
                if q:
                    self._conn.execute(q)
            # Future-ready cloud schema used by accepted product roadmap.
            extras = [
                """CREATE TABLE IF NOT EXISTS customer_profiles(
                    id BIGSERIAL PRIMARY KEY, mobile TEXT UNIQUE, name TEXT,
                    email TEXT, favorite_branch_id BIGINT, created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )""",
                """CREATE TABLE IF NOT EXISTS customer_cars(
                    id BIGSERIAL PRIMARY KEY, customer_id BIGINT NOT NULL,
                    brand TEXT NOT NULL, emirate TEXT NOT NULL, plate_category TEXT,
                    plate_number TEXT NOT NULL, nickname TEXT, active INTEGER NOT NULL DEFAULT 1,
                    created_at TEXT NOT NULL
                )""",
                """CREATE TABLE IF NOT EXISTS wallet_accounts(
                    id BIGSERIAL PRIMARY KEY, customer_id BIGINT UNIQUE NOT NULL,
                    balance DOUBLE PRECISION NOT NULL DEFAULT 0, updated_at TEXT NOT NULL
                )""",
                """CREATE TABLE IF NOT EXISTS wallet_transactions(
                    id BIGSERIAL PRIMARY KEY, wallet_id BIGINT NOT NULL, order_id BIGINT,
                    amount DOUBLE PRECISION NOT NULL, transaction_type TEXT NOT NULL,
                    reference TEXT, created_at TEXT NOT NULL
                )""",
                """CREATE TABLE IF NOT EXISTS order_decisions(
                    id BIGSERIAL PRIMARY KEY, order_id BIGINT NOT NULL,
                    decision TEXT NOT NULL, reason TEXT, wallet_credit_status TEXT,
                    created_at TEXT NOT NULL
                )""",
            ]
            for q in extras:
                self._conn.execute(q)
            return PGCursor()

        def commit(self):
            self._conn.commit()

        def rollback(self):
            self._conn.rollback()

        def close(self):
            self._conn.close()

    def _connect(*args, **kwargs):
        return PGConnection()

    # Let existing app.py catch duplicate/constraint failures through sqlite3.IntegrityError.
    _sqlite3.IntegrityError = psycopg.IntegrityError
    _sqlite3.connect = _connect
