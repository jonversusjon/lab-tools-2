# Flow Panel Designer

Full-stack flow cytometry panel designer. Configure instruments, manage antibody/fluorophore inventories, design multi-color panels, and monitor spectral spillover in real time.

## Quick Start

### Backend

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload
```

The backend starts on `http://localhost:8000`. Seed data loads automatically on first run when the database is empty.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

The frontend starts on `http://localhost:5173` and proxies API requests to the backend.

## Stack

- **Backend:** Python 3.11+, FastAPI, SQLAlchemy 2.x, SQLite
- **Frontend:** Vite, React 18, TypeScript, Tailwind CSS 3, TanStack Query v5, Chart.js

## Tests

```bash
# Backend
cd backend && pytest tests/ -v

# Frontend
cd frontend && npx vitest run && npx tsc --noEmit
```
