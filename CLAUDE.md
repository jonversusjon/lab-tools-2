# CLAUDE.md — Flow Panel Designer

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
When `PUT /panels/{id}` changes `instrument_id`: delete ALL PanelAssignments (but NOT PanelTargets) for that panel in the same database transaction. Target rows survive instrument changes. Do not rely on client-only cleanup.

#### Panel with null instrument
`Panel.instrument_id` is nullable. A panel can exist without an instrument (e.g., after the instrument is deleted, or during initial creation). The frontend must handle this state gracefully — show "Select an instrument to begin designing" prompt. No assignments or targets can be meaningfully interacted with until an instrument is selected.

#### Race Condition Policy
All code must be immune to race conditions. Specific rules:
1. **Read-then-write in one transaction.** Any endpoint that checks a condition then writes based on it (e.g., "is this detector already assigned? if not, assign it") MUST do both in a single database transaction. No "SELECT then INSERT" across separate sessions.
2. **Unique constraints are the real guard.** Application-level checks are for user-friendly error messages. The database constraint is the source of truth. Always catch `IntegrityError` and return appropriate HTTP status codes (409 for conflicts).
3. **Seed loading is atomic.** The entire seed load (instruments + fluorophores + antibodies) happens in one transaction. If any part fails, nothing is committed.
4. **Frontend optimistic updates must handle rollback.** When the UI updates optimistically before the API responds, always handle the error path by reverting local state. Never leave the UI in a state that disagrees with the backend after an error.
5. **Panel instrument change is atomic.** Deleting all assignments and updating the instrument_id happens in one transaction. The client never sees a state where the instrument changed but old assignments still exist.

#### Pagination Convention
All list endpoints support optional pagination to handle growing datasets (200+ antibodies is common in real labs):

```
GET /api/v1/antibodies?skip=0&limit=50
```

Response format for paginated endpoints:
```json
{
  "items": [...],
  "total": 247,
  "skip": 0,
  "limit": 50
}
```

Default: `skip=0`, `limit=100`. Maximum `limit=500`. When `limit` is not provided, return up to 100 items.

Frontend TypeScript type:
```typescript
interface PaginatedResponse<T> {
  items: T[]
  total: number
  skip: number
  limit: number
}
```

Apply to: `/instruments`, `/fluorophores`, `/antibodies`, `/panels`. The `/fluorophores/{id}/spectra` endpoint returns a single object, not a list.

TanStack Query hooks should accept optional `skip`/`limit` params and include them in query keys:
```typescript
queryKey: ['antibodies', { skip, limit }]
```

#### Spectra Data Access Strategy
The `GET /fluorophores` list endpoint excludes the `spectra` JSON field for performance (spectra arrays are large). Components that need spectra data use these strategies:

1. **Single fluorophore spectra viewer** (Phase 4): Fetches via `GET /fluorophores/{id}/spectra` on demand when user clicks a row.

2. **Panel designer compatibility checks** (Phase 7): Add a batch endpoint:
   ```
   POST /api/v1/fluorophores/batch-spectra
   Body: {"ids": ["uuid1", "uuid2", ...]}
   Response: {"fluorophore_id": {"excitation": [...], "emission": [...]}, ...}
   ```
   The panel designer calls this once on mount with all fluorophore IDs from the library, then caches client-side. The `FluorophorePicker` uses this cached data for `isCompatible()` checks. TanStack Query key: `['fluorophores', 'batch-spectra']` with a long `staleTime` (5 minutes).

3. **Spillover calculation** (Phase 8): Uses the same batch-spectra cache. Only needs emission spectra for assigned fluorophores. The `computeSpilloverMatrix` function receives pre-fetched spectra — it never triggers its own fetch.

4. **Spectra overlay in panel context** (Phase 8): Filters the batch-spectra cache to just assigned fluorophore IDs.

This avoids N+1 fetches. One batch call on panel designer mount, cached for the session.

### Frontend

#### Vite proxy
```typescript
server: {
  proxy: {
    '/api': {
      target: 'http://localhost:8000',
      changeOrigin: true,
    }
  }
}
```
The proxy key is `/api`, not `/api/v1`. API functions use relative paths: `fetch('/api/v1/instruments')`.

#### Path alias
`@/` maps to `src/`. Configure in `tsconfig.json`, `vite.config.ts`, AND the vitest `resolve.alias` config. Tests WILL fail on `@/` imports if vitest doesn't resolve the alias.

#### TanStack Query keys
```typescript
queryKey: ['instruments']                          // list
queryKey: ['instruments', { skip, limit }]         // paginated list
queryKey: ['instruments', id]                      // detail
queryKey: ['fluorophores', id, 'spectra']          // single spectra
queryKey: ['fluorophores', 'batch-spectra']        // batch spectra cache
```
Mutations invalidate the list key on success.

#### Chart.js for spectra
Use `react-chartjs-2` with `chart.js` and `chartjs-plugin-annotation`. Set `animation: false`, `pointRadius: 0`. Downsample spectra to every 2nm before rendering (use `downsampleSpectra()` utility). Register the annotation plugin alongside other Chart.js components.

#### Spectra interpolation
All spectra functions share `interpolateAt(spectra, wavelength)` from `utils/spectra.ts`. Linear interpolation between nearest data points. Returns 0 outside range. Used by: `isExcitable`, `isDetectable`, `computeSpilloverMatrix`.

#### Spillover memoization
Memoize the 1nm interpolated emission grid per fluorophore (Map keyed by fluorophore ID). Compute once, reuse on every matrix recalculation.

### Python Style Rules
- No f-strings without placeholders. Use `str()`, `.format()`, or `%` formatting.
- No multiple imports on one line (`import os, sys` → two separate imports).
- No semicolons to combine statements.
- Use `from __future__ import annotations` in all Python files.

### Pre-conjugated vs Unconjugated Antibodies
- `Antibody.fluorophore_id` set → pre-conjugated (e.g., anti-CD3-FITC). Panel designer auto-selects and locks this fluorophore.
- `Antibody.fluorophore_id` null → unconjugated. User picks fluorophore at panel design time.
- `PanelAssignment.fluorophore_id` is always the canonical fluorophore for spillover calculations.

## Network Constraints
- External HTTP to `fpbase.org` is NOT available from the Claude Code build environment. All seed spectra come from pre-populated JSON.
- The FPbase fetch endpoint works at runtime when the app is deployed normally. Tests MUST mock external calls.
- npm and pip registries ARE available.

## Test Running
```bash
# Backend
cd backend && pytest tests/ -v --tb=short

# Frontend
cd frontend && npx vitest run && npx tsc --noEmit

# Both
cd backend && pytest tests/ -v --tb=short && cd ../frontend && npx vitest run && npx tsc --noEmit
```

## File Deletion Policy
- `panels.db`: safe to delete anytime; regenerated on startup with seed data.
- `seed_data/*.json`: never delete; source-of-truth seed data.
