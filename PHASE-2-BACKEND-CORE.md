# Phase 2: Backend Core + Seed Data

> **Context:** Read `ARCHITECTURE.md`. Phase 1 scaffold is complete — models, schemas, stubs all exist. `seed_data/fluorophores.json` is already pre-populated with ~48 fluorophores (Gaussian approximations).

## Goal

Make the backend fully functional: seed data loads on startup, all CRUD routers return real data, and every endpoint is tested. No frontend work in this phase.

## Tasks

### 1. Populate remaining seed data JSON files

**`seed_data/fluorophores.json`** — Already populated from Phase 1 (~48 entries with Gaussian approximation spectra). No changes needed. **Note:** The `source` field in the JSON is `"gaussian_approximation"` — the seed loader MUST map this to `"seed"` when inserting. The model only accepts `"seed"|"fpbase"|"user"`.

**`seed_data/instruments.json`**: The BD FACSAria III config from ARCHITECTURE.md:
- 405nm Violet: 450/40, 510/50, 610/20, 660/20, 710/50, 780/60
- 488nm Blue: 530/30, 695/40, 780/60
- 561nm Yellow-Green: 582/15, 610/20, 670/30, 710/50, 780/60
- 637nm Red: 670/30, 710/50, 780/60

**`seed_data/antibodies.json`**: The 10 antibodies from ARCHITECTURE.md. **All unconjugated** (fluorophore_id = null). Include reasonable clone/host/isotype where known:
- CD3 → clone OKT3, mouse, IgG2a
- CD4 → clone RPA-T4, mouse, IgG1
- CD8 → clone SK1, mouse, IgG1
- CD14 → clone M5E2, mouse, IgG2a
- CD19 → clone HIB19, mouse, IgG1
- CD25 → clone BC96, mouse, IgG1
- CD45 → clone HI30, mouse, IgG1
- CD56 → clone HCD56, mouse, IgG1
- CD127 → clone A019D5, mouse, IgG1
- Live/Dead → target "Viability", no clone/host/isotype

### 2. Implement seed loading

In `main.py` lifespan, after `Base.metadata.create_all(engine)`:
- Check if the **instruments** table is empty (not fluorophores — instruments is the smallest table and the best sentinel for "has seeding completed?")
- If so, load all three seed JSON files and insert records **in a single transaction**
- When loading fluorophores, map `source` field: `"gaussian_approximation"` → `"seed"`
- Log what was loaded (count per table)
- If the transaction fails for ANY reason, roll back entirely — no partial seed state
- On subsequent startups, the instruments table is non-empty → skip seeding

### 3. Implement all router endpoints

> **Reminder:** Router files define NO prefix. Paths are relative: `@router.get("/")`, `@router.get("/{id}")`, etc.
>
> **Pagination:** All list endpoints accept optional `skip` (default 0) and `limit` (default 100, max 500) query params and return `{"items": [...], "total": N, "skip": 0, "limit": 100}`.
>
> **Race conditions:** All read-then-write operations (e.g., "check if detector is assigned, then assign it") must happen in a single database transaction. Application-level checks provide user-friendly error messages; database unique constraints are the real guard. Always catch `IntegrityError` and return appropriate HTTP status codes.

**`routers/instruments.py`**:
- `GET /` — list all instruments with nested lasers and detectors (paginated)
- `POST /` — create instrument with nested lasers/detectors in one request
- `GET /{id}` — single instrument with nested data
- `PUT /{id}` — update instrument. **Before replacing lasers/detectors: query PanelAssignment to check if ANY existing detector_id for this instrument is referenced. If so, return 409 Conflict with a message listing which detectors are in use and by which panels.** If no conflicts, delete old lasers/detectors and insert new ones. All in one transaction.
- `DELETE /{id}` — cascade delete (lasers → detectors cascade; panels referencing this instrument get `instrument_id` set to NULL via SET NULL FK)

**`routers/fluorophores.py`**:
- `GET /` — list all (paginated, without spectra data to keep response small — exclude the `spectra` JSON field)
- `POST /` — create manually
- `GET /{id}/spectra` — return full spectra JSON for one fluorophore
- `POST /batch-spectra` — body: `{"ids": ["uuid1", "uuid2", ...]}`. Returns a dict keyed by fluorophore ID with spectra objects. Used by the panel designer for compatibility checks and spillover. Limit to 100 IDs per request. Return 400 if more.
- `POST /fetch-fpbase` — stub for now, just return 501 (implemented in Phase 4)

**`routers/antibodies.py`**:
- `GET /` — list all (paginated), include the related fluorophore name if `fluorophore_id` is set (for pre-conjugated display)
- `POST /` — create (fluorophore_id optional — null means unconjugated)
- `GET /{id}` — single
- `PUT /{id}` — update (can set or clear fluorophore_id)
- `DELETE /{id}` — cascades to PanelAssignments and PanelTargets referencing this antibody

