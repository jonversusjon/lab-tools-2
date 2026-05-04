# Experiment Pages — Phased Build Plan

**Status as of 2026-05-02:** Phases 1–4 complete. Phases 5–7 status unverified.

This is a transient phase plan. It enters claude.ai project knowledge only when active work resumes on Phases 5+. For the architectural design (always-current), see `ARCHITECTURE.md` § "Experiment Pages".

---

## Phased Build Plan

### Phase 1: Backend — Experiment & Block Models + CRUD ✅ COMPLETE

**Completion commits:** `0377c6b`, `55d32fc`, `c73ac72`

**3 commits**

**Commit 1-1: Models + Migration**
- Add `Experiment` and `ExperimentBlock` models to `models.py`
- Add migration function in `main.py` lifespan (table creation via `Base.metadata.create_all` — same pattern as existing)
- Add Pydantic schemas: `ExperimentCreate`, `ExperimentUpdate`, `ExperimentRead`, `ExperimentListRead`, `ExperimentBlockCreate`, `ExperimentBlockUpdate`, `ExperimentBlockRead`, `ExperimentBlockReorder`

**Commit 1-2: Experiment CRUD Router**
- Create `routers/experiments.py` with list/create/get/update/delete endpoints
- Register router in `main.py` as `prefix="/api/v1/experiments"`
- GET by ID returns experiment with all blocks eagerly loaded, sorted by sort_order

**Commit 1-3: Block CRUD + Reorder + Snapshot**
- Add block endpoints: create, update, delete, batch reorder
- Add `POST /snapshot-panel` endpoint that:
  - Accepts `source_panel_id` + `panel_type` ("flow" | "if")
  - Loads the full template (targets + assignments + antibody/fluorophore metadata)
  - Serializes to the panel instance JSON schema defined above
  - Creates an `experiment_block` with the appropriate `block_type`
  - Returns the created block
- Tests: pytest for all CRUD operations, snapshot serialization correctness

---

### Phase 2: Frontend — Block Editor Engine (Generic Blocks) ✅ COMPLETE

**Completion commits:** `4cc6027`, `dd24065`, `d7b5682`, `74a1625`

**4 commits**

**Commit 2-1: TanStack Query Hooks + Types**
- Create `hooks/useExperiments.ts` — list, create, get, update, delete experiments
- Create `hooks/useExperimentBlocks.ts` — block CRUD, reorder, snapshot mutations
- Define TypeScript types in `types/index.ts`: `Experiment`, `ExperimentBlock`, `RichText`, `BlockContent` (discriminated union by block_type)
- Add API functions in `api/experiments.ts`

**Commit 2-2: Block Renderer + Text Block Editing**
- Create `components/experiments/BlockRenderer.tsx` — switch on `block_type`, renders each block
- Create `components/experiments/TextBlockEditor.tsx` — inline editing for paragraph, headings, list items
  - Plain text input (no rich text annotations yet)
  - Notion-like keyboard behavior: Enter creates new block below, Backspace at empty block deletes it
- Implement heading blocks (h1–h4) with toggle support (collapse/expand children via `is_toggleable`)
- Debounced auto-save on content change (same pattern as InstrumentEditor)

**Commit 2-3: Structural Blocks**
- Callout block: icon picker (emoji subset), background color selector, rich text body
- Table block: editable grid with drag-and-drop row reordering (`@dnd-kit`), add/remove rows and columns, column/row header toggles. Rows are plain string arrays in JSON — reorder mutates the array.
- Divider block: simple `<hr>` rendering
- Column layout: 2-column and 3-column container blocks, children render in CSS grid, drag-drop between columns

**Commit 2-4: Block Management — Add, Delete, Reorder, Block Type Picker**
- Block command menu (Notion-style `/` slash command or `+` button between blocks)
  - Categories: Text (paragraph, h1, h2, h3, h4), Lists (bulleted, numbered), Media (callout, divider, table), Layout (2-col, 3-col), Panels (flow panel, IF panel — wired in Phase 4)
- Drag-and-drop reordering with `@dnd-kit` (already in project dependencies)
- Delete block (with confirmation for panel blocks)
- Block-level context menu: duplicate, delete, convert type (where sensible, e.g. h1↔h2)

