# Flow Panel Designer — Master Context Document

> **This file is NOT a build prompt.** It is the full project specification.
> Each phase prompt references this document. Place it at `flow-panel-designer/ARCHITECTURE.md` during Phase 1 scaffold so it lives with the code and is always available for context.

---

## Overview

Build a full-stack interactive flow cytometry panel designer. The app lets users configure cytometer instruments, manage antibody/fluorophore inventories, design multi-color panels by assigning fluorophore-conjugated antibodies to detector channels, view fluorophore spectra, and monitor spectral spillover in real time.

The app supports both **pre-conjugated antibodies** (e.g., anti-CD3-FITC, where the fluorophore is fixed) and **unconjugated/indirect staining** (where the user picks the fluorophore at panel design time).

**Stack:** Vite + React + TypeScript frontend, FastAPI + SQLite backend, bundled seed data with FPbase GraphQL integration for fetching additional fluorophore spectra on demand.

---

## Data Models (SQLAlchemy)

> **CRITICAL:** SQLite does NOT enforce foreign key constraints by default. You MUST enable them via a connection event listener in `database.py`:
> ```python
> from sqlalchemy import event
> @event.listens_for(engine, "connect")
> def set_sqlite_pragma(dbapi_connection, connection_record):
>     cursor = dbapi_connection.cursor()
>     cursor.execute("PRAGMA foreign_keys=ON")
>     cursor.close()
> ```
> Apply this in BOTH production `database.py` AND test fixtures.

> **Migration policy:** There is no migration system. SQLAlchemy `create_all()` is idempotent but does NOT alter existing tables. If you change a model, delete `panels.db` and restart. Seed data re-loads automatically when tables are empty.

**Instrument** — `id` (UUID PK as String(36)), `name` (str), `lasers` → Laser[]

**Laser** — `id` (UUID PK), `instrument_id` (FK→Instrument, ondelete CASCADE), `wavelength_nm` (int), `name` (str), `detectors` → Detector[]

**Detector** — `id` (UUID PK), `laser_id` (FK→Laser, ondelete CASCADE), `filter_midpoint` (int), `filter_width` (int), `name` (str|null). Convention: bandpass = midpoint ± width/2, so 530/30 passes 515–545 nm. Display as `{midpoint}/{width}`.

**Fluorophore** — `id` (UUID PK), `name` (str, unique), `excitation_max_nm` (int), `emission_max_nm` (int), `spectra` (JSON: `{"excitation": [[λ, intensity], ...], "emission": [[λ, intensity], ...]}`), `source` ("seed"|"fpbase"|"user")

**Antibody** — `id` (UUID PK), `target` (str), `clone` (str|null), `host` (str|null), `isotype` (str|null), `fluorophore_id` (FK→Fluorophore|null, ondelete SET NULL), `vendor` (str|null), `catalog_number` (str|null)

> **Pre-conjugated antibodies** have `fluorophore_id` set (e.g., anti-CD3-FITC). **Unconjugated antibodies** have `fluorophore_id = null` and the user picks a fluorophore at panel design time.

**Panel** — `id` (UUID PK), `name` (str), `instrument_id` (FK→Instrument|null, ondelete SET NULL), `created_at` (datetime), `updated_at` (datetime), `targets` → PanelTarget[], `assignments` → PanelAssignment[]

> **Null instrument:** `instrument_id` is nullable. Panels survive instrument deletion (they just lose their instrument reference). The UI shows a "Select an instrument" prompt when `instrument_id` is null. No assignments can be created without an instrument, but PanelTargets can exist without one.

**PanelTarget** — `id` (UUID PK), `panel_id` (FK→Panel, ondelete CASCADE), `antibody_id` (FK→Antibody, ondelete CASCADE), `sort_order` (int, default 0)

