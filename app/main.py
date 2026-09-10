import os
import re
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, EmailStr, Field, field_validator

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(exist_ok=True)
DB_PATH = DATA_DIR / "support_crm.db"
STATIC_DIR = BASE_DIR / "app" / "static"

app = FastAPI(
    title="SupportDesk CRM API",
    version="1.0.0",
    description="Customer support ticketing CRM for the Datastraw assessment.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


@contextmanager
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db():
    with get_db() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS tickets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ticket_id TEXT UNIQUE NOT NULL,
                customer_name TEXT NOT NULL,
                customer_email TEXT NOT NULL,
                subject TEXT NOT NULL,
                description TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'Open'
                    CHECK(status IN ('Open', 'In Progress', 'Closed')),
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS notes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ticket_id TEXT NOT NULL,
                note_text TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY(ticket_id) REFERENCES tickets(ticket_id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
            CREATE INDEX IF NOT EXISTS idx_tickets_created_at ON tickets(created_at);
            CREATE INDEX IF NOT EXISTS idx_notes_ticket_id ON notes(ticket_id);
            """
        )


@app.on_event("startup")
def startup():
    init_db()


class TicketCreate(BaseModel):
    customer_name: str = Field(min_length=2, max_length=120)
    customer_email: EmailStr
    subject: str = Field(min_length=3, max_length=200)
    description: str = Field(min_length=5, max_length=5000)

    @field_validator("customer_name", "subject", "description")
    @classmethod
    def strip_text(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("This field cannot be empty.")
        return value


class TicketUpdate(BaseModel):
    status: str
    notes: str = ""

    @field_validator("status")
    @classmethod
    def validate_status(cls, value: str) -> str:
        if value not in {"Open", "In Progress", "Closed"}:
            raise ValueError("Status must be Open, In Progress, or Closed.")
        return value

    @field_validator("notes")
    @classmethod
    def clean_notes(cls, value: str) -> str:
        return value.strip()[:2000]


def next_ticket_id(conn: sqlite3.Connection) -> str:
    row = conn.execute(
        "SELECT ticket_id FROM tickets ORDER BY id DESC LIMIT 1"
    ).fetchone()

    if not row:
        return "TKT-001"

    match = re.search(r"(\d+)$", row["ticket_id"])
    number = int(match.group(1)) + 1 if match else 1
    return f"TKT-{number:03d}"


@app.get("/")
def landing_page():
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/workspace")
def workspace():
    return FileResponse(STATIC_DIR / "workspace.html")


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/api/tickets", status_code=201)
def create_ticket(ticket: TicketCreate):
    created_at = now_iso()

    with get_db() as conn:
        ticket_id = next_ticket_id(conn)
        conn.execute(
            """
            INSERT INTO tickets
            (ticket_id, customer_name, customer_email, subject, description, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, 'Open', ?, ?)
            """,
            (
                ticket_id,
                ticket.customer_name,
                str(ticket.customer_email),
                ticket.subject,
                ticket.description,
                created_at,
                created_at,
            ),
        )

    return {"ticket_id": ticket_id, "created_at": created_at}


@app.get("/api/tickets")
def list_tickets(
    status: Optional[str] = Query(default=None),
    search: Optional[str] = Query(default=None),
):
    allowed_statuses = {"Open", "In Progress", "Closed"}
    if status and status not in allowed_statuses:
        raise HTTPException(
            status_code=400,
            detail="Status must be Open, In Progress, or Closed.",
        )

    search_value = (search or "").strip().lower()

    query = """
        SELECT ticket_id, customer_name, customer_email, subject,
               description, status, created_at, updated_at
        FROM tickets
        WHERE 1 = 1
    """
    params = []

    if status:
        query += " AND status = ?"
        params.append(status)

    if search_value:
        query += """
            AND (
                LOWER(ticket_id) LIKE ?
                OR LOWER(customer_name) LIKE ?
                OR LOWER(customer_email) LIKE ?
                OR LOWER(subject) LIKE ?
                OR LOWER(description) LIKE ?
            )
        """
        pattern = f"%{search_value}%"
        params.extend([pattern] * 5)

    query += " ORDER BY datetime(created_at) DESC, id DESC"

    with get_db() as conn:
        rows = conn.execute(query, params).fetchall()

    return [dict(row) for row in rows]


@app.get("/api/tickets/{ticket_id}")
def get_ticket(ticket_id: str):
    with get_db() as conn:
        ticket = conn.execute(
            "SELECT * FROM tickets WHERE ticket_id = ?",
            (ticket_id.upper(),),
        ).fetchone()

        if not ticket:
            raise HTTPException(status_code=404, detail="Ticket not found.")

        notes = conn.execute(
            """
            SELECT id, note_text, created_at
            FROM notes
            WHERE ticket_id = ?
            ORDER BY datetime(created_at) DESC, id DESC
            """,
            (ticket["ticket_id"],),
        ).fetchall()

    result = dict(ticket)
    result["notes"] = [dict(note) for note in notes]
    return result


@app.put("/api/tickets/{ticket_id}")
def update_ticket(ticket_id: str, payload: TicketUpdate):
    ticket_id = ticket_id.upper()
    updated_at = now_iso()

    with get_db() as conn:
        existing = conn.execute(
            "SELECT ticket_id FROM tickets WHERE ticket_id = ?",
            (ticket_id,),
        ).fetchone()

        if not existing:
            raise HTTPException(status_code=404, detail="Ticket not found.")

        conn.execute(
            "UPDATE tickets SET status = ?, updated_at = ? WHERE ticket_id = ?",
            (payload.status, updated_at, ticket_id),
        )

        if payload.notes:
            conn.execute(
                """
                INSERT INTO notes (ticket_id, note_text, created_at)
                VALUES (?, ?, ?)
                """,
                (ticket_id, payload.notes, updated_at),
            )

    return {"success": True, "updated_at": updated_at}

@app.get("/")
def landing_page():
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/workspace")
def workspace():
    return FileResponse(STATIC_DIR / "workspace.html")