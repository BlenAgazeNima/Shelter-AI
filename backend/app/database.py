from __future__ import annotations

import sqlite3
from pathlib import Path
from threading import Lock
from typing import Any

DB_PATH = Path(__file__).resolve().parents[1] / "data" / "shelter.db"
_DB_LOCK = Lock()


def init_db() -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with _DB_LOCK, sqlite3.connect(DB_PATH) as conn:
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
        conn.commit()


def create_alert(
    camera_id: str,
    title: str,
    severity: str,
    confidence: float,
    details: str,
) -> int:
    with _DB_LOCK, sqlite3.connect(DB_PATH) as conn:
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
    with _DB_LOCK, sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            "SELECT * FROM alerts ORDER BY id DESC LIMIT ?", (limit,)
        ).fetchall()
        return [dict(row) for row in rows]


def resolve_alert(alert_id: int, status: str, officer_note: str = "") -> bool:
    with _DB_LOCK, sqlite3.connect(DB_PATH) as conn:
        cursor = conn.execute(
            "UPDATE alerts SET status = ?, officer_note = ? WHERE id = ?",
            (status, officer_note, alert_id),
        )
        conn.commit()
        return cursor.rowcount > 0
