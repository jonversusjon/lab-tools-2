# CONVENTIONS.md — Lab Tools 2

Rules that constrain new work. Conventions live or die by being current —
update this file in the phase that produces a new rule, not later.

This file is hand-written (not auto-generated). For "what currently exists
in code", see `CODEBASE_INDEX.md`. For "why we built it this way", see
`ARCHITECTURE.md`.

---

## TypeScript

### Template literals are preferred in TS/TSX
Use template literals freely — `` `Heading ${level}` `` is preferred over
string concatenation. The Python "no f-strings without placeholders" rule
in user preferences applies ONLY to Python; it does NOT extend to
TypeScript template literals by analogy.

**Origin:** Phase 9a-fix (commit `746aa62`). CC initially wrote
`'Heading ' + String(node.attrs.level)` as an over-extension of the Python
rule. Caught in review.

---

## Documentation tense

Architectural docs are tenseless. When migrating content from a phase
plan into `ARCHITECTURE.md`, drop temporal qualifiers like "introduced
in a later phase," "to be added," "now planned." `ARCHITECTURE.md`
describes what is, not what was-or-will-be planned.

**Origin:** docs/restructure phase, commit `fb3fa30`.

---

## Frontend visual conventions

### Right-edge fade masks are always-on
Containers with `overflow-x: auto` that use a right-edge fade mask
(currently `panel-fade-right`) apply the mask unconditionally — the mask
is not gated on actual overflow. Consequence: when a table fits its
container without overflow, the rightmost element fades cosmetically.
This is the accepted tradeoff; do not "fix" by adding overflow detection.

If a specific surface looks wrong with the always-on fade, drop the fade
class from that surface only — keep `scrollbar-hide` independently. Do
NOT add JavaScript-based overflow detection.

**Origin:** Phase 9a-fix (commit `746aa62`).

---

## Python

### No f-strings without placeholders
Use `str()`, `.format()`, or `%` formatting for static strings. This is
a linter-enforced rule from the user's environment.

### One import per line
No `import os, sys`. Each import on its own line.

### No semicolons
No semicolons to combine statements on one line.

### `from __future__ import annotations`
Required at the top of every Python file in this project.

---

## SQLAlchemy / SQLite

### FK pragma in BOTH `database.py` AND `tests/conftest.py`
SQLite silently ignores FK constraints without it. If FK tests pass
without the pragma, the tests are lying.

### `str(uuid.uuid4())` not `uuid.uuid4`
Bare `uuid.uuid4` returns a UUID object, not a string. SQLite `String(36)`
columns will silently store `UUID(...)` repr strings. Add
`assert isinstance(model.id, str)` to model tests.

### Every FK column MUST specify `ondelete`
With FK pragma enabled, missing `ondelete` defaults to RESTRICT, causing
unexpected `IntegrityError` on delete. See `CODEBASE_INDEX.md` for the
current cascade rule per FK.

