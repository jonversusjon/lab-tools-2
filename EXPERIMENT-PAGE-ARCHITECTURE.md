# Experiment Page Architecture & Phased Build Plan

## Overview

Add an **Experiment Page** system — a Notion-like block editor where researchers compose experiment documentation inline with embedded, editable panel instances. Existing flow and IF panels become **templates**: reusable blueprints that can be stamped into experiment pages as independent copies. Volume calculations, cocktail tables, and cross-panel mastermix detection operate on these page-scoped instances.

---

## Architecture

### Data Model

#### New Tables

```
experiments
├── id              String(36) PK, UUID
├── name            String, NOT NULL
├── description     Text, nullable
├── created_at      DateTime, server_default=now()
└── updated_at      DateTime, server_default=now(), onupdate=now()

experiment_blocks
├── id              String(36) PK, UUID
├── experiment_id   String(36) FK → experiments.id, CASCADE
├── block_type      String(30), NOT NULL
│                   (paragraph, heading_1, heading_2, heading_3,
│                    bulleted_list_item, numbered_list_item,
│                    callout, table, divider,
│                    column_list, column,
│                    flow_panel, if_panel)
├── content         Text, NOT NULL, default="{}"   ← JSON blob
├── sort_order      Float, NOT NULL                ← float for cheap insert-between
├── parent_id       String(36) FK → experiment_blocks.id, SET NULL, nullable
│                   (non-null for: column children, table_row children,
│                    toggle heading children, nested list items)
├── created_at      DateTime, server_default=now()
└── updated_at      DateTime, server_default=now(), onupdate=now()
```

`sort_order` uses **float** so inserting a block between sort_order 1.0 and 2.0 can use 1.5 without reindexing. Periodic compaction normalizes back to integers.

#### Why Float Sort Order?

Drag-and-drop reordering with integer sort orders requires updating every row below the insertion point. With floats, inserting between adjacent blocks is O(1). Compaction (renumber to 0, 1, 2...) runs lazily when the fractional gap shrinks below a threshold (e.g. 0.001).

### Block Content JSON — Notion API Alignment

Each block's `content` column stores JSON that mirrors the Notion API block schema as closely as possible. This enables a near-trivial "Export to Notion" translation later.

#### Generic Blocks (Plain Text — No Rich Text)

All text blocks use plain strings. Rich text annotations (bold, italic, color) are deferred to a future update. This keeps Phase 2 scope manageable and doesn't block the Notion export path — plain text can be trivially wrapped in Notion rich_text arrays at export time.

**Paragraph / Headings / List Items:**
```json
{ "text": "Hello world" }
```

**Headings with toggle (heading_1, heading_2, heading_3 only):**
```json
{ "text": "Toggleable heading", "is_toggleable": true }
```

When `is_toggleable: true`, the heading acts as a toggle — its children (stored via `parent_id`) are collapsible. Default: `false`.

**Callout:**
```json
{
  "text": "Important note here",
  "icon": "💡",
  "color": "gray_background"
}
```

**Table:**
```json
{
  "table_width": 3,
  "has_column_header": true,
  "has_row_header": false,
  "rows": [
    ["Header 1", "Header 2", "Header 3"],
    ["Cell A", "Cell B", "Cell C"],
    ["Cell D", "Cell E", "Cell F"]
  ]
}
```

Table rows are stored inline in the table block's content as an ordered JSON array. Array index IS the sort order — drag-and-drop reordering reorders the array and saves the entire block. This matches the JSON-blob-for-complete-units pattern (same as plate map well_data). No separate child blocks or sort_order column for rows.

**Column List / Column:**
```json
// column_list content — column_count for rendering hints
{ "column_count": 2 }

// column content — index within the column_list
{ "column_index": 0 }
```

Column children are stored as blocks with `parent_id` → the `column` block and their own `sort_order`.

**Divider:**
```json
{}
```

#### Heading 4 (Internal Only)

Notion API only supports heading_1 through heading_3. We support a `heading_4` block type internally with `{ "text": "..." }` content. On Notion export, this maps to a bold paragraph:

```json
{
  "type": "paragraph",
  "paragraph": {
    "rich_text": [{
      "type": "text",
      "text": { "content": "Heading 4 Text" },
      "annotations": { "bold": true }
    }]
  }
}
```

#### Panel Instance Blocks

**flow_panel content:**
```json
{
  "source_panel_id": "uuid-of-template",
  "name": "My T Cell Panel",
  "instrument": {
    "id": "uuid",
    "name": "BD FACSAria Fusion"
  },
  "targets": [
    {
      "id": "instance-uuid",
      "antibody_id": "uuid",
      "antibody_name": "CD3",
      "antibody_target": "CD3",
      "antibody_host": "Mouse",
      "antibody_clone": "OKT3",
      "staining_mode": "direct",
      "secondary_antibody_id": null,
      "secondary_antibody_name": null,
      "sort_order": 0,
      "flow_dilution_factor": 100,
      "icc_if_dilution_factor": null
    }
  ],
  "assignments": [
    {
      "id": "instance-uuid",
      "antibody_id": "uuid",
      "fluorophore_id": "alexa-fluor-488",
      "fluorophore_name": "Alexa Fluor 488",
      "detector_id": "uuid",
      "detector_name": "530/30"
    }
  ],
  "volume_params": {
    "num_samples": 1,
    "volume_per_sample_ul": 100,
    "pipet_error_factor": 1.1,
    "dilution_source": "flow"
  }
}
```

