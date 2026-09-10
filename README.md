# SupportDesk CRM 

A full-stack customer support ticketing CRM built with **Python + FastAPI + SQLite + HTML/CSS/Vanilla JavaScript**.

## Features

- Create support tickets with customer name, email, subject and description
- Automatic ticket IDs (`TKT-001`, `TKT-002`, ...)
- Ticket list with status and timestamps
- Live search across ticket ID, customer name, email, subject and description
- Filter by Open / In Progress / Closed
- Ticket detail page
- Update ticket status
- Add notes/comments
- Responsive, professional UI
- Dashboard statistics for total/open/in-progress/closed tickets
- REST API with validation and useful HTTP errors
- SQLite database with exactly two tables: `tickets` and `notes`

## Tech stack

- Backend: FastAPI
- Database: SQLite using Python's built-in `sqlite3`
- Frontend: HTML, CSS and Vanilla JavaScript
- Server: Uvicorn

Using vanilla JavaScript keeps the deployment simple and avoids a separate Node.js build step. The browser communicates with the FastAPI REST API.

## Project structure

```text
support-crm-datastraw/
├── app/
│   ├── main.py
│   └── static/
│       ├── index.html
│       ├── app.js
│       └── styles.css
├── data/
│   └── .gitkeep
├── .env.example
├── .gitignore
├── requirements.txt
└── README.md
```

## Installation

### 1. Create a virtual environment

Windows PowerShell:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

Windows CMD:

```cmd
python -m venv .venv
.venv\Scripts\activate
```

macOS/Linux:

```bash
python3 -m venv .venv
source .venv/bin/activate
```

### 2. Install dependencies

```bash
pip install -r requirements.txt
```

### 3. Run locally

```bash
uvicorn app.main:app --reload
```

Open:

```text
http://127.0.0.1:8000
```

API documentation:

```text
http://127.0.0.1:8000/docs
```

The SQLite database is created automatically on first run.

## API

### Create ticket

`POST /api/tickets`

```json
{
  "customer_name": "Aarav Mehta",
  "customer_email": "aarav@example.com",
  "subject": "Order has not arrived",
  "description": "My order was expected yesterday but has not arrived."
}
```

### List/search/filter tickets

`GET /api/tickets`

Optional query parameters:

- `status=Open`
- `status=In Progress`
- `status=Closed`
- `search=aarav`

Search checks ticket ID, customer name, email, subject and description.

### Get ticket

`GET /api/tickets/{ticket_id}`

### Update ticket

`PUT /api/tickets/{ticket_id}`

```json
{
  "status": "In Progress",
  "notes": "Checked the order tracking information."
}
```

`notes` can be an empty string when only changing status.

## Deployment

The app is designed to deploy easily to Railway or any service that can run a Python web process.

Production start command:

```bash
uvicorn app.main:app --host 0.0.0.0 --port $PORT
```

For a persistent SQLite database, use a persistent volume mounted to `/app/data` on the hosting platform. For a production system with multiple instances, PostgreSQL would be a better database choice.

## Design decisions

1. **FastAPI** provides a small, typed REST API and automatic API documentation.
2. **SQLite** matches the assessment's simple two-table requirement and removes database setup overhead.
3. **Vanilla JavaScript** avoids a frontend build pipeline, making the application easy to run and deploy within the 2–3 day assignment window.
4. **Notes are stored separately** so ticket history can grow without modifying the main ticket record.
5. The dashboard statistics are calculated from the ticket list to give support staff an immediate workload overview without adding unnecessary schema complexity.

- **Live Application:** https://web-production-d3849.up.railway.app/
