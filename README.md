# Flow Panel Designer

A full-stack web application for designing and optimizing multi-color flow cytometry antibody panels. Built for researchers who need to manage antibody inventories, configure cytometer instruments, assign fluorophores to detector channels, and evaluate spectral spillover — all in one place.

Supports pre-conjugated antibodies, unconjugated/indirect staining with secondary antibodies, non-fluorescent conjugates (biotin, DIG), real-time spillover matrix visualization, and FPbase integration for ~1,000+ fluorophore spectra.

## Features

**Instrument Management** — Define cytometer configurations with lasers and bandpass detectors. Favorite frequently-used instruments for quick access. Instrument configs from UCSF PFCC are included as seed data.

**Fluorophore Library** — Browse ~1,000 fluorescent proteins and organic dyes seeded from [FPbase](https://www.fpbase.org). View excitation/emission spectra, fetch additional fluorophores on demand via FPbase GraphQL, and import custom fluorophores from CSV. Gaussian fallback spectra for vendor dyes (PE, APC, etc.) that lack full spectral data.

**Antibody Inventory** — Track primary and secondary antibodies with metadata: clone, host, isotype, vendor, catalog number, dilutions (flow / ICC-IF / WB), stock status, physical location, and free-text notes. Tag antibodies for organization. Import from CSV with column mapping wizard.

**Secondary Antibody Support** — Manage secondary antibodies with species-based and conjugate-based binding modes. The panel designer surfaces compatible secondaries based on the primary antibody's host species and conjugate.

**Panel Designer** — The core workflow:
1. Create a panel and select an instrument
2. Add antibody targets (direct or indirect staining)
3. Assign fluorophores to detector channels with real-time scoring
4. Review spillover matrix heatmap and per-laser spectra overlay
5. Undo/redo support (Ctrl+Z / Ctrl+Shift+Z)

Changing instruments clears fluorophore assignments but preserves targets.

**Spillover Matrix** — Real-time spillover calculation between assigned fluorophores across all detector channels, displayed as an interactive heatmap.

**Spectra Visualization** — Per-laser spectra overlay showing excitation and emission curves with detector bandpass regions. Uses Chart.js with annotation plugin.

**Settings** — Manage reusable dropdown lists (hosts, target species, instrument locations, conjugate chemistries) via a generic ListEditor component. User preferences for default behaviors.

**Planned modules** (placeholder UI) — IF/IHC protocol management, qPCR primer library and plate designer.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, TypeScript 5, Vite 6 |
| Styling | Tailwind CSS 3 (dark mode support) |
| Data Fetching | TanStack Query v5 |
| Charts | Chart.js 4 + chartjs-plugin-annotation |
| Drag & Drop | dnd-kit |
| Routing | React Router v6 |
| Backend | FastAPI, Python 3.11+ |
| ORM | SQLAlchemy 2.x |
| Database | SQLite (panels.db) |
| Validation | Pydantic v2 |
| Testing | pytest (backend), Vitest + React Testing Library (frontend) |

## Project Structure

```
lab-tools-2/
├── backend/
│   ├── main.py              # FastAPI app, lifespan, seed data, migrations
│   ├── database.py           # SQLAlchemy engine & session
│   ├── models.py             # SQLAlchemy ORM models
│   ├── schemas.py            # Pydantic request/response schemas
│   ├── seed_data/            # JSON seed files (instruments, antibodies)
│   ├── seed_fpbase.py        # FPbase parquet → SQLite seeder
│   ├── routers/              # FastAPI route modules
│   │   ├── instruments.py
│   │   ├── fluorophores.py
│   │   ├── antibodies.py
│   │   ├── panels.py
│   │   ├── secondaries.py
│   │   ├── tags.py
│   │   ├── list_entries.py
│   │   ├── conjugate_chemistries.py
│   │   └── preferences.py
│   ├── services/             # Business logic (spectra, spillover, dilutions, CSV import)
│   └── panels.db             # SQLite database (auto-created)
├── frontend/
│   ├── src/
│   │   ├── App.tsx           # Route definitions
│   │   ├── components/
│   │   │   ├── antibodies/   # AntibodyTable, AntibodyForm, ImportWizard
│   │   │   ├── fluorophores/ # FluorophoreBrowser, FpbaseFetchModal, SpectraViewer
│   │   │   ├── instruments/  # InstrumentList, InstrumentEditor, LaserSection
│   │   │   ├── panels/       # PanelDesigner, PanelList, SpilloverHeatmap
│   │   │   ├── secondaries/  # SecondaryOmnibox
│   │   │   ├── settings/     # Settings, ListEditor
│   │   │   └── layout/       # Shell, Sidebar, Modal, Toast
│   │   ├── hooks/            # TanStack Query hooks (useAntibodies, usePanels, etc.)
│   │   ├── services/         # Client-side spectra math, spillover, fuzzy search
│   │   └── types/            # TypeScript type definitions (index.ts)
│   ├── tailwind.config.js
│   └── vite.config.ts        # Vite config with API proxy and @/ alias
├── fpbase_data/              # Pre-downloaded FPbase metadata CSV + spectra parquet
├── resources/                # Utility scripts (fetch_seed_spectra.py)
├── test_data/                # Test fixtures
├── ARCHITECTURE.md           # Full project specification
├── CLAUDE.md                 # Agent coding conventions ("NEVER FORGET" checklist)
└── FRONTEND-CONVENTIONS.md   # Frontend code style rules
```

## Setup

### Prerequisites

- Python 3.11+
- Node.js 18+

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload
```

Runs on `http://localhost:8000`. On first start, the database is created and seed data loads automatically:
- Instrument configurations (BD FACSAria III + others)
- ~1,000 fluorophores from FPbase (if `fpbase_data/` parquet files are present)
- Non-fluorescent conjugates (Biotin, HRP, AP, Digoxigenin, etc.)
- Default antibody tags, host species, and target species lists
- Default conjugate chemistries

If FPbase data files aren't present, run the downloader first:

```bash
python download_fpbase_spectra.py   # from repo root
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Runs on `http://localhost:5173`. The Vite dev server proxies `/api` requests to the backend.

## Running Tests

```bash
# Backend
cd backend && pytest tests/ -v --tb=short

# Frontend
cd frontend && npx vitest run

# TypeScript type-check only
cd frontend && npx tsc --noEmit
```

## Data Model

Core entities and their relationships:

- **Instrument** → has many **Lasers** → each has many **Detectors** (bandpass filters)
- **Fluorophore** → has many **FluorophoreSpectrum** records (wavelength/intensity points for EX, EM, AB, A_2P)
- **Antibody** → optional FK to Fluorophore (pre-conjugated), tagged via **AntibodyTag** M2M
- **SecondaryAntibody** → binding_mode (`species` or `conjugate`), optional target_conjugate, FK to Fluorophore
- **Panel** → has many **PanelTargets** (antibody + staining mode + optional secondary) and **PanelAssignments** (antibody → fluorophore → detector)
- **InstrumentView** — tracks recently viewed instruments for tiered display (favorites → recents → all)
- **ListEntry** — generic key-value lists (hosts, target species, instrument locations)
- **ConjugateChemistry** — non-fluorescent conjugate binding partners (e.g., Biotin → Streptavidin)
- **UserPreference** — key-value store for app preferences

## API Endpoints

All endpoints are under `/api/v1/`:

| Resource | Prefix | Key Operations |
|----------|--------|---------------|
| Instruments | `/instruments` | CRUD, favorite toggle, recent views |
| Fluorophores | `/fluorophores` | CRUD, FPbase fetch, CSV import, spectra |
| Antibodies | `/antibodies` | CRUD, CSV import, tag assignment, favorites |
| Panels | `/panels` | CRUD, add/remove targets, add/remove assignments |
| Secondary Antibodies | `/secondary-antibodies` | CRUD with binding mode support |
| Tags | `/tags` | CRUD for antibody tags |
| List Entries | `/list-entries` | CRUD for dropdown lists |
| Conjugate Chemistries | `/conjugate-chemistries` | CRUD |
| Preferences | `/preferences` | Get/set user preferences |

## Key Concepts

### Pre-conjugated vs. Unconjugated Antibodies

**Pre-conjugated** (e.g., anti-CD3-FITC): the antibody has a `fluorophore_id` set. The panel designer auto-assigns and locks that fluorophore to the appropriate detector.

**Unconjugated**: `fluorophore_id` is null. The researcher picks a fluorophore at panel design time, optionally via a secondary antibody for indirect detection.

### Direct vs. Indirect Staining

Each panel target specifies a `staining_mode`: `direct` (fluorophore conjugated to the primary) or `indirect` (fluorophore on a secondary antibody that binds the primary). Indirect staining supports both species-matched secondaries and conjugate-matched reagents (e.g., Streptavidin-PE for a biotinylated primary).

### Spectral Scoring

Fluorophore-to-detector scoring uses excitation efficiency (laser line vs. absorption spectrum with ~5% noise floor) and emission collection efficiency (emission spectrum integrated over the detector bandpass). Vendor dyes without full spectra use Gaussian approximations from peak wavelength values.

### Seed Data Reset

Delete `backend/panels.db` and restart the backend to re-seed from scratch.

## Development Conventions

See [FRONTEND-CONVENTIONS.md](FRONTEND-CONVENTIONS.md) for frontend code style and [CLAUDE.md](CLAUDE.md) for the agent coding checklist. Key rules:

- `@/` path alias for all imports
- Tailwind-only styling with `dark:` variants
- Chart.js for all visualizations (never Recharts)
- Functional components with plain `function` declarations (not `React.FC`)
- One import per line, no semicolon-joined statements
- TanStack Query for all server state; mutations must invalidate relevant query keys

## License

Private — not currently published under an open-source license.