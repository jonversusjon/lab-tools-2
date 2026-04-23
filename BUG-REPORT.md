# Bug Hunt Report — 2026-04-22

## Summary
- **Critical** (will crash or lose data): 2
- **High** (wrong behavior, user-visible): 7
- **Medium** (edge case, degraded UX, silent failure): 6
- **Low** (convention violation, tech debt, incomplete test coverage): 6

---

## Critical

### [BUG-001] Secondary antibody bulk import: `db.rollback()` inside loop corrupts all previously flushed rows
- **Location:** `backend/routers/secondaries.py:272`
- **Category:** data loss
- **Description:** The import loop calls `db.flush()` per item, then catches exceptions with `db.rollback()`. SQLAlchemy's `db.rollback()` rolls back the entire transaction — not just the failing row. All previously flushed (but not committed) rows are lost. However, `created` is not decremented, so the function ends with `created > 0` and calls `db.commit()` — which commits an empty transaction. The response falsely reports N rows created when 0 were persisted.
- **Reproduction:** Import 5 secondary antibodies where row 3 triggers an integrity error. Rows 1 and 2 disappear silently; response says `{"created": 2, "skipped": 0, "errors": ["Row 3 ..."]}`.
- **Suggested fix direction:** Use `db.savepoint()` (nested transaction) per row so a single-row failure only rolls back that row, or switch to a pre-validation approach that rejects bad rows before any writes begin.

### [BUG-002] `update_block` cannot clear `parent_id` to null — blocks get permanently stranded in columns
- **Location:** `backend/routers/experiments.py:287`
- **Category:** state corruption
- **Description:** `update_block` only writes `parent_id` when `data.parent_id is not None`. Sending `{"parent_id": null}` silently no-ops. The reorder endpoint (`PUT /{id}/blocks/reorder`) sets `parent_id` directly and works correctly, but any code path that uses the individual block update endpoint to detach a block from its parent column will silently fail. The block remains nested in the column forever.
- **Reproduction:** Move a paragraph block into a column, then try to move it back to the top level via `PUT /experiments/{id}/blocks/{block_id}` with `{"parent_id": null}`.
- **Suggested fix direction:** Replace the `is not None` guard with an explicit `model_fields_set` check (same pattern used for `antibody_id` clearing in `panels.py:385`) so that an explicit null can be written.

---

## High

### [BUG-003] `usePanelDesigner` dispatches `SET_PANEL` on every TanStack Query refetch, wiping undo history mid-edit
- **Location:** `frontend/src/hooks/usePanelDesigner.ts:199-203`
- **Category:** state corruption / wrong behavior
- **Description:** The `useEffect` that dispatches `SET_PANEL` depends on the entire `panel` object. TanStack Query returns a new object reference on every background refetch (default `staleTime=0`), so any automatic refetch — triggered by window focus, cache invalidation after a mutation, or the `refetchInterval` — fires `SET_PANEL`. This resets `targets`, `assignments`, `past`, and `future` to server state, erasing all in-progress undo history while the user is editing. There is no `useRef` guard on panel ID to skip re-dispatch when only a timestamp changed.
- **Reproduction:** Open a panel, add an assignment (one entry in undo history), switch browser tabs and switch back (triggers focus refetch). Undo history is gone.
- **Suggested fix direction:** Track the previous panel ID in a `useRef`; only dispatch `SET_PANEL` when `panel.id` differs from the last dispatched ID, or when `state.isDirty === false`.

### [BUG-004] `syncUndoRedo` silently swallows backend failures, leaving UI/backend state diverged
- **Location:** `frontend/src/components/panels/PanelDesigner.tsx:148-176`
- **Category:** state corruption / wrong behavior
- **Description:** When the user hits Undo/Redo, `syncUndoRedo` dispatches the reducer action first (updating UI state), then calls the backend. If any `removeAssignmentMutation` or `addAssignmentMutation` throws, the error is caught and ignored (`// Undo sync failed`). The UI shows an assignment state that disagrees with what is persisted in the database, with no feedback to the user. Subsequent saves or panel reloads will silently overwrite the discrepancy.
- **Reproduction:** Disconnect from the backend network, then undo an assignment. The UI shows the assignment removed, but on next page load it reappears.
- **Suggested fix direction:** On catch, call `refetchPanel()` to reset local state from server state, and show a toast warning.