### Race-condition immunity
All read-then-write operations (e.g. "is this detector already assigned?
if not, assign it") MUST be in a single database transaction. Unique
constraints are the source of truth for conflicts; application-level
checks are for user-friendly error messages only. Always catch
`IntegrityError` and return 409 for conflicts.

### Explicit `PRAGMA journal_mode=WAL` in connect listener
WAL mode persists in the DB header, so an existing DB stays in WAL once
set — but a fresh DB created by `create_all()` defaults to DELETE journal
mode unless explicitly set on connect. Always set both pragmas in the
connect listener:
```python
cursor.execute("PRAGMA foreign_keys=ON")
cursor.execute("PRAGMA journal_mode=WAL")
```
**Origin:** Persistence sprint Phase 1.

---

## FastAPI routing

### No prefix on router files
Prefix is set ONLY in `main.py`'s `include_router` calls. Router files
declare `router = APIRouter()` with no prefix. Endpoints use relative
paths: `@router.get("/")`, `@router.get("/{id}")`.

If routing breaks, FIRST check for accidental `APIRouter(prefix=...)`
in a router file before debugging anywhere else.

### All import handlers wrap commit loop in explicit `try/except` + `db.rollback()`
Implicit rollback via `get_db()` session teardown is not sufficient for
all failure modes. Every `import_*_commit` handler must follow:
```python
try:
    for item in payload.items:
        # ... process ...
    db.commit()
    return {...}
except Exception as exc:
    db.rollback()
    raise HTTPException(status_code=422, detail=str(exc)) from exc
```
Catch `Exception`, not `IntegrityError` only — network, OOM, and
arbitrary bugs all need rollback. `db.commit()` stays OUTSIDE the loop.

**Origin:** Persistence audit (Section 3 Anomaly 4); fixed in
Persistence sprint Phase 1.

---

## Export/import round-trip

### Every export handler must round-trip cleanly to a fresh DB
For every `GET /export/<entity>` handler, there must be a test that:
1. Creates the entity with all its fields populated
2. Exports it via the endpoint
3. Imports the JSON into a fresh DB
4. Re-fetches and asserts every field round-tripped

A previous gap (microscope laser `excitation_type` / `ex_filter_width`)
went unnoticed for months because no round-trip test existed.

**Origin:** Persistence audit (Section 3); fixed in Persistence sprint Phase 1.

### Smart JSON format for spectra-bearing exports
Entities with large child tables (e.g. FluorophoreSpectrum) export as
**grouped JSON** — entity metadata plus inline spectra — rather than flat
row-per-spectrum CSV or a separate spectra file. This keeps the export
self-contained: one JSON document holds everything needed to reconstitute
the entity and its full spectral data.

**Reference shape — `FluorophoreExportItem`:**
```json
{
  "id": "fpbase-uuid",
  "name": "EGFP",
  "source": "FPbase",
  "has_spectra": true,
  "spectra": {
    "EX": [[464, 0.01], [488, 1.0], ...],
    "EM": [[490, 0.02], [507, 1.0], ...]
  },
  ...other metadata fields...
}
```

Spectra keys are spectrum type strings (`"EX"`, `"EM"`, `"A_2P"`).
Values are ordered `[[wavelength_nm, intensity], ...]` lists.

**Import conflict policy:** match by ID first, then name. Skip both
ID conflicts and name conflicts (never overwrite). Use the `/preview`
endpoint to inspect what would change before committing.

**Origin:** Persistence Sprint Phase 4.

### Import preview endpoints use O(n) set lookups, not O(n²) per-item queries
Build existence sets with one SELECT each before looping — not one query per item:
```python
existing_ids = {r.id for r in db.query(Model.id).all()}
existing_names = {r.name for r in db.query(Model.name).all()}
for item in payload.items:
    if item.id in existing_ids: ...
    elif item.name in existing_names: ...
```
Per-item queries are fine for small payloads but unacceptably slow at scale
(fluorophore imports can have 1,896 items).

**Origin:** Persistence Sprint Phase 4, commit `88c3359`.

---

## Backup and durability

### Backups use SQLite online backup API, never `cp`
With WAL active, `cp` races with writes and produces corrupted snapshots.
Use Python's `sqlite3.Connection.backup()`. Output format:
`panels-YYYY-MM-DD.db.gz` in `backend/backups/`.

### Daily snapshots are idempotent per-day
Skip if today's snapshot exists. `--force` to override.
Rotation: 14 daily + 4 weekly + 2 monthly retention.

**Origin:** Persistence sprint Phase 1.

---

## Configuration & runtime

### Configuration toggles use env vars, not CLI flags
The FastAPI app is invoked under `uvicorn`, which owns the CLI surface
and rejects unknown arguments. App-level configuration toggles must be
environment variables, not `sys.argv` flags. Variables prefixed `LAB_`
to namespace away from FastAPI/uvicorn/SQLAlchemy/Pydantic variables.

Example: `LAB_INIT_DB=1` to permit fresh-DB creation on first run.

**Origin:** Persistence sprint Phase 1, Step 4 (commit `bffa9fb`).

### DB path comes from `DATABASE_URL`, not from a `LAB_` variable
The SQLAlchemy connection URL is the ecosystem-standard `DATABASE_URL`,
not a project-specific `LAB_DB_URL`. The `LAB_` prefix is reserved for
project-specific behavior toggles (e.g. `LAB_INIT_DB=1`); standard
ecosystem variables keep their canonical names.

Default when unset: `sqlite:///panels.db` (CWD-relative; the Phase 1
startup check refuses to start from the wrong CWD).

SQLite URL slash gotcha: 3 slashes = relative, 4 slashes = absolute,
2 slashes = in-memory. Use `sqlite:////absolute/path/panels.db` for
absolute paths.

The helper functions `get_db_url()` and `get_db_path()` in `database.py`
are the single source of truth for parsing `DATABASE_URL`. All touch
points (`main.py`, `seed_fpbase.py`, `tools/backup.py`) import and use
these helpers — do not duplicate the URL-parsing logic.

**Origin:** Persistence sprint Phase 2.

---

## Schema migrations

### New schema changes go through Alembic, not `migrate_*()`
Edit the model, then `make alembic-revision MSG="..."`. Review the
generated migration manually before committing — autogenerate has known
blind spots (check constraints, server defaults, some index types).
The migration file goes in the same commit as the model change.

### Don't add new `migrate_*()` functions to main.py
The 4 schema and 1 data migrate_*() functions in main.py are legacy
from before Alembic adoption (Phase 3 of the persistence sprint). They
will be retired in Phase 3.5. Until then, they bring older DBs to the
Alembic baseline schema. Adding new ones is forbidden — use Alembic.

### `alembic stamp head` only on DBs without alembic_version table
Stamping a DB that's already at a different revision corrupts the
version state. The lifespan code uses
`MigrationContext.get_current_revision() is None` to gate the stamp.

### Test schema fidelity is enforced
`test_alembic_baseline_matches_create_all` diffs the schema produced
by `alembic upgrade head` against `Base.metadata.create_all()` (via
SQLAlchemy Inspector, ordering-independent). They must be identical.
If a future migration drifts the two, this test catches it.

### `render_as_batch=True` for SQLite migrations
SQLite does not support most `ALTER TABLE` operations natively (drop
column, change type, change constraints). Alembic's "batch mode"
emulates these by recreating the table. Without `render_as_batch=True`
in `alembic/env.py`, future migrations that touch existing columns will
fail at apply time. The setting is in both online and offline migration
paths.

### `fileConfig(disable_existing_loggers=False)` in `alembic/env.py`
The default wipes pytest's caplog handlers when env.py runs under
tests, breaking unrelated log-assertion tests. Always pass
`disable_existing_loggers=False`.

**Origin:** Persistence sprint Phase 3.

---

## Project layout

### `backend/` is the Python project root, not a package
There is no `backend/__init__.py`. The convention is to invoke Python
tools with `backend/` as the CWD:

```bash
cd backend && python tools/backup.py
```

Sub-packages (`backend/tools/`, `backend/routers/`, `backend/tests/`)
DO have `__init__.py` files because they're imported as packages from
within `backend/`. The Makefile follows this convention — every backend
target switches CWD to `backend/` first.

**Origin:** Persistence sprint Phase 1 anomaly (commit `2dd4b3e`).

---

## Frontend test patterns

### Mock `react-chartjs-2` in vitest
Canvas isn't available in jsdom. Use:
```ts
vi.mock('react-chartjs-2', () => ({
  Line: (props: any) => <canvas data-testid="chart" />
}))
```

### `@/` alias must be configured in three places
`tsconfig.json`, `vite.config.ts`, AND vitest's `resolve.alias` config.
Tests WILL fail on `@/` imports if vitest doesn't resolve the alias.

### Run `tsc --noEmit` from inside `frontend/`
Running it from project root installs the wrong tsc package.

---

## Chart.js

### `animation: false` on ALL chart configs
Without this, spectra charts lag on every data change.

### `pointRadius: 0` on ALL datasets
400 dots on a spectra curve murders performance.

### `chartjs-plugin-annotation` required
Used for laser lines and detector window overlays in panel spectra views.
Must be in `package.json`.

---

## dnd-kit

### `{...listeners}` on handle, `{...attributes}` + `ref` on row
Spreading both on the row breaks keyboard accessibility. The drag handle
`<td>` gets `{...listeners}`. The `<tr>` gets `{...attributes}` and the
`ref={setNodeRef}`.

### Use `CSS.Transform.toString(transform)`
Never build the transform string manually. Always import `CSS` from
`@dnd-kit/utilities`.

---

## TanStack Query

### Mutations invalidate the list key on success
See `CODEBASE_INDEX.md` § "TanStack Query Keys" for current key
conventions. Pattern: `qc.invalidateQueries({ queryKey: ['<entity>'] })`
in `onSuccess`.

### Mid-edit refetches must use `refetchType: 'none'`
Assignment/target mutations on panels invalidate `['panels', panelId]`
with `refetchType: 'none'` to avoid disruptive mid-edit refetches.

### `SET_PANEL` reducer guard
`SET_PANEL` in panel reducers should use a `useRef` guard to fire only on
genuine panel ID change, not on background refetches.

---

## How to add to this file

When CC's report contains "Decisions made under discretion" entries, web
Claude reviews each as a convention candidate. If a decision reflects a
rule that should govern future work, add it here in the same turn —
include `**Origin:**` line citing the phase + commit SHA so the rule has
provenance.
