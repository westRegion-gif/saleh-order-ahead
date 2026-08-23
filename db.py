"""Data access layer for Saleh Order Ahead.

Uses PostgreSQL when DATABASE_URL is set (Railway production), and falls
back to a local SQLite file otherwise (development / rollback safety).
Callers use the same sqlite3-style API (`?` placeholders, dict-like rows,
`cursor.lastrowid`) regardless of which engine is active.
"""
from __future__ import annotations

import os
import re
import sqlite3
from pathlib import Path
from typing import Any, Sequence

BASE = Path(__file__).resolve().parent
SQLITE_PATH = BASE / "saleh.db"

DATABASE_URL = os.getenv("DATABASE_URL", "").strip()
USE_POSTGRES = DATABASE_URL.lower().startswith(("postgres://", "postgresql://"))
BACKEND = "postgres" if USE_POSTGRES else "sqlite"

if USE_POSTGRES:
    import psycopg

    IntegrityError = psycopg.IntegrityError
else:
    IntegrityError = sqlite3.IntegrityError


class Row(dict):
    """Dict row that also supports SQLite-style positional indexing."""

    def __getitem__(self, key):
        if isinstance(key, int):
            return list(self.values())[key]
        return super().__getitem__(key)


_TABLES_WITH_ID = (
    "users", "orders", "inventory", "inventory_adjustments", "products",
    "branches", "order_items", "customer_profiles", "customer_cars",
    "checkout_drafts",
)
_ID_INSERT_RE = re.compile(
    r"^\s*INSERT\s+INTO\s+(" + "|".join(_TABLES_WITH_ID) + r")\b", re.I
)


def _translate(sql: str) -> str:
    s = sql.strip()
    if s.upper().startswith("PRAGMA"):
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

    def _wrap(self, row):
        return None if row is None else Row(row)

    def fetchone(self):
        row = None if self._cursor is None else self._cursor.fetchone()
        return self._wrap(row)

    def fetchall(self):
        rows = [] if self._cursor is None else self._cursor.fetchall()
        return [Row(r) for r in rows]

    def __iter__(self):
        return iter(self.fetchall())


class PGConnection:
    """Adapts a psycopg connection to the small sqlite3-style surface app.py uses."""

    def __init__(self):
        from psycopg.rows import dict_row

        self._conn = psycopg.connect(DATABASE_URL, row_factory=dict_row)
        self.row_factory = None  # kept for interface parity; unused on this path

    def execute(self, sql: str, args: Sequence[Any] = ()):
        q = _translate(sql)
        if not q:
            return PGCursor()
        m = _ID_INSERT_RE.match(q)
        if m and " RETURNING " not in q.upper():
            q = q.rstrip().rstrip(";") + " RETURNING id"
            cur = self._conn.execute(q, args)
            row = cur.fetchone()
            return PGCursor(None, row["id"] if row else None)
        return PGCursor(self._conn.execute(q, args))

    def executemany(self, sql: str, seq: Sequence[Sequence[Any]]):
        q = _translate(sql)
        if not q:
            return PGCursor()
        cur = self._conn.cursor()
        cur.executemany(q, seq)
        return PGCursor(cur)

    def executescript(self, script: str):
        for statement in script.split(";"):
            q = _translate(statement)
            if q:
                self._conn.execute(q)
        return PGCursor()

    def commit(self):
        self._conn.commit()

    def rollback(self):
        self._conn.rollback()

    def close(self):
        self._conn.close()


class SQLiteConnection:
    """Thin passthrough so both backends share the same call sites."""

    def __init__(self):
        self._conn = sqlite3.connect(SQLITE_PATH)
        self._conn.row_factory = sqlite3.Row
        self._conn.execute("PRAGMA foreign_keys = ON")

    def execute(self, sql: str, args: Sequence[Any] = ()):
        return self._conn.execute(sql, args)

    def executemany(self, sql: str, seq: Sequence[Sequence[Any]]):
        return self._conn.executemany(sql, seq)

    def executescript(self, script: str):
        return self._conn.executescript(script)

    def commit(self):
        self._conn.commit()

    def rollback(self):
        self._conn.rollback()

    def close(self):
        self._conn.close()


def get_conn():
    """Return a new connection using whichever backend is configured."""
    return PGConnection() if USE_POSTGRES else SQLiteConnection()


def ensure_column(conn, table: str, column: str, coldef: str) -> None:
    """Additive, idempotent column migration. Never drops or rewrites data."""
    if USE_POSTGRES:
        conn.execute(f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {column} {coldef}")
        return
    try:
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {coldef}")
    except sqlite3.OperationalError as exc:
        if "duplicate column" not in str(exc).lower():
            raise
