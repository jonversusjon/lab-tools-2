# Phase 6: Panel Designer — Setup & Target Management

> **Context:** Read `ARCHITECTURE.md`. All CRUD views work (Phases 3–5). This phase builds the panel designer page skeleton and the target row management. The assignment grid comes in Phase 7.
>
> **Before starting:** Run all backend and frontend tests to confirm baseline is green.

## Goal

Build `/panels` (list) and `/panels/{id}` (designer) with: panel creation, instrument selection, adding/removing antibody targets as rows (persisted to backend via PanelTarget model). The assignment table columns (laser/detector grid) are rendered as headers only — no assignment interaction yet.

## Tasks

### 1. Panel list page (`/panels`)

**`components/panels/PanelList.tsx`**:
- Table or card list of saved panels: name, instrument name (or "No instrument" if null), # targets, # assignments, updated_at
- "New Panel" button → creates a new panel (prompt for name in a small modal or inline input) and navigates to `/panels/{id}`
- Click existing panel → navigates to `/panels/{id}`
- Delete button per panel (with confirmation)

### 2. Panel designer page (`/panels/{id}`)

**`components/panels/PanelDesigner.tsx`**:
- Fetches panel by ID (with targets and assignments) and the selected instrument (with lasers/detectors) if instrument_id is not null
- Layout: three vertical sections (A, B, C)

**Section A: Panel Header**
- Panel name: inline editable text (click to edit, blur to save)
- Instrument selector: dropdown of all instruments, with an empty/null option ("Select an instrument..."). **Handling null instrument state:**
  - If `instrument_id` is null: show prominent prompt "Select an instrument to begin designing your panel." The assignment table area shows only target rows (no detector columns). Targets can still be added/removed.
  - If an instrument is selected: show the full grid with detector columns.
- **Changing instrument:**
  - If assignments exist: show confirmation dialog ("Changing the instrument will remove all current fluorophore assignments. Your target antibodies will be preserved. Continue?")
  - On confirm: PUT to backend with new instrument_id (backend deletes all assignments but preserves targets in the same transaction), then refetch panel
  - If no assignments: just PUT and refetch
  - Setting to null (clearing instrument): same behavior — deletes assignments, preserves targets

**Section B: Assignment Table (structure only this phase)**
- "Add Target" button/autocomplete: searchable dropdown that queries the antibody list. Selecting an antibody:
  1. POSTs to `POST /panels/{id}/targets` to persist the target
  2. On success, adds the row to local state
  3. On 409 (already a target): show error, don't add duplicate row
  - Antibodies already targets in the panel should be greyed out / excluded from the dropdown.
  - **For pre-conjugated antibodies:** show the conjugated fluorophore name next to the target in the dropdown (e.g., "CD3 — FITC"). This helps the user know which antibodies are already conjugated.
- Target rows show: target name, clone, conjugation status (fluorophore name or "Unconj."), and then empty cells for each detector column (or no detector columns if instrument is null).
- Column headers (only rendered when instrument is selected): grouped by laser (top row: laser wavelength + name, colored with laser color from `utils/colors.ts`, spanning detector sub-columns), sub-row: detector filter notation (e.g. "530/30").
- "Remove" button at end of each target row:
  1. DELETEs via `DELETE /panels/{id}/targets/{target_id}` (backend also deletes any assignment for this antibody in the same transaction)
  2. On success, removes target + any assignment from local state
- The table should be horizontally scrollable with the target name column frozen/sticky on the left.
- **No click interaction on cells yet** — cells are empty/disabled. Just render the grid structure.

**Section C: Placeholder** — just render a grey box with text "Spillover Matrix (Phase 8)" as a placeholder.

### 3. State management

**`hooks/usePanelDesigner.ts`**:

Create a `useReducer`-based hook that manages the panel designer's local state:

```typescript
interface PanelDesignerState {
  panel: Panel | null
  instrument: Instrument | null  // null when panel has no instrument
  targets: PanelTarget[]         // persisted to backend, survives reload
  assignments: PanelAssignment[]
  isDirty: boolean
}

type PanelDesignerAction =
  | { type: "SET_PANEL"; panel: Panel }
  | { type: "SET_INSTRUMENT"; instrument: Instrument | null }
  | { type: "ADD_TARGET"; target: PanelTarget }
  | { type: "REMOVE_TARGET"; targetId: string; antibodyId: string }
  | { type: "ADD_ASSIGNMENT"; assignment: PanelAssignment }
  | { type: "REMOVE_ASSIGNMENT"; assignmentId: string }
  | { type: "CLEAR_ASSIGNMENTS" }  // when instrument changes
```

Key differences from a client-only approach:
- `targets` are populated from `panel.targets` on initial load (fetched from backend)
- `ADD_TARGET` fires AFTER the backend POST succeeds — it reflects the backend-created PanelTarget with its real ID
- `REMOVE_TARGET` includes `antibodyId` so the reducer can also remove any matching assignment
- `CLEAR_ASSIGNMENTS` only clears assignments, not targets (used when instrument changes)

This reducer is the single source of truth for the designer. API calls happen before dispatching (not optimistic for targets, since target creation is not latency-sensitive). Assignment operations in Phase 7 will use optimistic updates with rollback.

### 4. Tests

**`frontend/src/__tests__/PanelDesigner.test.tsx`**:
- Test: renders panel name and instrument selector
- Test: null instrument state shows "Select an instrument" prompt, no detector columns
- Test: changing instrument triggers confirmation if assignments exist
- Test: "Add Target" dropdown shows antibodies not already in panel
- Test: adding a target adds a row to the table
- Test: removing a target removes its row
- Test: column headers render correct laser groups and detector filters from the selected instrument
- Test: pre-conjugated antibodies show fluorophore name in the target row
- Test: targets persist conceptually (verify reducer state contains backend-returned PanelTarget objects with IDs)

**`frontend/src/__tests__/usePanelDesigner.test.ts`**:
- Test: ADD_TARGET adds to targets
- Test: REMOVE_TARGET removes from targets AND removes any assignment matching that antibodyId
- Test: SET_INSTRUMENT to null clears assignments but keeps targets
- Test: CLEAR_ASSIGNMENTS clears assignments but keeps targets
- Test: reducer handles all action types without throwing

**`backend/tests/test_panels.py`** — add if not already covered:
- Test: creating a panel with null instrument_id → succeeds, GET returns instrument_id: null
- Test: GET panel returns empty targets and assignments arrays for new panel
- Test: adding targets persists — GET panel after adding returns targets
- Test: removing target also removes its assignment
- Test: PUT panel with new instrument_id deletes assignments but keeps targets

## Tests to run

```bash
cd backend && pytest tests/ -v --tb=short
cd frontend && npx vitest run && npx tsc --noEmit
```

## Success criteria — ALL must pass before moving to Phase 7

1. All tests pass (backend + frontend)
2. TypeScript clean
3. Manual verification:
   - `/panels` shows list (empty initially), can create a new panel
   - `/panels/{id}` shows panel name (editable), instrument dropdown
   - New panel with no instrument shows "Select an instrument" prompt, can still add targets
   - Selecting the seed instrument → table renders 4 laser group headers with correct detector sub-columns
   - Can add CD3, CD4, CD8 as target rows → they appear as rows in the table
   - **Reload page → target rows persist** (they were saved to backend as PanelTargets)
   - Removing a target removes its row
   - Target search excludes already-added targets
   - Horizontal scroll works when many detectors
   - Target name column stays visible (sticky) while scrolling
   - Panel persists across page reloads
   - Pre-conjugated antibodies show their fluorophore in the target row
   - Setting instrument to null clears detector columns but keeps target rows