**`routers/panels.py`**:
- `GET /` — list panels (paginated, without full assignments/targets, but include assignment count and target count)
- `POST /` — create panel (name + instrument_id). `instrument_id` is optional (nullable). If provided, validate instrument exists → 404 if not.
- `GET /{id}` — single panel with all targets AND all assignments (each populated with antibody, fluorophore, detector info). Return targets and assignments as separate arrays.
- `PUT /{id}` — update name or instrument_id. `instrument_id` can be set to null. **If instrument_id changes (including from non-null to null): delete ALL PanelAssignments (but NOT PanelTargets) for this panel in the same database transaction.** Return the updated panel.
- `DELETE /{id}` — cascade (deletes targets and assignments too)
- `POST /{id}/targets` — add one target (antibody_id). Validate:
  - Panel exists → 404
  - antibody_id exists → 404
  - antibody not already a target in this panel → 409 ("Antibody already a target in this panel")
  - Catch IntegrityError from unique constraint as backup → 409
- `DELETE /{id}/targets/{target_id}` — remove one target. **Also delete any PanelAssignment for this antibody in this panel, in the same transaction.** Validate target belongs to this panel → 404.
- `POST /{id}/assignments` — add one assignment (antibody_id, fluorophore_id, detector_id). Validate:
  - Panel exists → 404
  - Panel has an instrument (`instrument_id` is not null) → 400 ("Panel has no instrument selected")
  - antibody_id, fluorophore_id, detector_id all exist → 404
  - antibody_id is a PanelTarget in this panel → 400 ("Antibody must be added as a target first")
  - detector_id belongs to the panel's instrument → 400 ("Detector does not belong to this panel's instrument")
  - antibody not already assigned in this panel → 409 ("Antibody already assigned in this panel")
  - detector not already assigned in this panel → 409 ("Detector already assigned in this panel")
  - Catch IntegrityError from unique constraints as backup → 409
- `DELETE /{id}/assignments/{assignment_id}` — remove one assignment. Validate assignment belongs to this panel → 404.

### 4. Tests

**`tests/conftest.py`**: Ensure test client uses in-memory SQLite with:
- FK pragma event listener active
- Seed data loaded (using the atomic seed loading logic)
- Session override properly configured

**`tests/test_instruments.py`**:
- Test: create instrument with 2 lasers, 3 detectors each → GET returns nested structure correctly
- Test: update instrument replaces lasers/detectors (when no assignments reference them)
- Test: update instrument when detector is in use by an assignment → returns 409
- Test: delete instrument → panels referencing it get instrument_id set to null (not deleted)
- Test: delete instrument cascades to lasers and detectors
- Test: seed instrument exists on startup
- Test: list endpoint returns paginated response with `items`, `total`, `skip`, `limit` keys

**`tests/test_fluorophores.py`**:
- Test: list fluorophores returns ~48 seed entries (paginated response)
- Test: list response does NOT include spectra field (for performance)
- Test: get spectra returns excitation + emission arrays with >10 data points each
- Test: create a custom fluorophore and retrieve it
- Test: fluorophore name uniqueness enforced
- Test: batch-spectra returns spectra for requested IDs
- Test: batch-spectra with >100 IDs returns 400
- Test: seed fluorophores all have source="seed" (not "gaussian_approximation")

**`tests/test_antibodies.py`**:
- Test: list antibodies returns seed entries (paginated response)
- Test: CRUD cycle (create, read, update, delete)
- Test: create antibody with fluorophore_id (pre-conjugated) → GET shows fluorophore info
- Test: create antibody without fluorophore_id (unconjugated) → fluorophore_id is null
- Test: deleting an antibody that is a PanelTarget cascades (target removed)

**`tests/test_panels.py`**:
- Test: create panel referencing seed instrument
- Test: create panel with non-existent instrument_id → 404
- Test: create panel with null instrument_id → succeeds
- Test: add target to panel → GET panel returns it in targets array
- Test: add duplicate target → 409
- Test: remove target → also removes any assignment for that antibody
- Test: add assignment to panel → GET panel returns it with populated relations
- Test: add assignment when panel has no instrument → 400
- Test: add assignment for antibody that is not a target → 400
- Test: add assignment with detector not from panel's instrument → 400
- Test: add duplicate antibody assignment → 409
- Test: add duplicate detector assignment → 409
- Test: remove assignment
- Test: delete panel cascades to targets and assignments
- Test: update panel instrument_id → all assignments deleted, targets preserved
- Test: update panel instrument_id to null → all assignments deleted, targets preserved

**`tests/test_routes.py`** — already created in Phase 1, should still pass.

## Tests to run

```bash
cd backend
pytest tests/ -v --tb=short
```

## Success criteria — ALL must pass before moving to Phase 3

1. `pytest tests/` — all tests pass (should be 30+ tests)
2. Start server, `curl http://localhost:8000/api/v1/instruments` returns paginated response with the seed instrument
3. `curl http://localhost:8000/api/v1/fluorophores` returns paginated response with ~48 entries, no spectra field, all with source="seed"
4. `curl http://localhost:8000/api/v1/fluorophores/{id}/spectra` returns spectra arrays
5. Full CRUD works for all 4 resources (verified by tests, not manual curl)
6. Seed data auto-loads on first run, is skipped on subsequent runs
7. Assignment uniqueness constraints enforced (antibody per panel, detector per panel)
8. Instrument update blocked when detectors are in use (409)
9. Panel instrument change cascades to delete assignments but preserves targets
10. PanelTarget CRUD works, remove target cascades to assignment
11. Panel with null instrument_id works correctly
12. Batch-spectra endpoint returns spectra for requested fluorophore IDs
13. All list endpoints return paginated response format
14. All route paths match expected patterns (test_routes.py passes)