---

### Phase 3: Experiment Pages + Navigation Relabeling ✅ COMPLETE

**Completion commits:** `7744f01`

**2 commits**

**Commit 3-1: Experiment List Page + Page Shell**
- Create `components/experiments/ExperimentList.tsx` — table of experiments with create/rename/delete
- Create `components/experiments/ExperimentPage.tsx` — title editing + block editor container
- Add routes in `App.tsx`: `/experiments`, `/experiments/:id`
- Add "Experiments" to sidebar as a top-level link (icon: 🧪), positioned above domain groups

**Commit 3-2: Relabel Panel Pages as Templates**
- Rename sidebar labels: "Panels" → "Panel Templates" under Flow Cytometry
- Rename sidebar labels: "Panels" → "Panel Templates" under IF / IHC
- Update `PanelList.tsx` heading to "Flow Panel Templates"
- Update `IFPanelList.tsx` heading to "IF/IHC Panel Templates"
- Add explanatory subtitle: "Design reusable panels here. Add them to experiments to use."
- No schema or API changes — purely UI relabeling

---

### Phase 4: Panel Instance Blocks ✅ COMPLETE

**Completion commits:** `2299a5e`, `5f0f3f3`, `0778501`

**3 commits**

**Commit 4-1: Template Picker + Snapshot Integration**
- Create `components/experiments/PanelTemplatePicker.tsx` — modal that lists available flow and IF panel templates, with search
- Wire the "Flow Panel" and "IF Panel" options in the block command menu to open the picker
- On template selection, call the snapshot endpoint, insert the returned block
- Also support "blank panel" creation (empty instance, user builds from scratch on the page)

**Commit 4-2: Flow Panel Instance Block**
- Create `components/experiments/FlowPanelBlock.tsx` — renders a flow panel instance from block JSON
  - Read-only display of targets + assignments table (similar to PanelDesigner but non-editable initially)
  - Inline editing of target list: add/remove/reorder targets, change antibody, change fluorophore assignment
  - All edits mutate the block's JSON content via the block update endpoint
  - Changes do NOT propagate back to the template
- Show instrument name as block header with panel name

**Commit 4-3: IF Panel Instance Block**
- Create `components/experiments/IFPanelBlock.tsx` — renders an IF panel instance from block JSON
  - Same pattern as FlowPanelBlock but with IF-specific fields (panel_type badge, microscope name, dilution_override support)
  - Simple view and optional spectral view based on instance view_mode
- Test: create experiment, add IF panel template, verify snapshot, edit instance, verify template unchanged

---

### Phase 5: Volume Calculation Tables ❓ STATUS UNVERIFIED

**Note:** Status not confirmed from git log alone. Verify against codebase before resuming.

**2 commits**

**Commit 5-1: Volume Calculator Component**
- Create `components/experiments/VolumeCalculator.tsx`
  - Editable params row: num_samples (number input), volume_per_sample_ul (number input), pipet_error_factor (number input, default 1.1)
  - Computed primary cocktail table:
    | Target | Antibody | Dilution | Vol/sample (µL) | Total vol (µL) |
    |--------|----------|----------|-----------------|-----------------|
    | CD3    | OKT3     | 1:100    | 1.00            | 1.10            |
    | Buffer | —        | —        | —               | 97.70           |
  - Computed secondary cocktail table (same format, for indirect targets only)
  - "Refresh dilutions" button that re-reads current antibody dilution_factor from the API (optional, for when user has updated antibody library since snapshot)
- Changes to volume_params auto-save into the block content JSON

**Commit 5-2: Wire Volume Tables into Panel Blocks**
- Embed VolumeCalculator as a collapsible section within FlowPanelBlock and IFPanelBlock
- Default collapsed, toggle label: "Volume Calculations"
- Flow panels use `flow_dilution_factor`, IF panels use `icc_if_dilution_factor` (with `dilution_override` taking precedence)
- Targets with no dilution factor show "⚠ No dilution" with row highlighted
- Test: verify arithmetic for various sample counts, dilutions, error factors

---

### Phase 6: Mastermix Detection ❓ STATUS UNVERIFIED

**Note:** Status not confirmed from git log alone. Verify against codebase before resuming.

**2 commits**