**if_panel content:**
```json
{
  "source_panel_id": "uuid-of-template",
  "name": "Neuronal IF Panel",
  "panel_type": "IF",
  "microscope": {
    "id": "uuid",
    "name": "Leica SP8 Confocal"
  },
  "view_mode": "simple",
  "targets": [
    {
      "id": "instance-uuid",
      "antibody_id": "uuid",
      "antibody_name": "MAP2 chk Abcam",
      "antibody_target": "MAP2",
      "antibody_host": "Chicken",
      "staining_mode": "indirect",
      "secondary_antibody_id": "uuid",
      "secondary_antibody_name": "Goat anti-Chicken AF647",
      "secondary_fluorophore_id": "alexa-fluor-647",
      "secondary_fluorophore_name": "Alexa Fluor 647",
      "sort_order": 0,
      "dilution_override": null,
      "icc_if_dilution_factor": 500
    }
  ],
  "assignments": [
    {
      "id": "instance-uuid",
      "antibody_id": "uuid",
      "fluorophore_id": "alexa-fluor-647",
      "fluorophore_name": "Alexa Fluor 647",
      "filter_id": "uuid",
      "filter_name": "660/40"
    }
  ],
  "volume_params": {
    "num_samples": 1,
    "volume_per_sample_ul": 200,
    "pipet_error_factor": 1.1,
    "dilution_source": "icc_if"
  }
}
```

### Volume Calculation (Frontend Only)

All volume math is computed client-side from the panel instance JSON.

**Per-antibody primary volume:**
```
ab_vol = (volume_per_sample / dilution_factor) × num_samples × pipet_error_factor
```

Where `dilution_factor` is:
- Flow panels: `target.flow_dilution_factor`
- IF panels: `target.dilution_override ?? target.icc_if_dilution_factor`

**Primary cocktail buffer:**
```
total_cocktail_vol = volume_per_sample × num_samples × pipet_error_factor
buffer_vol = total_cocktail_vol - sum(ab_vol for each antibody)
```

**Secondary cocktail:** Same formula using secondary antibody dilutions.

**Mastermix (cross-panel):**
When multiple panel blocks exist on one experiment page, scan for antibodies (by `antibody_id`) that appear in more than one panel. The user selects which shared antibodies to include in a master mix. The system:

1. Sums the per-panel antibody volumes for each shared antibody
2. Presents a master mix table: total volume per shared antibody
3. Each panel's cocktail table shows "from master mix: X µL" instead of individual antibody volumes for those shared targets

### Navigation & Routing

```
/experiments              → ExperimentList (new)
/experiments/:id          → ExperimentPage (new, block editor)
/flow/panels              → relabeled "Flow Panel Templates"
/if-ihc/panels            → relabeled "IF/IHC Panel Templates"
```

Sidebar gains an "Experiments" top-level entry above the domain-specific groups.

### Backend API Design

```
GET    /api/v1/experiments                     → paginated list
POST   /api/v1/experiments                     → create experiment
GET    /api/v1/experiments/:id                 → full experiment with all blocks
PUT    /api/v1/experiments/:id                 → update name/description
DELETE /api/v1/experiments/:id                 → delete experiment + cascade blocks

POST   /api/v1/experiments/:id/blocks          → add block
PUT    /api/v1/experiments/:id/blocks/:block_id → update block content
DELETE /api/v1/experiments/:id/blocks/:block_id → delete block
PUT    /api/v1/experiments/:id/blocks/reorder   → batch reorder (accepts [{id, sort_order, parent_id}])

POST   /api/v1/experiments/:id/snapshot-panel   → create panel instance from template
         body: { source_panel_id, panel_type: "flow" | "if" }
         → reads template, snapshots to JSON, creates block, returns block
```

The snapshot endpoint is the only one that reads from template tables — everything else operates on block JSON blobs.

---

## Phased Build Plan

### Phase 1: Backend — Experiment & Block Models + CRUD
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

### Phase 2: Frontend — Block Editor Engine (Generic Blocks)
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

### Phase 3: Experiment Pages + Navigation Relabeling
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

### Phase 4: Panel Instance Blocks
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

### Phase 5: Volume Calculation Tables
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

### Phase 6: Mastermix Detection
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

### Phase 7: Polish + Testing
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

## Notion Export Path (Future)

The block content JSON is designed for easy mapping to Notion API blocks:
- `paragraph`, `heading_1-3`, `bulleted_list_item`, `numbered_list_item`, `callout`, `table`, `divider`, `column_list`, `column` all map to Notion block types
- Plain text strings get wrapped in Notion rich_text arrays: `{ "text": "foo" }` → `{ "rich_text": [{ "type": "text", "text": { "content": "foo" } }] }`
- When rich text annotations are added later, they map directly to Notion's annotation object
- `heading_4` → bold paragraph (Notion only has heading_1-3)
- `flow_panel` / `if_panel` → exported as heading + formatted tables (targets table, assignments table, volume table)
- Colors map directly to Notion's color values

The `Experiment → Notion Page` export function will:
1. Create a Notion page with the experiment name as title
2. Walk blocks in sort_order, converting each to Notion API block format
3. For panel blocks, flatten to heading + formatted tables
4. Use the Notion MCP server for actual page creation

---

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