### [BUG-005] `PanelAssignment` missing `uq_panel_antibody` database unique constraint — race condition allows duplicates
- **Location:** `backend/models.py:263`
- **Category:** data integrity
- **Description:** `ARCHITECTURE.md` requires `UniqueConstraint('panel_id', 'antibody_id', name='uq_panel_antibody')` on `PanelAssignment`. Only `uq_panel_detector` is present in `__table_args__`. The application-level duplicate check (SELECT then INSERT in two statements) is susceptible to race conditions: two concurrent requests that both pass the SELECT check can both INSERT the same antibody-panel pair. The `try/except IntegrityError` fallback catches only the detector constraint, so the second insertion succeeds silently.
- **Reproduction:** Race two simultaneous POST requests to `/panels/{id}/assignments` with the same `antibody_id`. One succeeds, one should 409, but without the DB constraint both may succeed.
- **Suggested fix direction:** Add `UniqueConstraint('panel_id', 'antibody_id', name='uq_panel_antibody')` to `PanelAssignment.__table_args__`. Delete `panels.db` and restart to apply.

### [BUG-006] IF panel microscope change only clears filter-linked assignments, leaving fluorophore-only assignments with stale data
- **Location:** `backend/routers/if_panels.py:190-205`
- **Category:** wrong behavior
- **Description:** When the user changes a panel's microscope, the backend deletes only assignments where `filter_id IS NOT NULL`. Assignments with `filter_id = NULL` (fluorophore assigned but no emission filter selected) are retained. These retained assignments reference a fluorophore that may be incompatible with the new microscope's excitation lines and emission filters, producing misleading spectral compatibility displays. By contrast, the flow panel's instrument change correctly deletes ALL assignments.
- **Reproduction:** Create an IF panel with microscope A and assign a fluorophore with no filter. Change to microscope B. The assignment remains with the wrong (or missing) compatibility context.
- **Suggested fix direction:** Delete all IFPanelAssignments when microscope changes (not just filter-linked ones), consistent with how flow panels handle instrument change.

### [BUG-007] `update_experiment` cannot clear description to null
- **Location:** `backend/routers/experiments.py:191`
- **Category:** wrong behavior
- **Description:** `if data.description is not None: experiment.description = data.description` prevents ever setting the description back to null once it has been set. The frontend's "clear description" action (sending `{"description": null}`) is silently ignored.
- **Reproduction:** Create an experiment with a description, then send `PUT /experiments/{id}` with `{"name": "X", "description": null}`. The description is unchanged.
- **Suggested fix direction:** Use `model_fields_set` to detect explicit null: `if "description" in data.model_fields_set: experiment.description = data.description`.

### [BUG-008] Direct `fetch()` calls throughout experiment and editor components bypass API layer and lack error handling
- **Location:** `CalloutBlock.tsx:47,99`, `TextBlockEditor.tsx:49,103`, `TableBlock.tsx:43,183`, `FlowPanelBlock.tsx:196`, `IFPanelBlock.tsx:199`, `ExperimentPage.tsx:121,158`, `InstrumentEditor.tsx:50`, `MicroscopeEditor.tsx:52`, `PlateMapWidget.tsx:288`, `ConnectionStatus.tsx:14`
- **Category:** wrong behavior / convention violation
- **Description:** These components call `fetch()` directly instead of using the `src/api/` layer. The keepalive auto-save fetches are intentional (fire-and-forget), but they still bypass the API layer for network errors. Non-keepalive calls in `ExperimentPage.tsx:121` (title rename) silently drop errors with an empty `catch {}` block. If the rename fails (e.g. 409, 500), the UI shows "Saved" but the change was not persisted.
- **Suggested fix direction:** Move all non-keepalive calls to `src/api/experiments.ts`. For keepalive saves, the fire-and-forget pattern is acceptable but should at minimum log errors to the console.