**Commit 6-1: Shared Target Detection + Selection UI**
- Create `components/experiments/MastermixDetector.tsx`
  - Scans all `flow_panel` and `if_panel` blocks on the current experiment page
  - Groups targets by `antibody_id` within same panel type (flow↔flow, IF↔IF only)
  - Cross-type grouping (flow + IF) is NOT supported — different dilution sources
  - For same-type matches: checks dilution factor consistency
    - If dilution factors match across panels → eligible for mastermix
    - If dilution factors differ → NOT eligible, show warning: "CD3 cannot be added to master mix: dilution is 1:100 in Panel A but 1:200 in Panel B"
  - Presents a modal/section: "Shared Antibodies Across Panels"
    | Target | Panels | Dilution | Status |
    |--------|--------|----------|--------|
    | CD3    | Panel A, Panel B | 1:100 | ☑ Eligible |
    | CD45   | Panel A, Panel C | Mismatch | ⚠ Different dilutions |
  - Selected shared antibodies are stored in a top-level experiment-scoped JSON field (either on the experiment model or as a special block type)

**Commit 6-2: Mastermix Protocol Output**
- When mastermix selections exist, each panel's VolumeCalculator shows adjusted tables:
  - Master mix table: aggregated volumes for shared antibodies across all panels
  - Per-panel cocktail table: shows "From master mix: X µL" for shared antibodies + individual volumes for panel-specific antibodies
- Mastermix table renders as a callout block above the panels or as a dedicated section
- Add "Clear mastermix" option to reset selections

---

### Phase 7: Polish + Testing ❓ STATUS UNVERIFIED

**Note:** Status not confirmed from git log alone. Verify against codebase before resuming.

**2 commits**

**Commit 7-1: Auto-save, Empty States, Error Handling**
- Debounce + keepalive auto-save for block edits (match InstrumentEditor/MicroscopeEditor pattern)
- Empty experiment page state with "Add your first block" prompt
- Empty panel instance state (no targets)
- Error boundaries around panel blocks (malformed JSON gracefully degrades to "Block data corrupted" message)
- Loading skeletons for experiment page

**Commit 7-2: Test Coverage**
- Backend: pytest for experiment CRUD, block CRUD, reorder, snapshot serialization, cascade delete
- Frontend: snapshot round-trip test (template → snapshot → render → verify data integrity)
- Volume calculation unit tests (pure function): various dilutions, sample counts, edge cases (no dilution, zero samples)
- Mastermix detection unit tests: overlapping targets, partial selection, single-panel edge case (no mastermix shown)

---

## Key Conventions (CLAUDE.md Compliance)

- `from __future__ import annotations` on every Python file
- UUID string PKs via `default=lambda: str(uuid.uuid4())`
- No-prefix routers registered in `main.py`
- Pydantic v2 `model_config = {"from_attributes": True}`
- `@/` alias for frontend imports
- Plain function declarations (no arrow function components)
- Tailwind-only styling with dark mode variants
- Chart.js only (no Recharts)
- No multiple module imports per line
- No f-strings without placeholders
- TanStack Query v5 patterns with proper cache invalidation

## Dependencies

No new npm or pip packages required. Everything uses existing stack:
- `@dnd-kit` (already present for panel target reordering)
- TanStack Query v5 (already present)
- Tailwind CSS (already present)
- FastAPI + SQLAlchemy + Pydantic v2 (already present)

## Risk Areas

1. **Block editor keyboard UX**: Even with plain text, the Enter/Backspace/Tab block management behavior requires careful keyboard event handling. Phase 2 Commit 2-2 remains the most UX-sensitive commit.

2. **Block sort_order float precision**: After ~50 rapid insertions in the same gap, floats lose precision. Compaction logic needed but can be deferred to Phase 7.

3. **Panel instance JSON size**: A 20-target panel with full metadata could be ~5-10KB of JSON per block. Fine for SQLite TEXT columns but monitor if pages get very large.

4. **Mastermix across flow + IF panels**: A flow panel and IF panel using the same antibody but at different dilutions (flow_dilution vs icc_if_dilution) cannot be combined. The mastermix only groups panels of the same type, and even within the same type, mismatched dilution factors produce a warning rather than silently combining.
