1# Lab Tools 2 — Master Context Document

> **This file is NOT a build prompt.** It is the full project specification.
> Each phase prompt references this document. Place it at `lab-tools-2/ARCHITECTURE.md` during Phase 1 scaffold so it lives with the code and is always available for context.

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
| IFPanelAssignment.filter_id | MicroscopeFilter | SET NULL | Preserves fluorophore assignment when filter is deleted during microscope reconfiguration |
| ExperimentBlock.experiment_id | Experiment | CASCADE | Blocks belong to experiments |
| ExperimentBlock.parent_id | ExperimentBlock | SET NULL | Orphaned children become top-level blocks |

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
lab-tools-2/
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

---

## Experiment Pages

Add an **Experiment Page** system — a Notion-like block editor where researchers compose experiment documentation inline with embedded, editable panel instances. Existing flow and IF panels become **templates**: reusable blueprints that can be stamped into experiment pages as independent copies. Volume calculations, cocktail tables, and cross-panel mastermix detection operate on these page-scoped instances.

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

Table rows are stored inline in the table block's content as an ordered JSON array. Array index IS the sort order — drag-and-drop reordering reorders the array and saves the entire block. No separate child blocks or sort_order column for rows.

**Column List / Column:**
```json
// column_list content — column_count for rendering hints
{ "column_count": 2 }

// column content — width as percentage of parent column_list
{ "width_pct": 50.0 }
```

**`width_pct`** is a number 0–100 representing the column's percentage width within its parent column_list. Sibling columns' widths sum to approximately 100. Default on insertion is even distribution (`100 / column_count`). Resize via drag handles updates these values in place. Position within the parent's children array IS the column's index — there is no separate `column_index` field.

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

Mastermix only groups same panel type (flow↔flow, IF↔IF). Cross-type grouping is not supported — different dilution sources. If dilution factors differ across panels for the same antibody, show a warning rather than silently combining.

### Navigation & Routing

```
/experiments              → ExperimentList
/experiments/:id          → ExperimentPage (block editor)
/flow/panels              → relabeled "Flow Panel Templates"
/if-ihc/panels            → relabeled "IF/IHC Panel Templates"
```

Sidebar gains an "Experiments" top-level entry above the domain-specific groups.

### Backend API Design

```
GET    /api/v1/experiments                              → paginated list
POST   /api/v1/experiments                              → create experiment
GET    /api/v1/experiments/:id                          → full experiment with all blocks
PUT    /api/v1/experiments/:id                          → update name/description
DELETE /api/v1/experiments/:id                          → delete experiment + cascade blocks

POST   /api/v1/experiments/:id/blocks                   → add block
PUT    /api/v1/experiments/:id/blocks/:block_id         → update block content
DELETE /api/v1/experiments/:id/blocks/:block_id         → delete block
PUT    /api/v1/experiments/:id/blocks/reorder           → batch reorder (accepts [{id, sort_order, parent_id}])

POST   /api/v1/experiments/:id/snapshot-panel           → create panel instance from template
         body: { source_panel_id, panel_type: "flow" | "if" }
         → reads template, snapshots to JSON, creates block, returns block
```

The snapshot endpoint is the only one that reads from template tables — everything else operates on block JSON blobs. Panel instance blocks are one-way snapshots: editing a block on an experiment page does NOT propagate changes back to the template panel.

### Notion Export Path (Future)

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

## Schema Migrations

Schema changes go through Alembic. The baseline migration captures the
schema as of commit `ebeec67`; subsequent changes are versioned as
separate migration files in `backend/alembic/versions/`.

### Developer workflow for schema changes

1. Edit the model in `backend/models.py`
2. From the repo root: `make alembic-revision MSG="describe the change"`
   (this runs `alembic revision --autogenerate` from `backend/`)
3. Review the generated file in `backend/alembic/versions/`
4. Hand-correct anything autogenerate missed (server defaults, check
   constraints, custom types — see Phase 3 baseline review notes)
5. Test locally: `make alembic-upgrade` against a copy of your DB
6. Commit the migration file alongside the model change in the same commit

### Coexistence with legacy `migrate_*()` functions

`backend/main.py` retains 4 hand-rolled column-additive migrations
(`migrate_instrument_fields`, `migrate_secondary_binding_mode`,
`migrate_microscope_excitation`, `migrate_dye_label_targets`) and 1 data
migration (`migrate_dilution_factors`) that run before Alembic in the
lifespan. These exist to bring DBs that predate Alembic to the baseline
schema. New schema changes do NOT use this pattern — they go through
Alembic.