> **Why PanelTarget exists:** Users add antibody targets to a panel BEFORE assigning fluorophores. Without this model, unassigned targets would be lost on page reload (they'd only exist in client state). PanelTarget persists the "I want CD3 in this panel" intent independently of "CD3 is assigned FITC on detector 530/30."
>
> **Unique constraint:** `UniqueConstraint('panel_id', 'antibody_id', name='uq_panel_target')` — one target entry per antibody per panel.
>
> **Relationship to PanelAssignment:** A PanelTarget says "this antibody is in the panel." A PanelAssignment says "this antibody is assigned to this detector with this fluorophore." Every PanelAssignment's antibody should also exist as a PanelTarget, but a PanelTarget can exist without a PanelAssignment (unassigned target row).

**PanelAssignment** — `id` (UUID PK), `panel_id` (FK→Panel, ondelete CASCADE), `antibody_id` (FK→Antibody, ondelete CASCADE), `fluorophore_id` (FK→Fluorophore, ondelete CASCADE), `detector_id` (FK→Detector, ondelete CASCADE), `notes` (text|null)

> **Unique constraints on PanelAssignment:**
> - `UniqueConstraint('panel_id', 'antibody_id', name='uq_panel_antibody')` — one assignment per antibody per panel
> - `UniqueConstraint('panel_id', 'detector_id', name='uq_panel_detector')` — one assignment per detector per panel (each detector gets exactly one antibody)
>
> **Fluorophore selection logic:** For pre-conjugated antibodies, the panel designer should auto-select (and optionally lock) the antibody's conjugated fluorophore. For unconjugated antibodies, the user picks from compatible fluorophores in the picker. `PanelAssignment.fluorophore_id` is always the canonical fluorophore used for spillover calculations.

### Complete Foreign Key Cascade Rules

Every FK column MUST specify `ondelete`. With FK pragma enabled, missing `ondelete` defaults to RESTRICT which causes unexpected IntegrityErrors.

| FK Column | References | ondelete | Rationale |
|---|---|---|---|
| Laser.instrument_id | Instrument | CASCADE | Lasers are children of instruments |
| Detector.laser_id | Laser | CASCADE | Detectors are children of lasers |
| Antibody.fluorophore_id | Fluorophore | SET NULL | Unconjugate the antibody, don't delete it |
| Panel.instrument_id | Instrument | SET NULL | Panel survives, shows "no instrument" state |
| PanelTarget.panel_id | Panel | CASCADE | Targets belong to panels |
| PanelTarget.antibody_id | Antibody | CASCADE | Remove target if antibody deleted |
| PanelAssignment.panel_id | Panel | CASCADE | Assignments belong to panels |
| PanelAssignment.antibody_id | Antibody | CASCADE | Remove assignment if antibody deleted |
| PanelAssignment.fluorophore_id | Fluorophore | CASCADE | Remove assignment if fluorophore deleted |
| PanelAssignment.detector_id | Detector | CASCADE | Remove assignment if detector deleted |

---

## API Endpoints (all under `/api/v1/`)

> **Routing convention:** Router files define NO prefix themselves. The prefix is set exclusively in `main.py` via `app.include_router(router, prefix="/api/v1/instruments", tags=["instruments"])`. Do NOT double-prefix.

### Pagination

All list endpoints support optional pagination:
```
GET /api/v1/antibodies?skip=0&limit=50
```
Response:
```json
{
  "items": [...],
  "total": 247,
  "skip": 0,
  "limit": 50
}
```
Defaults: `skip=0`, `limit=100`. Max `limit=500`.

### Endpoints

- `GET/POST /instruments`, `GET/PUT/DELETE /instruments/{id}`
  - PUT replaces lasers/detectors entirely. **Returns 409 Conflict** if any existing detector is referenced by a PanelAssignment. User must remove those assignments first.
  - DELETE cascades to lasers and detectors. Panels referencing this instrument get `instrument_id` set to NULL.
- `GET/POST /fluorophores`, `GET /fluorophores/{id}/spectra`
- `POST /fluorophores/fetch-fpbase` — body: `{"name": "BV711"}`
- `POST /fluorophores/batch-spectra` — body: `{"ids": ["uuid1", ...]}`, returns `{fluorophore_id: {excitation: [...], emission: [...]}, ...}`. Used by panel designer for compatibility checks and spillover.
- `GET/POST /antibodies`, `GET/PUT/DELETE /antibodies/{id}`
- `GET/POST /panels`, `GET/PUT/DELETE /panels/{id}` (includes nested targets and assignments)
  - PUT: if `instrument_id` changes, the backend deletes ALL PanelAssignments (but NOT PanelTargets) for this panel in the same transaction. Do not rely on client-only cleanup.
  - `instrument_id` can be set to null (panel without instrument).
- `POST /panels/{id}/targets` — body: `{"antibody_id": "..."}`. Returns 409 if antibody already a target.
- `DELETE /panels/{id}/targets/{target_id}` — also deletes any PanelAssignment for this antibody in this panel (in one transaction).
- `POST /panels/{id}/assignments`, `DELETE /panels/{id}/assignments/{assignment_id}`
  - POST returns 409 if the antibody or detector is already assigned in this panel.
  - POST validates that the antibody is already a PanelTarget in this panel → 400 if not.

---

## Seed Data

**Instrument:** "BD FACSAria III (4-laser)"
- 405nm Violet: 450/40, 510/50, 610/20, 660/20, 710/50, 780/60
- 488nm Blue: 530/30, 695/40, 780/60
- 561nm Yellow-Green: 582/15, 610/20, 670/30, 710/50, 780/60
- 637nm Red: 670/30, 710/50, 780/60

**Fluorophores (~48):** Pre-populated from `seed_data/fluorophores.json` which ships with the project. Includes BV series, FITC, PerCP, PE + tandems, APC + tandems, full Alexa Fluor series (350–790), Alexa Fluor Plus series, viability dyes (DAPI, 7-AAD, PI, Hoechst 33342). Initial spectra are Gaussian approximations (source field mapped to "seed" during import); real spectra can be fetched per-dye via the FPbase integration.

**Antibodies (~10):** CD3, CD4, CD8, CD14, CD19, CD25, CD45, CD56, CD127, Live/Dead. All unconjugated (fluorophore_id = null) in seed data.

**Seed loading:** Atomic. Check if instruments table is empty. If so, load all three JSON files in one transaction. If any file fails to load, the entire transaction rolls back — no partial seed state.

---

## Key Technical Details

### Spectra data access strategy

The `GET /fluorophores` list endpoint excludes spectra for performance. Components that need spectra use:

1. **Single fluorophore viewer** (Phase 4): `GET /fluorophores/{id}/spectra` on demand.
2. **Panel designer** (Phases 7–8): `POST /fluorophores/batch-spectra` with all fluorophore IDs on mount, cached client-side via TanStack Query with `staleTime: 5 * 60 * 1000`. Used for `isCompatible()` checks, spillover calculation, and spectra overlay.
3. **Spillover calculation**: Receives pre-fetched spectra — never triggers its own fetch.

This avoids N+1 requests. One batch call per panel designer mount.

### Spectra interpolation (shared utility)

All spectra operations require interpolating irregular spectral data to exact wavelengths. Create a shared utility:

```typescript
// utils/spectra.ts
function interpolateAt(spectra: number[][], wavelength: number): number
```

Linear interpolation between nearest data points. Returns 0 if wavelength is outside the spectrum range. Used by `isExcitable`, `isDetectable`, AND `computeSpilloverMatrix`.

### Filter compatibility heuristic
1. **Laser excitability**: Using `interpolateAt` on excitation spectrum — intensity at laser λ ≥ 15% of peak. Fallback (no spectra): laser within ±40nm of ex max.
2. **Detector collectability**: Integral of emission over bandpass >5% of total emission integral. Fallback: em max within [midpoint - width, midpoint + width] (generous 2× window).

### Spillover calculation (client-side for live updates)
```
spillover(i → j) = ∫ emission_i(λ) × T_j(λ) dλ  /  ∫ emission_i(λ) × T_i(λ) dλ
```
T = rectangular window (1 inside bandpass, 0 outside). Diagonal = 1.0. Numerical integration at 1nm resolution using interpolated emission spectra.

**Performance:** Memoize the 1nm interpolated emission grid per fluorophore (keyed by fluorophore ID) so it's computed once, not on every matrix recalculation.

### Heatmap color scale
white (0.0) → yellow (0.1–0.2) → orange (0.3–0.5) → red (>0.5). Bold text for >0.25.

### Laser colors (for UI headers)
Violet=#8B5CF6, Blue=#3B82F6, Yellow-Green=#84CC16, Red=#EF4444, UV=#9333EA

### Spectra rendering
Use **Chart.js** (canvas-based) via `react-chartjs-2` with `chartjs-plugin-annotation` for all spectra charts. Do NOT use Recharts — SVG rendering chokes on dense spectra data (400+ points per curve). Downsample spectra to every 2nm for display.

---

## Project Structure

```
flow-panel-designer/
├── ARCHITECTURE.md          # This file
├── CLAUDE.md                # Claude Code conventions and rules
├── backend/
│   ├── main.py
│   ├── models.py
│   ├── schemas.py
│   ├── database.py          # Must include FK pragma!
│   ├── routers/             # NO prefix in router files
│   │   ├── instruments.py
│   │   ├── fluorophores.py
│   │   ├── antibodies.py
│   │   └── panels.py
│   ├── services/
│   │   ├── fpbase.py
│   │   └── spillover.py
│   ├── seed_data/
│   │   ├── fluorophores.json  # Pre-populated, ~48 entries
│   │   ├── instruments.json
│   │   └── antibodies.json
│   ├── tests/
│   │   ├── conftest.py       # Must include FK pragma!
│   │   ├── test_instruments.py
│   │   ├── test_fluorophores.py
│   │   ├── test_antibodies.py
│   │   ├── test_panels.py
│   │   ├── test_routes.py    # Endpoint path verification
│   │   └── test_spillover.py
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── api/
│   │   ├── components/
│   │   │   ├── layout/
│   │   │   ├── instruments/
│   │   │   ├── fluorophores/
│   │   │   ├── antibodies/
│   │   │   ├── panels/
│   │   │   └── spectra/
│   │   ├── hooks/
│   │   ├── utils/
│   │   │   ├── spillover.ts
│   │   │   ├── colors.ts
│   │   │   └── spectra.ts    # Must include interpolateAt!
│   │   ├── types/
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── src/__tests__/
│   ├── index.html
│   ├── tailwind.config.js
│   ├── tsconfig.json
│   ├── vite.config.ts
│   └── package.json
├── resources/
│   └── fetch_seed_spectra.py  # Run locally to get real FPbase spectra
└── README.md
```