### [BUG-009] No React error boundary — any thrown component error crashes the entire app
- **Location:** `frontend/src/App.tsx` (absent)
- **Category:** crash
- **Description:** There is no `ErrorBoundary` wrapper anywhere in the component tree. A runtime exception in any route component (e.g., malformed block JSON in `BlockRenderer`, a null dereference in `SpilloverHeatmap`, an uncaught async error surfacing as a render throw) will unmount the entire app and show a blank white screen with no recovery path.
- **Reproduction:** Manually corrupt a block's content JSON in the database, then load the experiment page. The app crashes entirely.
- **Suggested fix direction:** Wrap each `<Route>` element (or at minimum the `<Shell>` container) with an `ErrorBoundary` that renders a "Something went wrong" fallback with a reload button.

---

## Medium

### [BUG-010] `PanelTarget` uniqueness enforced only in application code — concurrent requests can create duplicates
- **Location:** `backend/models.py:199-229`
- **Category:** data integrity
- **Description:** `ARCHITECTURE.md` documents a `uq_panel_target` constraint on `(panel_id, antibody_id)`. No such `UniqueConstraint` exists in `models.py`. The duplicate check in `panels.py` uses SELECT + INSERT across two statements. Two simultaneous POST requests to `/panels/{id}/targets` with the same `antibody_id` can both pass the check and both insert, creating duplicate target rows. This causes UI row doubling and assignment confusion.
- **Suggested fix direction:** Add `UniqueConstraint('panel_id', 'antibody_id', name='uq_panel_target')` to `PanelTarget.__table_args__`. Note: since `antibody_id` is nullable, this only protects non-null antibody targets; null rows can still have multiple entries (which is intentional per spec).

### [BUG-011] Undo/redo silently diverges backend after partial failure — no reconciliation or user feedback
- **Location:** `frontend/src/components/panels/PanelDesigner.tsx:146-175` (see also BUG-004)
- **Category:** state corruption (medium severity variant)
- **Description:** If a partial undo succeeds on some assignments but fails on others, the UI reflects the full intended undo state while the backend is in an intermediate state. There is no reconciliation step (e.g., refetch) to bring them back in sync. The `// Undo sync failed` comment is the only indicator.
- **Suggested fix direction:** After any catch in `syncUndoRedo`, force a `refetchPanel()` call and show a toast.

### [BUG-012] Experiment page auto-save for title has empty `catch {}` — save failure is invisible
- **Location:** `frontend/src/components/experiments/ExperimentPage.tsx:121-140`
- **Category:** wrong behavior
- **Description:** The non-keepalive `doSave` function sets `saveStatus('error')` on failure, which shows a red indicator in the UI. However, the keepalive unmount flush at line 158 is fire-and-forget with no error handling. If the server is unavailable at unmount time, the final title/description change is silently lost.
- **Suggested fix direction:** This is inherent to the keepalive pattern. At minimum, document this limitation clearly. For the `doSave` path, the error UI is correct.

### [BUG-013] `test_routes.py` covers only ~25 of 80+ routes — most routes have no route-level test
- **Location:** `backend/tests/test_routes.py`
- **Category:** missing test coverage
- **Description:** The `EXPECTED_ROUTES` list covers only instruments, fluorophores, antibodies, panels (basic), and panel targets/assignments. Routes entirely absent: experiments (all 8 endpoints), if-panels (all 8 endpoints), microscopes, secondary-antibodies, plate-maps, dye-labels, tags, preferences, list-entries, conjugate-chemistries, export-import. A double-prefix or missing router registration for any of these would not be caught.
- **Suggested fix direction:** Add all registered routes to `EXPECTED_ROUTES`.

### [BUG-014] `reorder_blocks` endpoint makes N×2 individual DB lookups (N+1 query pattern)
- **Location:** `backend/routers/experiments.py:252-265`
- **Category:** performance
- **Description:** The validate loop and the apply loop each call `db.get(ExperimentBlock, item.id)` separately — 2N round-trips for a reorder of N blocks. For a 20-block experiment page this is 40 individual SELECT statements where a single bulk query would suffice.
- **Suggested fix direction:** Fetch all affected blocks in one query (`WHERE id IN (...)`) and build a lookup dict, then validate and apply in two Python-only loops.

