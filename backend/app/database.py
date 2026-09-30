from __future__ import annotations

import sqlite3
from contextlib import contextmanager
import os
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock
from typing import Any

DB_PATH = Path(os.getenv('SHELTER_OPERATIONS_DB',str(Path(__file__).resolve().parents[1] / 'data' / ('sandbox-operations.db' if os.getenv('SHELTER_AUTH_MODE')=='simulation' else 'operations.db'))))
_DB_LOCK = Lock()


@contextmanager
def _connection():
    conn=sqlite3.connect(DB_PATH)
    try:
        with conn:
            yield conn
    finally:
        conn.close()


def _utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _columns(conn: sqlite3.Connection, table: str) -> set[str]:
    return {
        str(row[1])
        for row in conn.execute(f"PRAGMA table_info({table})").fetchall()
    }


def _add_column_if_missing(
    conn: sqlite3.Connection,
    table: str,
    column: str,
    definition: str,
) -> None:
    if column not in _columns(conn, table):
        conn.execute(
            f"ALTER TABLE {table} ADD COLUMN {column} {definition}"
        )


def init_db() -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)

    with _DB_LOCK, _connection() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS alerts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                camera_id TEXT NOT NULL,
                title TEXT NOT NULL,
                severity TEXT NOT NULL,
                confidence REAL NOT NULL,
                details TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                status TEXT NOT NULL DEFAULT 'Open',
                officer_note TEXT DEFAULT ''
            )
            """
        )

        # Safe migration for databases created by the earlier prototype.
        _add_column_if_missing(conn, "alerts", "reviewed_by", "TEXT DEFAULT ''")
        _add_column_if_missing(conn, "alerts", "reviewed_at", "TEXT DEFAULT ''")
        _add_column_if_missing(conn, "alerts", "dismissal_reason", "TEXT DEFAULT ''")
        _add_column_if_missing(conn, "alerts", "category", "TEXT DEFAULT ''")
        _add_column_if_missing(conn, "alerts", "action_taken", "TEXT DEFAULT ''")

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS incidents (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                source_alert_id INTEGER NOT NULL UNIQUE,
                camera_id TEXT NOT NULL,
                title TEXT NOT NULL,
                category TEXT NOT NULL,
                severity TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'Active',
                verified_by TEXT NOT NULL,
                verified_at TEXT NOT NULL,
                action_taken TEXT DEFAULT '',
                note TEXT DEFAULT '',
                resolved_by TEXT DEFAULT '',
                resolved_at TEXT DEFAULT '',
                resolution_note TEXT DEFAULT '',
                FOREIGN KEY(source_alert_id) REFERENCES alerts(id)
            )
            """
        )

        conn.commit()


def create_alert(
    camera_id: str,
    title: str,
    severity: str,
    confidence: float,
    details: str,
) -> int:
    with _DB_LOCK, _connection() as conn:
        cursor = conn.execute(
            """
            INSERT INTO alerts(camera_id, title, severity, confidence, details)
            VALUES (?, ?, ?, ?, ?)
            """,
            (camera_id, title, severity, confidence, details),
        )
        conn.commit()
        return int(cursor.lastrowid)


def list_alerts(limit: int = 50) -> list[dict[str, Any]]:
    with _DB_LOCK, _connection() as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            "SELECT * FROM alerts ORDER BY id DESC LIMIT ?",
            (limit,),
        ).fetchall()
        return [dict(row) for row in rows]


def get_alert(alert_id: int) -> dict[str, Any] | None:
    with _DB_LOCK, _connection() as conn:
        conn.row_factory = sqlite3.Row
        row = conn.execute(
            "SELECT * FROM alerts WHERE id = ?",
            (alert_id,),
        ).fetchone()
        return dict(row) if row else None


def begin_review(alert_id: int, officer: str) -> bool:
    with _DB_LOCK, _connection() as conn:
        cursor = conn.execute(
            """
            UPDATE alerts
            SET status = 'Under Review',
                reviewed_by = ?,
                reviewed_at = ?
            WHERE id = ? AND status = 'Open'
            """,
            (officer, _utc_now(), alert_id),
        )
        conn.commit()
        return cursor.rowcount > 0


def verify_alert(
    alert_id: int,
    officer: str,
    category: str,
    action_taken: str,
    note: str,
) -> int | None:
    with _DB_LOCK, _connection() as conn:
        conn.row_factory = sqlite3.Row
        alert = conn.execute(
            "SELECT * FROM alerts WHERE id = ?",
            (alert_id,),
        ).fetchone()

        if alert is None:
            return None

        verified_at = _utc_now()

        conn.execute(
            """
            UPDATE alerts
            SET status = 'Verified',
                reviewed_by = ?,
                reviewed_at = ?,
                category = ?,
                action_taken = ?,
                officer_note = ?
            WHERE id = ?
            """,
            (
                officer,
                verified_at,
                category,
                action_taken,
                note,
                alert_id,
            ),
        )

        existing = conn.execute(
            "SELECT id FROM incidents WHERE source_alert_id = ?",
            (alert_id,),
        ).fetchone()

        if existing:
            incident_id = int(existing["id"])
        else:
            cursor = conn.execute(
                """
                INSERT INTO incidents(
                    source_alert_id,
                    camera_id,
                    title,
                    category,
                    severity,
                    verified_by,
                    verified_at,
                    action_taken,
                    note
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    alert_id,
                    alert["camera_id"],
                    alert["title"],
                    category,
                    alert["severity"],
                    officer,
                    verified_at,
                    action_taken,
                    note,
                ),
            )
            incident_id = int(cursor.lastrowid)

        conn.commit()
        return incident_id


def dismiss_alert(
    alert_id: int,
    officer: str,
    reason: str,
    note: str,
) -> bool:
    with _DB_LOCK, _connection() as conn:
        cursor = conn.execute(
            """
            UPDATE alerts
            SET status = 'Dismissed',
                reviewed_by = ?,
                reviewed_at = ?,
                dismissal_reason = ?,
                officer_note = ?
            WHERE id = ?
            """,
            (officer, _utc_now(), reason, note, alert_id),
        )
        conn.commit()
        return cursor.rowcount > 0


def list_incidents(limit: int = 100) -> list[dict[str, Any]]:
    with _DB_LOCK, _connection() as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            "SELECT * FROM incidents ORDER BY id DESC LIMIT ?",
            (limit,),
        ).fetchall()
        return [dict(row) for row in rows]


def resolve_incident(
    incident_id: int,
    officer: str,
    resolution_note: str,
) -> bool:
    with _DB_LOCK, _connection() as conn:
        cursor = conn.execute(
            """
            UPDATE incidents
            SET status = 'Resolved',
                resolved_by = ?,
                resolved_at = ?,
                resolution_note = ?
            WHERE id = ?
            """,
            (officer, _utc_now(), resolution_note, incident_id),
        )
        conn.commit()
        return cursor.rowcount > 0


def resolve_alert(alert_id: int, status: str, officer_note: str = "") -> bool:
    """Backward-compatible endpoint used by older frontend builds."""
    with _DB_LOCK, _connection() as conn:
        cursor = conn.execute(
            "UPDATE alerts SET status = ?, officer_note = ? WHERE id = ?",
            (status, officer_note, alert_id),
        )
        conn.commit()
        return cursor.rowcount > 0