A future Phase 3.5 will retire the schema migrate_*() functions once
all known DBs have been Alembic-stamped.

### Adoption flow

The first time the app starts against a DB that has no `alembic_version`
table, the lifespan runs `alembic stamp head` to mark the DB as being at
the baseline. Subsequent startups run only `alembic upgrade head`, which
is a no-op when no new migrations have been added.

Fresh DBs (`LAB_INIT_DB=1`) follow the same flow: `Base.metadata.create_all`
creates tables, the migrate_*() functions are no-ops on the new tables,
and Alembic stamps at the baseline.

### Test infrastructure

Tests use in-memory SQLite with `Base.metadata.create_all()`. Tests
deliberately do NOT use Alembic. The test
`test_alembic_baseline_matches_create_all` enforces that the two paths
produce identical schemas — if it fails, either Alembic or the test is
wrong, never both.

### Generating migrations: connect to the *previous* schema state

`alembic revision --autogenerate` compares the connected DB's schema
against your models and emits the diff. The connection target matters:

- **Capturing a baseline:** connect to an empty DB
  (`DATABASE_URL=sqlite:////tmp/baseline.db`). All models become
  `op.create_table(...)` calls.
- **Capturing an incremental change:** connect to a DB already at the
  previous baseline state. Only the diff (your model edit) becomes the
  migration.

Connecting to a DB whose schema *already matches* your models will
produce an empty migration. If autogenerate generates an empty file
when you expected changes, your DB is too new — connect to one at the
previous state.

---

## Backup and Recovery

`backend/panels.db` is the single source of truth for all user data
(instruments, antibodies, panels, experiments, etc.).

### Automated snapshots

- Daily snapshots run at server startup (idempotent per-day)
- Manual snapshots via `make backup`
- Snapshots use SQLite's online backup API and are gzip-compressed:
  `backend/backups/panels-YYYY-MM-DD.db.gz`
- Rotation policy: keep last 14 daily + 4 weekly + 2 monthly

### Restore

```
make restore PATH=backend/backups/panels-2026-05-04.db.gz
```

- Refuses to overwrite a live `panels.db` without `ARGS=--force`
- Runs `PRAGMA integrity_check` after restore

### Recovery without backups

If snapshots are missing, the export endpoints under `/api/v1/export/*`
serve as a partial escape hatch. All major tables now have export coverage:

| Resource | Export endpoint | Import endpoint |
|---|---|---|
| Antibodies | `GET /api/v1/export/antibodies` | `POST /api/v1/import/antibodies/commit` |
| Secondary antibodies | `GET /api/v1/export/secondaries` | `POST /api/v1/import/secondaries/commit` |
| Instruments | `GET /api/v1/export/instruments` | `POST /api/v1/import/instruments/commit` |
| Microscopes | `GET /api/v1/export/microscopes` | `POST /api/v1/import/microscopes/commit` |
| Flow panels | `GET /api/v1/export/flow-panels` | `POST /api/v1/import/flow-panels/commit` |
| IF panels | `GET /api/v1/export/if-panels` | `POST /api/v1/import/if-panels/commit` |
| Fluorophores + spectra | `GET /api/v1/export/fluorophores` | `POST /api/v1/import/fluorophores/commit` |
| Plate maps | `GET /api/v1/export/plate-maps` | `POST /api/v1/import/plate-maps/commit` |
| Experiments | `GET /api/v1/export/experiments` | `POST /api/v1/import/experiments/commit` |

**Fluorophore export format:** Spectra are bundled inline as grouped JSON
(`{ spectrum_type: [[wavelength_nm, intensity], ...] }`). A full export of
~1,896 fluorophores with ~838k spectrum rows produces ~20 MB uncompressed
(~3–5 MB gzipped). Acceptable for a one-time recovery operation.

**Import conflict policy:** ID conflict → skip. Name conflict → skip.
Only new fluorophores (no ID or name match) are inserted. Use
`POST /api/v1/import/fluorophores/preview` to see what would be imported
before committing.

### Durability settings

| Setting | Value | Where set |
|---|---|---|
| `journal_mode` | `WAL` | `database.py` connect listener (explicit on every connect) |
| `synchronous` | `FULL` | SQLite default — each write is fsync'd |
| `foreign_keys` | `ON` | `database.py` connect listener |