### [BUG-015] IF panel `IFPanelAssignment` `filter_id` has `ondelete="SET NULL"` but ARCHITECTURE.md specifies `CASCADE`
- **Location:** `backend/models.py:501`
- **Category:** data integrity (inconsistency)
- **Description:** `ARCHITECTURE.md` table says `IFPanelAssignment.filter_id → MicroscopeFilter: CASCADE`. The model has `ondelete="SET NULL"`. With `SET NULL`, deleting a `MicroscopeFilter` leaves the IF panel assignment with `filter_id=NULL` — the assignment still exists but the filter reference is gone. With `CASCADE`, the assignment would be deleted. The current `SET NULL` behavior is arguably correct (preserves the fluorophore assignment even after filter deletion), but it conflicts with the spec. Whichever is intended should be made explicit.
- **Suggested fix direction:** Either update `ARCHITECTURE.md` to document the rationale for `SET NULL`, or change the FK to `CASCADE` if removing the filter should remove the assignment.

---

## Low

### [BUG-016] Missing `from __future__ import annotations` in `__init__.py` files
- **Location:** `backend/routers/__init__.py`, `backend/services/__init__.py`, `backend/tests/__init__.py`
- **Category:** convention violation
- **Description:** All three `__init__.py` files are empty but the project convention requires the annotation import in every `.py` file.
- **Suggested fix direction:** Add `from __future__ import annotations` to each.

### [BUG-017] `usePanelDesigner.ts` `SET_INSTRUMENT` effect fires even on no-op instrument changes
- **Location:** `frontend/src/hooks/usePanelDesigner.ts:205-207`
- **Category:** unnecessary re-render
- **Description:** The `useEffect` for `SET_INSTRUMENT` fires on every render where `instrument` changes reference, even if it's the same instrument data. Unlike `SET_PANEL`, `SET_INSTRUMENT` doesn't reset anything critical, but it still causes a re-render on every TanStack Query refetch.
- **Suggested fix direction:** Add `[instrument?.id]` as the dependency instead of `[instrument]`.

### [BUG-018] `SpectraViewer` datasets have no per-dataset `pointRadius: 0` — relies on global `elements.point.radius`
- **Location:** `frontend/src/components/spectra/SpectraViewer.tsx`
- **Category:** convention / potential performance issue
- **Description:** `SpectraViewer` sets `elements: { point: { radius: 0 } }` globally in options rather than `pointRadius: 0` on each dataset. The CLAUDE.md convention says to set `pointRadius: 0` on all Chart.js datasets. The global approach works correctly but is inconsistent with the pattern used in `PanelSpectraByLaser.tsx` and CLAUDE.md guidance.
- **Suggested fix direction:** Add `pointRadius: 0` to each dataset object in `SpectraViewer` for consistency.

### [BUG-019] `ExperimentUpdate` description clear-to-null is blocked (mirrors BUG-007 at schema level)
- **Location:** `backend/routers/experiments.py:191`
- **Category:** same root cause as BUG-007, noted separately
- **Description:** Covered under BUG-007. Noted here to flag that the `model_fields_set` pattern already in use elsewhere (e.g. `panels.py:385`, `if_panels.py:209`) should be applied uniformly to all nullable optional fields across PUT/PATCH endpoints.

### [BUG-020] Experiment block content field `content: dict` in schema masks `json.loads` requirement — `PlateMapRead` has same pattern
- **Location:** `backend/schemas.py:866` (`ExperimentBlockRead.content: dict`), `backend/schemas.py:822` (`PlateMapRead.well_data: dict`)
- **Category:** fragile code pattern
- **Description:** The model stores `content` as `Text` (raw JSON string). The schema declares it as `dict`. This works because the router manually calls `json.loads()` before returning, but if `_block_to_read` were ever bypassed (e.g., returning the ORM object directly via `response_model=ExperimentBlockRead` with `from_attributes=True`), Pydantic would receive a string where it expects a dict and raise a validation error. The current code is correct but fragile.
- **Suggested fix direction:** Add a `model_validator` or `field_validator` to `ExperimentBlockRead` that calls `json.loads` if the value is a string.

