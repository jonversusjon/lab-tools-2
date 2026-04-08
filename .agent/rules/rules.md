# CLAUDE.md — Lab Tools 2

## ⚠️ NEVER FORGET — Check Every File Against This List

These are the mistakes that cause the most rework. Verify every one before committing.

- [ ] **FK pragma in BOTH `database.py` AND `tests/conftest.py`** — SQLite silently ignores FK constraints without it. If your FK tests pass without it, your tests are lying.
- [ ] **`str(uuid.uuid4())` not `uuid.uuid4`** in model defaults — the bare call returns a UUID object, not a string. SQLite String(36) columns will silently store `UUID(...)` repr strings. Add `assert isinstance(model.id, str)` to model tests.
- [ ] **No prefix on router files** — prefix is ONLY in `main.py`. If routing is broken, check for accidental `APIRouter(prefix=...)` before anything else.
- [ ] **Proxy key is `/api` not `/api/v1`** — in `vite.config.ts`. The frontend calls `/api/v1/...`, the proxy strips nothing, it just forwards to port 8000.
- [ ] **`animation: false`** on ALL Chart.js chart configs — without this, spectra charts lag on every data change.
- [ ] **`pointRadius: 0`** on ALL Chart.js datasets — 400 dots on a spectra curve murders performance.
- [ ] **`chartjs-plugin-annotation`** must be in `package.json` — needed for laser lines and detector window overlays.
- [ ] **`@/` path alias** configured in BOTH `tsconfig.json` AND `vite.config.ts` AND `vitest` resolve config — tests will fail on `@/` imports if vitest doesn't know about the alias.
- [ ] **`from __future__ import annotations`** at the top of every Python file.
- [ ] **All `ondelete` rules specified** on every FK column — see Foreign Key Cascade Rules below. Missing `ondelete` with FK pragma ON = runtime IntegrityError on delete.
- [ ] **Seed data source field mapping** — `fluorophores.json` uses `"source": "gaussian_approximation"` but the model expects `"seed"|"fpbase"|"user"`. The seed loader MUST map `gaussian_approximation` → `"seed"` during import.
- [ ] **Race condition immunity** — all database writes that read-then-write MUST use a single transaction. No optimistic "check then act" patterns across separate requests. See Race Condition Policy below.
- [ ] **Mock react-chartjs-2 in vitest** — canvas isn't available in jsdom. Use: `vi.mock('react-chartjs-2', () => ({ Line: (props: any) => <canvas data-testid="chart" /> }))`
- [ ] Always run npx tsc --noEmit from inside the frontend/ directory. Running it from the project root installs the wrong tsc package.
- [ ] **PanelTarget.antibody_id is NULLABLE** — empty rows are valid placeholders. Multiple null-antibody rows are allowed.
- [ ] **PanelTarget uniqueness on (panel_id, antibody_id)** is enforced in APPLICATION CODE, not DB constraint (because antibody_id can be null).
- [ ] **SecondaryAntibody.fluorophore_id** uses `ondelete="SET NULL"` (same pattern as Antibody).
- [ ] **PanelTarget.secondary_antibody_id** uses `ondelete="SET NULL"`.
- [ ] **Indirect staining PanelAssignment** — when creating a PanelAssignment for indirect staining, COPY `fluorophore_id` from `SecondaryAntibody` — do not reference it.
- [ ] **Reorder endpoint** expects ALL target IDs for the panel — validates no missing/extra.
- [ ] **dnd-kit: `{...listeners}` on handle cell only, `{...attributes}` + `ref={setNodeRef}` on `<tr>`** — spreading both on the row breaks keyboard accessibility. The drag handle `<td>` gets `{...listeners}`, the `<tr>` gets `{...attributes}` and the ref.
- [ ] **dnd-kit: `CSS.Transform.toString(transform)`** — never build the transform string manually. Always import `CSS` from `@dnd-kit/utilities`.
- [ ] **Omnibox dropdowns need `z-50`** — table cells have `overflow: visible` but stacking context can still clip dropdowns. `z-50` on the dropdown div is mandatory.
- [ ] **Temp target IDs start with `"temp-"`** — the inline table creates local rows before backend persistence. Any handler that calls the backend MUST check `targetId.startsWith('temp-')` and skip the network call (or call `addTarget` instead of `updateTarget`) for temp rows.
- [ ] **`PanelTarget.antibody_target` and `antibody_name` hold joined fields** — tests that display antibody names in the chip must set `antibody_target` in the mock PanelTarget, NOT rely on `useAntibodies` data (the chip only reads from the target object's joined fields).
- [ ] **When mocking `useFluorophores`, always include `useToggleFluorophoreFavorite` and `useRecentFluorophores`** — `FluorophoreBrowser` calls both unconditionally; missing them crashes any test that renders the fluorophore browser.
- [ ] **Fluorophore/detector names in `PanelTargetRow` come from props, not `as any` casts** — pass `fluorophoreName: string | null` (looked up via `fluorophoreNameById`) and `detectorLabel: string | null` (from `detectorLabelMap`) from PanelDesigner. Never access `assignment.fluorophore_name` or `assignment.detector_name` — those fields don't exist on `PanelAssignment`.
- [ ] **`useRemoveTarget`, `useUpdateTarget`, `useReorderTargets` must all be mocked** in any test that renders PanelDesigner — PanelDesigner imports and calls all three.
- [ ] **PlateMap.well_data and legend are JSON text columns** — always `json.loads()` on read, `json.dumps()` on write in the router. Pydantic handles dict ↔ JSON at the API boundary but SQLAlchemy stores raw strings.
- [ ] **PlateMapEditor auto-save uses debounce + keepalive** — same pattern as InstrumentEditor. `userEdited` ref prevents saving on initial load.
- [ ] **`html2canvas-pro` not `html2canvas`** — the standard package has canvas size limits. The `-pro` fork handles larger canvases (needed for 384-well plates at scale 3).
- [ ] **PlateMap: no FK columns, no cascade rules needed** — well_data and legend are JSON text columns, no child records.
---

## Read First
Always read `ARCHITECTURE.md` before starting any work. It is the single source of truth for data models, API endpoints, seed data, and technical details.

## Project Overview
Full-stack flow cytometry panel designer. Vite+React+TS frontend, FastAPI+SQLite backend. Supports both pre-conjugated and unconjugated antibodies. Each detector gets exactly one antibody and each antibody gets exactly one detector per panel.

## Directory Structure
- `backend/` — FastAPI app (Python 3.11+)
- `frontend/` — Vite + React + TypeScript app
- `resources/` — seed data generation scripts (run locally, not in Claude Code)
- `ARCHITECTURE.md` — full project specification

## Stack & Versions
- Python: 3.11+, FastAPI, SQLAlchemy 2.x, Pydantic v2, httpx
- Node: 18+, React 18, TypeScript 5, Tailwind CSS 3, TanStack Query v5, Chart.js + react-chartjs-2 + chartjs-plugin-annotation
- Database: SQLite via SQLAlchemy
- Test: pytest (backend), vitest + @testing-library/react (frontend)
- **Do NOT use Recharts.** All charting uses Chart.js (canvas-based, fast with dense data).

## Critical Conventions

### Backend

#### SQLite FK enforcement (MANDATORY)
SQLite does NOT enforce foreign key constraints by default. Add this to `database.py`:
```python
from sqlalchemy import event

@event.listens_for(engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()
```
**Also add this to test fixtures** — the test engine needs it too.

#### UUID primary keys
All models use UUID PKs stored as `String(36)`. Default: `default=lambda: str(uuid.uuid4())`. Do NOT use `uuid.uuid4` without `str()` — that returns a UUID object, not a string.

#### Routing convention
Routers define **NO prefix**. The prefix is set in `main.py`:
```python
app.include_router(instruments.router, prefix="/api/v1/instruments", tags=["instruments"])
app.include_router(fluorophores.router, prefix="/api/v1/fluorophores", tags=["fluorophores"])
app.include_router(antibodies.router, prefix="/api/v1/antibodies", tags=["antibodies"])
app.include_router(panels.router, prefix="/api/v1/panels", tags=["panels"])
```
Do NOT double-prefix. Router endpoints use relative paths: `@router.get("/")`, `@router.get("/{id}")`.

#### Schema migration
There is none. `create_all()` is idempotent but does NOT alter existing tables. If models change, delete `panels.db` and restart. Seed data re-loads automatically when tables are empty.

#### Seed loading
In FastAPI lifespan, after `create_all()`: check if the **instruments** table is empty (not fluorophores — instruments is the smallest table and the best sentinel). If empty, load ALL THREE seed JSON files in a single transaction. If the transaction fails partway, it rolls back entirely — no partial seed state. Log counts per table after successful commit.

When loading `fluorophores.json`, map the `source` field: `"gaussian_approximation"` → `"seed"`. The model only accepts `"seed"|"fpbase"|"user"`.

#### Foreign key cascade rules (COMPLETE — every FK must have ondelete)
- Laser.instrument_id → Instrument: `ondelete="CASCADE"`
- Detector.laser_id → Laser: `ondelete="CASCADE"`
- Antibody.fluorophore_id → Fluorophore: `ondelete="SET NULL"` (clearing a fluorophore doesn't destroy antibody records)
- Panel.instrument_id → Instrument: `ondelete="SET NULL"` (panels survive instrument deletion; UI shows "No instrument selected" state)
- PanelAssignment.panel_id → Panel: `ondelete="CASCADE"`
- PanelAssignment.antibody_id → Antibody: `ondelete="CASCADE"` (deleting an antibody removes its assignments)
- PanelAssignment.fluorophore_id → Fluorophore: `ondelete="CASCADE"` (deleting a fluorophore removes assignments using it)
- PanelAssignment.detector_id → Detector: `ondelete="CASCADE"` (deleting a detector removes assignments to it)
- PanelTarget.panel_id → Panel: `ondelete="CASCADE"`
- PanelTarget.antibody_id → Antibody: `ondelete="CASCADE"`
- PanelTarget.secondary_antibody_id → SecondaryAntibody: `ondelete="SET NULL"` (secondary can be unlinked without destroying the target row)
- SecondaryAntibody.fluorophore_id → Fluorophore: `ondelete="SET NULL"` (secondary is still valid inventory without its fluorophore)

**Every FK column MUST specify `ondelete`.** With FK pragma enabled, a missing `ondelete` defaults to RESTRICT, which will cause unexpected IntegrityErrors on delete operations.

#### PanelTarget model (target rows persist before assignment)
Users add antibody targets to a panel BEFORE assigning fluorophores. These target rows must survive page reloads. Use a dedicated model:

```python
class PanelTarget(Base):
    __tablename__ = "panel_targets"
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    panel_id = Column(String(36), ForeignKey("panels.id", ondelete="CASCADE"), nullable=False)
    antibody_id = Column(String(36), ForeignKey("antibodies.id", ondelete="CASCADE"), nullable=False)
    sort_order = Column(Integer, default=0)

    __table_args__ = (
        UniqueConstraint('panel_id', 'antibody_id', name='uq_panel_target'),
    )
```

API endpoints:
- `POST /panels/{id}/targets` — body: `{"antibody_id": "..."}`. Returns 409 if antibody already a target in this panel.
- `DELETE /panels/{id}/targets/{target_id}` — also deletes any PanelAssignment for this antibody in this panel.
- `GET /panels/{id}` — returns targets AND assignments as separate arrays.

The panel designer's `targetRows` are populated from backend PanelTargets on load. Adding a target = POST to backend. Removing a target = DELETE from backend (cascades to assignment if one exists).

#### PanelAssignment uniqueness
```python
__table_args__ = (
    UniqueConstraint('panel_id', 'antibody_id', name='uq_panel_antibody'),
    UniqueConstraint('panel_id', 'detector_id', name='uq_panel_detector'),
)
```
One antibody per panel. One antibody per detector per panel.

#### Instrument PUT safety
Before replacing lasers/detectors: check if any existing detector is referenced by a PanelAssignment. If so, return 409 Conflict. Do NOT silently orphan assignments.

#### Panel instrument change
