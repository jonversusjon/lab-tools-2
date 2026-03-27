# Flow Panel Designer

A full-stack flow cytometry panel designer for building and optimizing fluorescence panels. Supports pre-conjugated and unconjugated antibodies, real-time spillover matrix calculation, spectra visualization, and FPbase integration.

## Setup

### Backend (Python 3.11+)

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload
```

The backend runs on `http://localhost:8000`. On first start, seed data loads automatically (48 fluorophores, 1 instrument, 10 antibodies).

### Frontend (Node 18+)

```bash
cd frontend
npm install
npm run dev
```

The frontend runs on `http://localhost:5173` and proxies API requests to the backend.

## Running Tests

```bash
# Backend
cd backend && pytest tests/ -v --tb=short

# Frontend
cd frontend && npx vitest run

# TypeScript type-check
cd frontend && npx tsc --noEmit
```

## Seed Data

Seed data loads automatically when the database is empty:

- **48 fluorophores** with Gaussian-approximation spectra (excitation + emission curves)
- **1 instrument** (BD FACSAria III) with 5 lasers and 18 detectors
- **10 antibodies** (all unconjugated) covering common surface markers

To reset, delete `backend/panels.db` and restart the backend.

## FPbase Integration

Additional fluorophores can be fetched from FPbase in real-time via the Fluorophore Library page. Fetched fluorophores include real spectra data and are stored permanently in the local database. Use the "Fetch from FPbase" button to browse and import fluorophores.

## Real Spectra Data

The seed fluorophores use Gaussian approximations. To replace them with real FPbase spectra:

```bash
python resources/fetch_seed_spectra.py
```

This fetches real excitation/emission curves from FPbase and updates the seed JSON files.

## Key Concepts

### Pre-conjugated vs Unconjugated Antibodies

- **Pre-conjugated** (e.g., anti-CD3-FITC): `fluorophore_id` is set. The panel designer auto-assigns and locks the fluorophore.
- **Unconjugated**: `fluorophore_id` is null. The user picks a fluorophore at panel design time.

### Panel Design Workflow

1. Create a panel and select an instrument
2. Add antibody targets (persisted immediately)
3. Assign fluorophores to detector channels
4. Review spillover matrix and spectra overlay
5. Use undo/redo (Ctrl+Z / Ctrl+Shift+Z) to iterate on assignments

Changing the instrument clears all fluorophore assignments but preserves targets. You can also copy targets to a new panel when switching instruments.

## Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md) for the full specification including data models, API endpoints, and technical details.

## Tech Stack

- **Backend**: FastAPI, SQLAlchemy 2.x, Pydantic v2, SQLite
- **Frontend**: React 18, TypeScript 5, Tailwind CSS 3, TanStack Query v5, Chart.js
- **Testing**: pytest (backend), vitest + React Testing Library (frontend)