### [BUG-021] `test_routes.py` uses `EXPECTED_ROUTES` list that is stale — many registered endpoints not covered
- **Location:** `backend/tests/test_routes.py`
- **Category:** incomplete test coverage (same root as BUG-013, noted here as appendix entry)
- **Description:** The test is a good pattern but needs to be kept in sync with `main.py`. New routers added since this test was written (experiments, if-panels, microscopes, secondaries, plate-maps, dye-labels, tags, preferences, list-entries, conjugate-chemistries) are not included. A CI regression in any of these routes would not be caught here.

---

## Appendix: Convention Violations (Phase 1 Automated Scan)

### Python backend

| File | Line | Issue |
|------|------|-------|
| `backend/routers/__init__.py` | — | Missing `from __future__ import annotations` |
| `backend/services/__init__.py` | — | Missing `from __future__ import annotations` |
| `backend/tests/__init__.py` | — | Missing `from __future__ import annotations` |
| `backend/routers/experiments.py` | 319 | Apparent f-string false positive — not an actual f-string, just a string containing `'flow'` and `'if'`. No issue. |
| `backend/routers/secondaries.py` | 271 | `except Exception as exc:` with partial handling — correct to catch here but combined with rollback causes BUG-001 |

No `APIRouter(prefix=...)` found in any router file. ✓  
All `ForeignKey` columns have `ondelete=`. ✓  
FK pragma present in both `database.py` and `tests/conftest.py`. ✓  

### TypeScript frontend

| File | Line | Issue |
|------|------|-------|
| `components/experiments/CalloutBlock.tsx` | 47, 99 | Direct `fetch()` call — should use `src/api/experiments.ts` |
| `components/experiments/TextBlockEditor.tsx` | 49, 103 | Direct `fetch()` call |
| `components/experiments/TableBlock.tsx` | 43, 183 | Direct `fetch()` call |
| `components/experiments/FlowPanelBlock.tsx` | 196 | Direct `fetch()` call (keepalive auto-save) |
| `components/experiments/IFPanelBlock.tsx` | 199 | Direct `fetch()` call (keepalive auto-save) |
| `components/experiments/ExperimentPage.tsx` | 121, 158 | Direct `fetch()` calls |
| `components/instruments/InstrumentEditor.tsx` | 50 | Direct `fetch()` call (keepalive auto-save) |
| `components/microscopes/MicroscopeEditor.tsx` | 52 | Direct `fetch()` call (keepalive auto-save) |
| `components/plate-maps/PlateMapWidget.tsx` | 288 | Direct `fetch()` call (keepalive auto-save) |
| `components/layout/ConnectionStatus.tsx` | 14 | Direct `fetch()` call (health check) |
| `components/layout/Toast.tsx` | 16 | `const ToastContext = createContext<...>` — context factory, not a component; acceptable |

No arrow function components found (plain `function` declarations throughout). ✓  
No `@ts-ignore` or `as any` in non-test source files. ✓  
No TanStack Query v4 positional syntax found. ✓  
No missing `@/` alias — all relative imports use `@/` correctly. ✓  
`animation: false` present in both Chart.js charts. ✓  
`pointRadius: 0` present in `PanelSpectraByLaser.tsx`; `SpectraViewer.tsx` uses `elements.point.radius: 0` globally (equivalent). ✓  

### Schema / model drift

| Item | Status |
|------|--------|
| `PanelAssignment.uq_panel_antibody` | **MISSING from models.py** — only in app code (see BUG-005) |
| `PanelTarget.uq_panel_target` | **MISSING from models.py** — only in app code (see BUG-010) |
| `IFPanelAssignment.filter_id ondelete` | `SET NULL` in model vs `CASCADE` in ARCHITECTURE.md (see BUG-015) |
| `Experiment.blocks` cascade | `cascade="all, delete-orphan"` — correct, matches `ondelete="CASCADE"` on FK |
| `ExperimentBlock.parent_id` cascade | `ondelete="SET NULL"` with no cascade on relationship — correct; orphaned children become top-level |
| All other FK/relationship pairs | Consistent between ondelete and cascade settings |
| `PlateMapRead.well_data: dict` | Stored as `Text`, router does `json.loads` — correct but fragile (see BUG-020) |
| `ExperimentBlockRead.content: dict` | Same as above — correct but fragile |
| `Antibody.reacts_with: Text` | Router does `json.loads`/`json.dumps` — correct |
