# Lab Tools 2 — Recon Report

Read-only reconnaissance for two upcoming features:
(a) Controls accordion embedded inside flow + IF panel design blocks.
(b) Antibody-mixing calculations engine with sidebar/dock/detached-window UI.

All findings below come from reading the repo only. No files modified.

---

## 1. Repo + stack overview

### Top-level tree (skipping `node_modules`, `.venv`, `.git`, `__pycache__`, `dist`)

```
.
├── ARCHITECTURE.md
├── BUG-REPORT.md
├── CLAUDE.md
├── EXPERIMENT-PAGE-ARCHITECTURE.md
├── FRONTEND-CONVENTIONS.md
├── README.md
├── .agent/
│   └── rules/rules.md           (mirror of CLAUDE.md must-do checklist)
├── .claude/settings.local.json
├── .vscode/tasks.json
├── backend/
│   ├── database.py
│   ├── main.py
│   ├── models.py
│   ├── schemas.py
│   ├── seed_fpbase.py
│   ├── utils.py
│   ├── requirements.txt
│   ├── panels.db (+ wal/shm)
│   ├── seed_data/                  (instruments.json, fluorophores.json)
│   ├── routers/                    (16 router modules — one per resource)
│   ├── services/                   (csv_import, dilutions, fluorophore_import,
│   │                                 fpbase, spectra, spillover)
│   └── tests/                      (19 pytest files, conftest.py)
├── frontend/
│   ├── index.html
│   ├── package.json / package-lock.json
│   ├── postcss.config.js
│   ├── tailwind.config.js
│   ├── tsconfig.json
│   ├── vite.config.ts
│   ├── vite-env.d.ts
│   └── src/
│       ├── App.tsx, main.tsx, index.css, test-setup.ts
│       ├── api/                    (15 modules, 1:1 with routers)
│       ├── hooks/                  (16 TanStack-Query hook files + __tests__/)
│       ├── components/
│       │   ├── antibodies/  dye-labels/  experiments/  fluorophores/
│       │   ├── home/        if-panels/   instruments/  layout/
│       │   ├── microscopes/ panels/      placeholder/  plate-maps/
│       │   ├── secondaries/ settings/    shared/       spectra/
│       ├── types/index.ts          (single barrel — ~970 lines, no subdirectories)
│       ├── utils/                  (spectra, spillover, dilutions, conjugates,
│       │                            colors, plateMapColors, plateTypes,
│       │                            fuzzySearch, search, wellUtils, crossReactivity)
│       └── __tests__/               (component + util tests)
├── resources/fluorophores.json
├── fpbase_data/                     (parquet + csv FPbase spectra cache)
├── test_data/secondary_antibodies.csv
├── download_fpbase_spectra.py
└── panels.db                        (project-root copy; backend also has its own)
```

### Frontend stack

- **React 18.3.1** with `react-dom@18.3.1` (`frontend/package.json`).
- **Build tool: Vite 6.0.5**, plugin `@vitejs/plugin-react@4.3.4`.
- **TypeScript 5.7.2**. Strict mode is **on**:
  ```jsonc
  // frontend/tsconfig.json
  "strict": true,
  "noUnusedLocals": true,
  "noUnusedParameters": true,
  "noFallthroughCasesInSwitch": true,
  "forceConsistentCasingInFileNames": true,
  "baseUrl": ".",
  "paths": { "@/*": ["src/*"] },
  "types": ["vitest/globals"]
  ```
- **State management: no Zustand / Redux / Jotai.** Server state via TanStack Query; local UI state via `useState` / `useReducer`. App-wide context is used sparingly (`ThemeContext`, `ToastProvider`, see `frontend/src/main.tsx:13–22`).
- **Data layer: `@tanstack/react-query@^5.62.0`**. Single `QueryClient` instantiated in `main.tsx`. No React Query Devtools, no `react-hook-form`, no `zod` — handwritten fetch + plain `useState` forms throughout.
- **Routing: `react-router-dom@^6.28.0`** (BrowserRouter, declarative `<Routes>` in `App.tsx`).

### Backend stack

- **FastAPI** + **SQLAlchemy 2.x** (`DeclarativeBase`, `select(...)` style — see `backend/database.py`).
- **SQLite** via `sqlite:///panels.db`. FK pragma is set in a `connect` event listener (`database.py:18`).
- **Pydantic v2** schemas in `backend/schemas.py`.
- **Migrations:** none. `Base.metadata.create_all()` runs in the FastAPI lifespan, plus a cluster of one-time `migrate_*` functions in `main.py` that use raw `ALTER TABLE` via `text()`.
- **CORS:** `allow_origins=["*"]`, all methods/headers (`main.py:497`).
- No auth middleware / login. Single-user app.

---

## 2. Block architecture

This is the heart of the reuse opportunity for the controls accordion. **Important:** there is **no third-party block editor** (no BlockNote, Tiptap, Lexical, Plate). The block engine is **hand-rolled** specifically for this project, modeled loosely on the Notion block schema.

### Where blocks live

- All block components live in `frontend/src/components/experiments/`. There's no plugin folder, registry file, or per-block subfolder. Each block has a single `*.tsx` file.
- TypeScript content shapes are co-located in the global barrel at `frontend/src/types/index.ts:716–942`.

### Block-type registry / discriminated union

There is **no central registry** (no `blockTypes.ts`, no `Map<string, BlockDef>`). Instead:

1. `BlockCommandMenu.tsx:16–56` declares what types the user can *insert*:
   ```ts
   const MENU_CATEGORIES: BlockMenuCategory[] = [
     { name: 'Text',    items: [paragraph, heading_1, heading_2, heading_3, heading_4] },
     { name: 'Lists',   items: [bulleted_list_item, numbered_list_item] },
     { name: 'Media',   items: [callout, divider, table] },
     { name: 'Layout',  items: [column_list (2-col), column_list_3] },
     { name: 'Panels',  items: [flow_panel, if_panel] },
   ]
   ```
   The `column_list_3` synthetic value is rewritten to `column_list` with `column_count: 3` at insert time (`BlockRenderer.tsx:339`).

2. `BlockRenderer.tsx:709–841` is the renderer dispatcher — a long if-ladder on `block.block_type`:
   ```ts
   const TEXT_BLOCK_TYPES = new Set([
     'paragraph','heading_1','heading_2','heading_3','heading_4',
     'bulleted_list_item','numbered_list_item',
   ])
   if (TEXT_BLOCK_TYPES.has(block.block_type)) return <TextBlockEditor … />
   if (block.block_type === 'divider')       return <DividerBlock … />
   if (block.block_type === 'callout')       return <CalloutBlock … />
   if (block.block_type === 'table')         return <TableBlock … />
   if (block.block_type === 'column_list')   return <ColumnLayout … />
   if (block.block_type === 'flow_panel')    return <FlowPanelBlock … />
   if (block.block_type === 'if_panel')      return <IFPanelBlock … />
   return <div>Unknown block type</div>
   ```

3. The full set of types accepted by the backend lives in a `String(30)` column (`backend/models.py:569`):
   - `paragraph`, `heading_1`, `heading_2`, `heading_3`, `heading_4`
   - `bulleted_list_item`, `numbered_list_item`
   - `callout`, `divider`, `table`
   - `column_list`, `column`
   - `flow_panel`, `if_panel`

   No backend enum / check constraint enforces this. Adding a new type just requires the frontend to know about it.

### Block persistence — quoted type definition

Backend SQLAlchemy model (`backend/models.py:560–581`):

```python
class ExperimentBlock(Base):
    __tablename__ = "experiment_blocks"
    id            = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    experiment_id = Column(String(36), ForeignKey("experiments.id", ondelete="CASCADE"), nullable=False)
    block_type    = Column(String(30), nullable=False)
    content       = Column(Text, nullable=False, default="{}")     # JSON-stringified
    sort_order    = Column(Float,  nullable=False)                  # float for cheap insert-between
    parent_id     = Column(String(36), ForeignKey("experiment_blocks.id", ondelete="SET NULL"), nullable=True)
    created_at    = Column(DateTime, server_default=func.now())
    updated_at    = Column(DateTime, server_default=func.now(), onupdate=func.now())
```

Frontend mirror (`frontend/src/types/index.ts:716–725`):

```ts
export interface ExperimentBlock {
  id: string
  experiment_id: string
  block_type: string
  content: Record<string, unknown>   // server already parsed the JSON
  sort_order: number
  parent_id: string | null
  created_at: string | null
  updated_at: string | null
}
```

Server-side `_block_to_read` (`backend/routers/experiments.py:99–109`) does `json.loads(block.content)` on read, and writes do `json.dumps(data.content)` (`experiments.py:230`, `:296`). The frontend deals only in parsed objects.

### Render contract

Each block component takes a roughly uniform prop signature:

```ts
interface BlockProps {
  experimentId: string
  block: ExperimentBlock
  // optional, only for blocks that need the broader catalog:
  libraryData?: PanelLibraryData
  // ColumnLayout receives:
  // childrenByParentId, renderBlock, onAddBlockToColumn, onDeleteColumnBlock, onOpenTemplatePicker
}
```

Each component **owns its own debounced auto-save fetch** directly to `PUT /api/v1/experiments/:id/blocks/:blockId`. There is no shared block-write hook. Examples:

- `CalloutBlock.tsx:42–53` — `flushCalloutSave` uses `keepalive` fetch.
- `FlowPanelBlock.tsx:122–211` — `saveContent` + `markDirty` debounce (1500 ms) + flush-on-unmount.
- `TextBlockEditor.tsx`, `TableBlock.tsx` follow the same idiom.

### How a new block type would be added

There's no automation — registration is by string match in three or four places:

1. Add an entry in `BlockCommandMenu.tsx:MENU_CATEGORIES` so users can insert it.
2. Add a new `*.tsx` block component in `components/experiments/`.
3. Add a branch in `BlockRenderer.tsx`'s `renderBlock` if-ladder (`:709–841`).
4. Optionally add a content-shape interface to `types/index.ts`.
5. Backend: nothing — `block_type` is a free-form string and `content` is a JSON blob.

### Intra-block state — block-local vs. parent

- Each block owns its own `useState`-driven editing buffer. The server-canonical content lives in `block.content`; the local component tracks dirty edits.
- A `userEdited` ref (e.g., `CalloutBlock.tsx:65`) prevents the "props sync back from server" effect from clobbering in-progress edits.
- There's a clear pattern of `ref`s shadowing state for unmount/keepalive flush (best example: `InstrumentEditor.tsx:77–83`).
- Cross-block communication is currently **none**. There is no event bus, broadcast, or shared store for "panel X just changed antibody Y." Anything cross-block (e.g., the planned mastermix detector that scans every panel block on a page) will have to live in `ExperimentPage.tsx` and walk `experiment.blocks`.

The flow/IF panel blocks are the exception — they're the only blocks that pull a complex domain reducer (`usePanelDesigner` / `useIFPanelDesigner`) into block scope.

### Block-local UI vs. persisted config

There is no formal split. By convention, anything ephemeral (open-state of a popover, current selection, current input buffer) lives in `useState`/refs and is **never** written to `content`. The planned controls accordion's open/closed state probably wants the same treatment (per-block-id keyed in `localStorage`, similar to `experiment-page-full-width` at `ExperimentPage.tsx:88–90`).

---

## 3. Panel design blocks

### Files

- `frontend/src/components/experiments/FlowPanelBlock.tsx` — wraps `PanelDesignerView` for inline editing inside an experiment block.
- `frontend/src/components/experiments/IFPanelBlock.tsx` — wraps `IFPanelDesignerView`.
- The **template** designers used outside experiments live in:
  - `components/panels/PanelDesigner.tsx` (template page at `/flow/panels/:id`)
  - `components/if-panels/IFPanelDesigner.tsx` (template page at `/if-ihc/panels/:id`)
- The **shared view** (used by both template + block):
  - `components/panels/PanelDesignerView.tsx` (~hundreds of lines, drives the table grid + heatmap)
  - `components/if-panels/IFPanelDesignerView.tsx`

The view is a presentational layer; it accepts the reducer state + a fat `handlers` prop bag. Both the template page and the block use the same view by adapting their persistence layer to the same handler shape.

### Persisted shape — flow panel block

`FlowPanelBlockContent` (`types/index.ts:855–892`):

```ts
export interface FlowPanelBlockContent {
  source_panel_id: string
  name: string
  instrument: SnapshotInstrument | null
  targets: FlowPanelInstanceTarget[]
  assignments: FlowPanelInstanceAssignment[]
  volume_params: VolumeParams
}

export interface FlowPanelInstanceTarget {
  id: string
  antibody_id: string | null
  antibody_name: string | null
  antibody_target: string | null
  antibody_host: string | null
  antibody_clone: string | null
  dye_label_id: string | null
  dye_label_name: string | null
  dye_label_target: string | null
  dye_label_fluorophore_id: string | null
  dye_label_fluorophore_name: string | null
  staining_mode: string                  // "direct" | "indirect"
  secondary_antibody_id: string | null
  secondary_antibody_name: string | null
  sort_order: number
  flow_dilution_factor: number | null    // N in 1:N (snapshotted from antibody/dye)
  icc_if_dilution_factor: number | null
}

export interface FlowPanelInstanceAssignment {
  id: string
  antibody_id: string | null
  dye_label_id: string | null
  fluorophore_id: string
  fluorophore_name: string | null
  detector_id: string
  detector_name: string | null
}

export interface VolumeParams {
  num_samples: number
  volume_per_sample_ul: number
  pipet_error_factor: number
  dilution_source: 'flow' | 'icc_if'
}
```

The `instrument` field is a **snapshot copy** of the lasers + detectors (ids/labels/wavelengths), not a reference to the live `Instrument` row — see `SnapshotInstrument` (`types/index.ts:826–830`) and `_snapshot_instrument()` in `backend/routers/experiments.py:45–68`. This is the "panel instances are detached snapshots" rule from `EXPERIMENT-PAGE-ARCHITECTURE.md`.

### Persisted shape — IF panel block

`IFPanelBlockContent` (`types/index.ts:894–935`) is structurally similar but:
- Has `panel_type: string` and `view_mode: string` ("simple" / "spectral").
- Uses `microscope: SnapshotMicroscope | null` instead of `instrument`.
- Targets carry `dilution_override: string | null` and `icc_if_dilution_factor: number | null`.
- Assignments use `filter_id` / `filter_name` instead of `detector_id` / `detector_name`.
- Targets carry `secondary_fluorophore_id` / `secondary_fluorophore_name` (the secondary's own fluorophore, separate from any direct antibody fluorophore).

### How targets are added/removed

For inline (in-experiment) blocks, all mutations are local-state-only and persisted via the debounced PUT-block:

`FlowPanelBlock.tsx:225–266` — `onAddTarget`:
```ts
onAddTarget: async (selection: TargetSelection) => {
  const target: PanelTarget = selection.type === 'antibody' ? { …antibody_id, … } : { …dye_label_id, … }
  dispatch({ type: 'ADD_TARGET', target })
  markDirty()
  return null
}
```
The reducer (see Section 4 of usePanelDesigner below) updates `state.targets` synchronously; `markDirty` re-arms the 1500 ms timer that posts the whole block JSON.

For the **template** (`PanelDesigner.tsx:230–250`), `onAddTarget` calls the backend `useAddTarget` mutation first and then commits the server-assigned id:
```ts
const target = await addTargetMutation.mutateAsync({ panelId: id, data })
addTarget(target)
```

### Channels / detector assignment

`onDirectAssign(rowId, fluorophoreId, detectorId, isDyeLabel?)` — the canonical assignment handler:
- Block version (`FlowPanelBlock.tsx:345–363`): create assignment locally, dispatch `ADD_ASSIGNMENT`, debounced save.
- Template version (`PanelDesigner.tsx:350–391`): optimistic id + true mutation + roll back on error, with `UPDATE_ASSIGNMENT_ID` to swap the optimistic id once the server returns the real one.

Uniqueness invariants enforced in the reducer + DB:
- One assignment per `panel_id × antibody_id` (`PanelAssignment.uq_panel_antibody`).
- One assignment per `panel_id × detector_id` (`PanelAssignment.uq_panel_detector`).

### Subcomponents inside `PanelDesignerView`

(Names harvested from the imports at `components/panels/PanelDesignerView.tsx:1–43`.)

- `TargetOmnibox` — antibody / dye-label fuzzy picker for adding rows.
- `SecondaryOmnibox` — picker for indirect staining.
- `CellAssignmentPicker` — the per-cell fluorophore picker that opens from a target × detector intersection.
- `SpilloverHeatmap` — Chart.js-backed heatmap.
- `PanelSpectraByLaser` — overlay charts grouped per laser.
- `CrossReactivityWarnings` (`components/shared/`) — host/target species clash warnings.

### Change events: optimistic / debounce / mutation

| Surface          | Pattern                                                     | Source                                    |
|------------------|-------------------------------------------------------------|-------------------------------------------|
| Block (inline)   | Local reducer dispatch + 1500 ms debounce + keepalive PUT   | `FlowPanelBlock.tsx:204–211`              |
| Template page    | Optimistic dispatch + TanStack mutation; reconcile via `UPDATE_ASSIGNMENT_ID` or full refetch on undo failure | `PanelDesigner.tsx:140–184`               |
| Block panel-name | Same debounce; dispatched into reducer first                | `FlowPanelBlock.tsx:377–390`              |

The reducer (`usePanelDesigner.ts`) is the unifying piece: both surfaces drive the same state shape so the same `PanelDesignerView` works for both.

---

## 4. Experiment entity

### Backend model

`backend/models.py:521–530`:

```python
class Experiment(Base):
    __tablename__ = "experiments"
    id          = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name        = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    created_at  = Column(DateTime, server_default=func.now())
    updated_at  = Column(DateTime, server_default=func.now(), onupdate=func.now())
    blocks      = relationship("ExperimentBlock", back_populates="experiment", cascade="all, delete-orphan")
```

Pydantic schemas live in `backend/schemas.py` (`ExperimentCreate`, `ExperimentRead`, `ExperimentUpdate`, `ExperimentBlockCreate/Update/Read`, `ExperimentBlockReorder`, `SnapshotPanelRequest`).

### Frontend types

`types/index.ts:716–778` — `Experiment`, `ExperimentListItem`, `ExperimentBlock`, plus `ExperimentBlockCreate/Update`, `ExperimentBlockReorderItem`, `SnapshotPanelRequest`, `TextBlockContent`, `CalloutBlockContent`, `TableBlockContent`, `ColumnListBlockContent`, `ColumnBlockContent`, all the `Snapshot*` shapes, and `VolumeParams`.

### Routing

```
GET   /api/v1/experiments               (paginated list)
POST  /api/v1/experiments
GET   /api/v1/experiments/:id           (full detail with all blocks, sorted)
PUT   /api/v1/experiments/:id           (name + description)
DELETE /api/v1/experiments/:id          (cascade through blocks)

POST  /api/v1/experiments/:id/blocks
PUT   /api/v1/experiments/:id/blocks/reorder         (batch [{id, sort_order, parent_id}])
PUT   /api/v1/experiments/:id/blocks/:block_id
DELETE /api/v1/experiments/:id/blocks/:block_id

POST  /api/v1/experiments/:id/snapshot-panel
        body: { source_panel_id, panel_type: "flow" | "if" }
```

Note: the reorder route is intentionally registered **before** `:block_id` to avoid `"reorder"` matching as a block id (`backend/routers/experiments.py:240–242`). Frontend route patterns:

```tsx
// frontend/src/App.tsx:35–36
<Route path="/experiments" element={<ExperimentList />} />
<Route path="/experiments/:id" element={<ExperimentPage />} />
```

### How blocks attach

`ExperimentBlock.experiment_id` FK → `experiments.id` with `ondelete="CASCADE"` and an ordered list pulled out at read time:

```python
# backend/routers/experiments.py:119–122
"blocks": [_block_to_read(b) for b in sorted(exp.blocks, key=lambda x: x.sort_order)]
```

`sort_order` is `Float` to enable O(1) insert-between (`BlockRenderer.tsx:281–283`):

```ts
const newSortOrder = next ? (current.sort_order + next.sort_order) / 2
                          : current.sort_order + 1.0
```

There is no compaction logic anywhere in the codebase — the float will keep splitting until the user manually reorders. This was flagged as a Phase 7 follow-up in `EXPERIMENT-PAGE-ARCHITECTURE.md` but is still open.

Nesting is via `parent_id` (self-FK). It's used for:
- column children (`parent_id` → a `column` block's id; column's parent is a `column_list`)
- toggleable heading children (`is_toggleable` text blocks)
- nested list items

Top-level blocks have `parent_id === null`.

### Page-level state on the frontend

**One `useExperiment(id)` query per page**, not one per block:

```tsx
// frontend/src/components/experiments/ExperimentPage.tsx:28
const { data: experiment, isLoading, error } = useExperiment(id)
```

Then `experiment.blocks` (the eagerly-fetched array of all blocks for the page) is passed into `BlockRenderer`. Each individual block PUTs its own updates and the page invalidates `['experiments', id]` after every successful mutation:

```tsx
// BlockRenderer.tsx:264–266
const invalidate = () => qc.invalidateQueries({ queryKey: ['experiments', experimentId] })
```

In addition, **`ExperimentPage` is the single fetch site for the supporting catalog** used by every panel block on the page (`ExperimentPage.tsx:31–82`):

- `useAntibodies({ skip: 0, limit: 2000 })`
- `useFluorophores({ skip: 0, limit: 2000, has_spectra: true })` and a second call with `has_spectra: false`
- `useSecondaries()`
- `useConjugateChemistries()`
- `useInstruments(0, 500)`
- `useMicroscopes(0, 500)`
- `useDyeLabels({ limit: 2000 })`
- `useBatchSpectra(fluorophoreIdsToFetch)` — single call, 5-minute `staleTime`.

These are bundled into a `PanelLibraryData` object and threaded down to `FlowPanelBlock` / `IFPanelBlock`. The catalog is **shared across all panel blocks on the page** — for the calculations engine, the same `libraryData` shape would supply everything you need (host, dilution, fluorophore, etc.).

`ExperimentPage` also owns the title/description debounced auto-save (`ExperimentPage.tsx:138–165`) with `keepalive` flush on unmount and a small `SaveStatus` indicator (`'idle' | 'saving' | 'saved' | 'error'`), but **no global save status store** — see Section 7.

---

## 5. Antibody / secondary / dye / fluorophore data

### Backend models (file paths + key fields)

`backend/models.py:109–146` — **`Antibody`**:

```
id, name (full display "TUJ1 chk Millipore"), target, clone, host, isotype,
fluorophore_id (FK→Fluorophore SET NULL),    # direct-conjugate flag
conjugate (str, e.g. "AF488"),
vendor, catalog_number,
confirmed_in_stock, date_received,
flow_dilution (str), icc_if_dilution (str), wb_dilution (str),
flow_dilution_factor (int N in 1:N),
icc_if_dilution_factor (int),
wb_dilution_factor (int),
reacts_with (Text, JSON array of target species strings),
storage_temp, validation_notes, notes, website, physical_location,
is_favorite, created_at, updated_at,
UniqueConstraint(name, catalog_number)
+ many-to-many `tags` via AntibodyTagAssignment
```

Direct-conjugate flag: a non-null `fluorophore_id` means pre-conjugated.

`backend/models.py:174–196` — **`SecondaryAntibody`**:

```
id, name, host, target_species, target_isotype,
binding_mode (str(20), default "species" or "conjugate"),
target_conjugate (str, e.g. "biotin"),
fluorophore_id (FK SET NULL), vendor, catalog_number, lot_number, notes,
created_at, updated_at
```

No clone/clonality. No `is_favorite`. No dilution columns (secondaries inherit dilution from the primary's flow/icc_if values via the IF panel target).

`backend/models.py:533–557` — **`DyeLabel`**:

```
id, name (unique), label_target (e.g. "Nuclei", "Mitochondria"),
category (e.g. "viability", "organelle"),
fluorophore_id (FK SET NULL), vendor, catalog_number, lot_number,
flow_dilution (str), icc_if_dilution (str),
flow_dilution_factor (int), icc_if_dilution_factor (int),
notes, is_favorite, created_at, updated_at
```

`backend/models.py:64–87` — **`Fluorophore`**:

```
id (string, FPbase slug or UUID — String(100)),
name (unique), fluor_type ("protein"|"dye"|"non-fluorescent"),
source ("FPbase"|"system"|"seed"|"user"),
ex_max_nm, em_max_nm, ext_coeff, qy, lifetime_ns,
oligomerization, switch_type,
has_spectra, is_favorite,
spectra_records → FluorophoreSpectrum[]    # tall table, EX/EM/AB/A_2P
```

Spectra are **not** in the same row — they're in `FluorophoreSpectrum` (long format). The list endpoint omits spectra; spectra come from `GET /fluorophores/:id/spectra`, `POST /fluorophores/batch-spectra`, or precomputed FPbase parquet under `fpbase_data/`.

### Frontend hooks + query-key conventions

All in `frontend/src/hooks/`:

```ts
// hooks/useAntibodies.ts
useAntibodies(params: AntibodyListParams)         // queryKey: ['antibodies', params]
useAntibody(id)                                    // ['antibodies', id]
useCreateAntibody / useUpdateAntibody / useDeleteAntibody
useToggleAntibodyFavorite

// hooks/useSecondaries.ts
useSecondaries(params)                             // ['secondary-antibodies', params]

// hooks/useDyeLabels.ts
useDyeLabels(params)                               // ['dye-labels', params]

// hooks/useFluorophores.ts (richest set)
useFluorophores(params)                            // ['fluorophores', params]
useFluorophoreSpectra(id)                          // ['fluorophores', id, 'spectra']
useInstrumentCompatibility(id)                     // ['fluorophores', id, 'instrument-compatibility']
useMicroscopeCompatibility(id)                     // ['fluorophores', id, 'microscope-compatibility']
useBatchSpectra(ids)                               // ['fluorophores', 'batch-spectra', sortedIds]
                                                   //   staleTime: 5 * 60 * 1000
useFpbaseCatalog()                                 // ['fpbase-catalog'], staleTime 30 min
useRecentFluorophores()                            // ['recentFluorophores'], staleTime 10 min
```

All list hooks default to `placeholderData: (prev) => prev` so paginated UIs stay populated during refetch.

### Client-side cache

There is **no separate "catalog cache" abstraction**. The TanStack Query cache *is* the catalog cache. The only deliberate global is the batch-spectra cache (`useBatchSpectra`) keyed by sorted ids with a 5-minute staleness window — `useFluorophores.ts:55–58`.

For `ExperimentPage`, the convention is "fetch the whole catalog once at the top of the page using high `limit` (2000)" — see `ExperimentPage.tsx:32–47`. Components below it never re-fetch. This is the pattern the calculations engine should follow.

Pagination defaults: `skip=0`, `limit=100`, max `500`. Antibody / dye-label / fluorophore endpoints accept `limit` up to 2000 in practice (the experiment page passes 2000).

---

## 6. Sidebar / flyout infrastructure

**There is no general-purpose right-side drawer / flyout component.** What exists:

- `frontend/src/components/layout/Sidebar.tsx` — the left-side nav. Has its own portal-rendered "flyout" submenu when collapsed (state at `Sidebar.tsx:109–111`, rendered with `createPortal`, positioned by saved coords). This is **specific to nav menus**, not reusable for content.
- `frontend/src/components/layout/Modal.tsx` — a centered modal:
  ```tsx
  // Modal.tsx:12
  function Modal({ isOpen, onClose, title, children, wide, size: 'default'|'wide'|'xl' })
  ```
  Uses `fixed inset-0 z-50 flex items-center justify-center bg-black/40` overlay, `<div onClick>` for backdrop dismiss, ESC handler. Used heavily in lists (`ExperimentList`, `PanelTemplatePicker`, etc.).

What does **not** exist:
- No `Drawer` / `Sheet` / `Flyout` component anywhere.
- No `@radix-ui/*`, no `@headlessui/*`, no `cmdk`, no `vaul`.
- No URL-driven flyout (no `?panel=…` query string conventions).
- No global "open right panel" state. There is no Zustand or context-based UI store.

Open/closed state for the closest analog (the `Sidebar` flyout) lives in component-local `useState` — not global. The `Modal` has no open/closed coordination of its own; callers track it.

For the calculations sidebar/dock/detached-window feature, this means we'll need to **build a new shell component** (probably `RightDrawer`) and decide where its open state lives. Reasonable options:
- A new context provider next to `ToastProvider` (lightweight, fits existing patterns).
- A URL search param (`?calc=open`) — fits existing nav idioms.
- `localStorage` key (matches `experiment-page-full-width` at `ExperimentPage.tsx:88–90`).

The codebase has zero precedent for hosting multiple panels in a single right-side container. Single-slot is the simpler match for what's already here.

---

## 7. Autosave + dirty-state + navigation guards

### How autosave currently works

Two distinct patterns coexist:

**Pattern A — debounce + keepalive PUT, owned by the editor component.**

Reference: `InstrumentEditor.tsx:139–173`.

```ts
const DEBOUNCE_MS = 1500
useEffect(() => {
  if (!userEdited.current) return
  if (debounceRef.current) clearTimeout(debounceRef.current)
  debounceRef.current = setTimeout(() => doSave(form), DEBOUNCE_MS)
  return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
}, [form, doSave])

// flush on unmount with raw fetch + keepalive
useEffect(() => () => {
  if (debounceRef.current) clearTimeout(debounceRef.current)
  if (intentionalLeaveRef.current) return
  if (dirtyRef.current && idRef.current) flushSave(idRef.current, formRef.current)
}, [])

// beforeunload warning when dirty
useEffect(() => {
  const handler = (e: BeforeUnloadEvent) => { if (dirtyRef.current) e.preventDefault() }
  window.addEventListener('beforeunload', handler)
  return () => window.removeEventListener('beforeunload', handler)
}, [])
```

Same pattern in `MicroscopeEditor.tsx:79–176`, `PlateMapEditor` (per CLAUDE.md), all the block-level components (`CalloutBlock`, `TextBlockEditor`, `TableBlock`, `FlowPanelBlock.tsx:204–222`, `IFPanelBlock`), and the experiment header (`ExperimentPage.tsx:138–165`).

The `userEdited` ref guard prevents the initial `setState` from props from triggering a save on mount — important rule, also called out in CLAUDE.md.

**Pattern B — optimistic TanStack mutation + invalidate.**

Used by the **template** panel designer (`PanelDesigner.tsx`) for assignments:
- Optimistic dispatch with `optimistic-${Date.now()}` id.
- `mutateAsync` returns the real id.
- `UPDATE_ASSIGNMENT_ID` reducer action swaps the id.
- On error: rollback by re-adding the previous assignment.
- Undo/redo replays adds/removes by walking the diff between snapshots and calling individual mutations (see `PanelDesigner.tsx:140–184` `syncUndoRedo`); on failure: full server reconcile (`forceRefresh`).

### Global dirty / saving / saved state

There is **no global** save state. Each editor component owns a local `saveStatus: 'idle'|'saving'|'saved'|'error'` (e.g. `ExperimentPage.tsx:17,87`, `InstrumentEditor.tsx:69`) that it renders inline. There is no mechanism to know "any block on this page is dirty" without walking children. For the calculations panel, if you need that signal, you'd have to add it (e.g. via a small dedicated context).

### `beforeunload` and navigation guards

- **`beforeunload`**: present in `InstrumentEditor.tsx:164–173` and `MicroscopeEditor.tsx:168–176`. The block-level + experiment-page-level autosaves do **not** install `beforeunload` — they rely on the unmount-flush + `keepalive` pattern. Result: closing the tab while a 1500 ms debounce is pending will lose those edits. Worth knowing for the calc engine.
- **No router navigation guards**. React Router v6 `<Prompt>` was removed; there's no `useBlocker` or `unstable_usePrompt` use here. Intentional in-app navigation (e.g. `Delete`) sets `intentionalLeaveRef.current = true` to bypass the unmount flush (`InstrumentEditor.tsx:222–239`).

### Toast / save indicator

`frontend/src/components/layout/Toast.tsx` — context-based 3-second auto-dismiss toasts (`success`/`error`/`info`). Provider mounted in `main.tsx`. Used selectively (e.g. undo failures in `PanelDesigner.tsx`).

Inline save indicators are individual per-component spans (e.g. `ExperimentPage.tsx:221–229`):
```tsx
{saveStatus === 'saving' && <span className="text-xs text-gray-400">Saving...</span>}
{saveStatus === 'saved'  && <span className="text-xs text-green-600">Saved</span>}
{saveStatus === 'error'  && <span className="text-xs text-red-500">Save failed</span>}
```
There is no shared `SaveStatusBadge` component.

---

## 8. Undo / redo

### What exists today

A **per-panel-instance** undo stack lives inside `usePanelDesigner` (`frontend/src/hooks/usePanelDesigner.ts`).

```ts
const UNDO_CAP = 50

interface PanelDesignerState {
  panel: Panel | null
  instrument: Instrument | null
  targets: PanelTarget[]
  assignments: PanelAssignment[]
  isDirty: boolean
  past:   PanelAssignment[][]   // stack of prior `assignments` arrays
  future: PanelAssignment[][]
}

function pushUndo(state) {
  const past = [...state.past, state.assignments]
  if (past.length > UNDO_CAP) past.shift()
  return { past, future: [] }
}
```

- Scope: **only the assignments array** of a single panel. Targets, panel name, and instrument changes are **not** undoable. `CLEAR_ASSIGNMENTS` resets both stacks.
- In-memory, cleared on navigation away (the hook unmounts).
- An identical hook exists for IF panels (`useIFPanelDesigner`) per the file listing.

### Undo's interaction with autosave / mutations

**Inside the experiment block** (`FlowPanelBlock.tsx:413–414`):
```ts
onUndo: () => { undo(); markDirty() },
onRedo: () => { redo(); markDirty() },
```
Undo simply re-dispatches state; the same debounced PUT then ships the new `assignments` array to the server with everything else.

**On the template page** (`PanelDesigner.tsx:140–184`), the `syncUndoRedo` flow:
1. Snapshot the diff (added vs. removed assignments) between `state.assignments` and the target undo/redo snapshot.
2. Apply the local undo first.
3. For each `removed` assignment, call `removeAssignmentMutation`.
4. For each `added` assignment, call `addAssignmentMutation` and patch the new server id with `UPDATE_ASSIGNMENT_ID`.
5. On failure: toast + `reconcileFromServer()` which refetches the panel.

So yes, in template mode, undo *does* trigger server saves. In block mode, it just marks the block dirty for the next debounce.

### Libraries already available for an extension

- `immer` — **not** present (`frontend/package.json` shows none of `immer`, `use-immer`, `zundo`, `use-undo`).
- The reducer is plain immutable spread/filter — adding immer is a separate decision.
- No undo/redo libraries beyond the bespoke pair-stack in `usePanelDesigner`.
- No keyboard binding for undo/redo at the window level — currently invoked by buttons in `PanelDesignerView`.

For the calculations engine, you should treat undo as **out of scope unless explicitly built for it.** There's no app-wide undo to extend.

---

## 9. Notion markdown export

**There is no markdown export today.** Confirmed by:

```
$ grep -rn "Notion\|markdown\|to_markdown\|toMarkdown\|exportMarkdown" frontend/ backend/ …
backend/services/csv_import.py:11:  # CSV column header mapping (Notion export headers -> internal field names)
backend/services/csv_import.py:220: Handles UTF-8 BOM encoding from Notion exports.
backend/routers/antibodies.py:548-556: # --- Commented-out Notion Direct Import --- TODO …
```

All existing matches are about **importing from Notion** (CSV ingest of antibodies that the user previously kept in Notion). There is:

- No serializer for `ExperimentBlock` → markdown.
- No "Export to Notion" button in any UI.
- No block-to-markdown dispatcher pattern.
- No clipboard-copy or download utility for experiment content.

What does exist that's adjacent:
- Resource exports (instruments, panels, etc.) via `backend/routers/export_import.py` and `frontend/src/api/exportImport.ts` — these emit JSON, not markdown, and are scoped to single resources.
- `frontend/src/components/instruments/InstrumentEditor.tsx:207–220` `handleExport` — pattern for triggering a JSON file download in-browser using a Blob + anchor click. Reusable as a download primitive when the markdown serializer is built.

The build plan in `EXPERIMENT-PAGE-ARCHITECTURE.md` (lines about "Notion Export Path (Future)") describes the intended translation of each block type to Notion API shape, but **none of it is implemented**. Building this from scratch means:

1. Pure `serializeBlock(block: ExperimentBlock, children?: ExperimentBlock[]): string` per block type.
2. A walker that traverses `experiment.blocks` in `sort_order`, respecting `parent_id` (for columns / toggle headings).
3. The `flow_panel` / `if_panel` blocks serialize to a heading + a markdown table from the snapshot — straightforward because everything you need (`targets`, `assignments`, `instrument.name`, `microscope.name`) is already in `block.content`. A trailing "calculations" section can be appended in the same walker.
4. Frontend trigger using the existing `Blob + URL.createObjectURL + a.click()` idiom.

There's no existing dispatcher to extend — you'd be defining the contract.

---

## 10. Services layer

### Backend services

`backend/services/`:

- `csv_import.py` — antibody CSV → diff response.
- `dilutions.py` — `parse_dilution(text) -> int | None`. Pure function with regex over messy human inputs (`"1:100"`, `"1/200"`, `"1:50-1:100"`, `"100"`, `"1:100 (flow)"`).
- `fluorophore_import.py`
- `fpbase.py`
- `spectra.py`
- `spillover.py`

These are imported into routers as plain modules. Pattern is "pure function on top of plain dicts/SQLAlchemy rows."

### Frontend "services"

There is **no `services/` directory on the frontend.** Domain logic lives in `frontend/src/utils/`:

- `dilutions.ts` — frontend mirror of backend `parse_dilution`. Parses to `{ denominator, raw, confident }` and provides `formatDilution(N) -> "1:N"`. **This is your seed for the calculations engine** — denominator is "N in 1:N", and `flow_dilution_factor` / `icc_if_dilution_factor` are already pre-parsed integers carried on the `Antibody` and `DyeLabel` rows.
- `spectra.ts` — `interpolateAt(spectra, λ)`, `isExcitable`, `isDetectable`, `rankChannels`, plus a `downsampleSpectra` helper.
- `spillover.ts` — `computeSpilloverMatrix(...)` over a memoized 1nm interpolated emission grid (`emissionGridCache: Map<string, Float64Array>`).
- `colors.ts`, `plateMapColors.ts`, `plateTypes.ts`, `wellUtils.ts` — domain helpers for plate maps.
- `conjugates.ts` — `getDetectionStrategy`, `buildConjugateSet`, `buildBindingPartners`. These build "is this antibody compatible with this secondary?" data structures for the panel designer — exactly the kind of pure-function module to model the controls / mastermix logic on.
- `crossReactivity.ts`, `fuzzySearch.ts`, `search.ts` — narrow utilities.

There is no "service" abstraction (no class, no interface, no DI). Everything is exported pure functions consumed directly.

### Existing calculation services

The most direct precedent for client-side antibody math:

- **`utils/spillover.ts`** — heavy numerical computation, manual memoization keyed by id, called from the panel designer view on every render of the heatmap. Excellent template for "compute on the client, cache by id, never call the backend."
- **`utils/dilutions.ts`** — string → number parsing.
- **`utils/conjugates.ts`** — derives compatibility from arrays of antibodies + secondaries + conjugate chemistries.
- **No existing dilution / volume math service.** `EXPERIMENT-PAGE-ARCHITECTURE.md` Phase 5 specifies a `VolumeCalculator` component but neither the component nor a `volumes.ts` utility currently exists in `frontend/src/utils/` or anywhere else. The `VolumeParams` type is defined (`types/index.ts:937–942`) and the snapshot endpoint emits a default — that's it.

### Testing pattern for utilities

Vitest, colocated at `frontend/src/__tests__/`:

- `colors.test.ts`, `spectra.test.ts` (39 tests), `spillover.test.ts` (11 tests), `wellUtils.test.ts`, `usePanelDesigner.test.ts`.
- Pure-function tests use plain `describe`/`it`/`expect`. Reducer test (`usePanelDesigner.test.ts`) imports the reducer function directly — no rendering.
- Component tests use `@testing-library/react` + `vi.mock(...)` at module level for hooks and for `react-chartjs-2` (canvas isn't supported in jsdom — see CLAUDE.md rule). Example pattern in `FlowPanelBlock.test.tsx`, `IFPanelBlock.test.tsx`, `IFPanelDesignerView.test.tsx`.

The fixture approach is mostly inline objects (no fixtures folder). Antibody / fluorophore mocks are plain literals defined in each test file.

---

## 11. UI primitives

**Component library: none.** No shadcn/ui, no Radix, no Headless UI, no MUI/Chakra/Mantine/Ant. Everything is hand-rolled with Tailwind + `<div>` / `<button>` / native form elements.

| Primitive             | What's there                                                                                                                |
|-----------------------|-----------------------------------------------------------------------------------------------------------------------------|
| Modal / Dialog        | `components/layout/Modal.tsx` only (centered, sizes: `default`/`wide`/`xl`).                                                 |
| Drawer / Sheet        | **Does not exist.** Build new.                                                                                              |
| Accordion / Collapsible | **No primitive.** Inline `useState`-driven `<details>`-or-toggle patterns used ad hoc — `PlateMapLegendPanel.tsx:50,126`, `SecondaryList.tsx:96,256`, `FluorophoreBrowser.tsx:28,190`, `AntibodyTable.tsx:52,296`, `ImportWizard.tsx:247` (native `<details>`), `FluorophoreImportWizard.tsx:189,205` (also `<details>`). Build new for the controls accordion. |
| Tooltip               | Inline `title` attribute. No tooltip component.                                                                             |
| Toast                 | `components/layout/Toast.tsx` — context-based, 3 sec auto-dismiss, `success` / `error` / `info`.                              |
| Tables                | Hand-rolled `<table>` with Tailwind classes (e.g. `AntibodyTable.tsx`, `SecondaryList.tsx`, `PanelList.tsx`). No `@tanstack/react-table`. |
| Drag and drop         | `@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/modifiers` + `@dnd-kit/utilities`. Used heavily in panel rows and block reorder. |
| Charts                | Chart.js + `react-chartjs-2` + `chartjs-plugin-annotation`. Required `animation: false` and `pointRadius: 0` per CLAUDE.md.   |
| Icons                 | **Emoji string literals**, not lucide-react / heroicons. E.g. `Sidebar.tsx` icons `🏠 🧪 🧬 🔬 🔧 📋`, `BlockCommandMenu.tsx:20–55` (`¶ H1 H2 H3 H4 • 1. 💡 — ▦ ▐▌ ▐▐▌ 🔬 🔭`). Only "icons" library required is your keyboard.                                                                              |
| Forms                 | Plain `<input>` / `<textarea>` + `useState`. No `react-hook-form`, no `zod` schema validation. Validation is inline.            |

Generic-import infrastructure that's relevant: `components/shared/GenericImportDiffModal.tsx`, `NestedImportDiffModal.tsx`, `importSchemas.ts` — these are the most polished shared components in the codebase and they all rely on `Modal` as the shell.

---

## 12. Conventions + linting

### tsconfig

Quoted in full in Section 1. Strict, `@/*` alias, `vitest/globals` types, `noUnusedLocals`/`noUnusedParameters` enforced.

### ESLint / Prettier

**No ESLint config file present.** No `.eslintrc.*`, no `eslint.config.*`, no `eslint`/`prettier` in `package.json`. Lint enforcement is "human reads the diff." A few `// eslint-disable-next-line react-hooks/exhaustive-deps` comments exist (`FlowPanelBlock.tsx:80–81`, `:105–106`, `:222–423`) — these are aspirational rather than enforced.

### Codebase rules — quoted

`CLAUDE.md` is the definitive rules file (loaded automatically into context). The mirror `.agent/rules/rules.md` repeats the most painful checklist. Most relevant sections for the new features:

> **Frontend Patterns**
> - `@/` path alias configured in BOTH `tsconfig.json` AND `vite.config.ts` AND `vitest` resolve config — tests will fail on `@/` imports if vitest doesn't know about the alias.
> - `from __future__ import annotations` at the top of every Python file.
> - Mock react-chartjs-2 in vitest — canvas isn't available in jsdom.
> - Always run `npx tsc --noEmit` from inside the `frontend/` directory.
> - dnd-kit: `{...listeners}` on handle cell only, `{...attributes}` + `ref={setNodeRef}` on `<tr>`.
> - dnd-kit: `CSS.Transform.toString(transform)` — never build the transform string manually.
> - Omnibox dropdowns need `z-50`.

> **Experiment Page System**
> - Panel instance blocks are one-way snapshots — editing a flow_panel or if_panel block on an experiment page does NOT propagate changes back to the template panel.
> - Volume calculations are frontend-only — no backend endpoints for volume math. All arithmetic computed client-side from panel instance JSON.
> - Mastermix only groups same panel type — flow panels and IF panels sharing the same antibody cannot be combined (different dilution sources: flow_dilution_factor vs icc_if_dilution_factor). Show a warning if user tries.
> - Mastermix dilution mismatch warning — if two same-type panels share an antibody but at different dilution factors, do NOT add to mastermix. Display explicit warning explaining why.
> - Block text is plain text only (no rich text).
> - heading_4 is internal only — Notion API supports heading_1 through heading_3 only. On Notion export, heading_4 maps to a bold paragraph.

> **Python Style Rules**
> - No f-strings without placeholders. Use `str()`, `.format()`, or `%` formatting.
> - No multiple imports on one line.
> - No semicolons to combine statements.
> - Use `from __future__ import annotations` in all Python files.

> **Components / data:**
> - One component per file. Name file same as component.
> - Server state: TanStack Query (no Redux, no Zustand).
> - Local UI state: `useState` for simple, `useReducer` for complex.
> - All fetch calls in `src/api/` files. Components never call `fetch()` directly. **(Note: this rule is broken in practice — every block component fetches `PUT /blocks/:id` directly with `fetch()` to use `keepalive`. The `api/` rule is for resource-typed CRUD; raw `keepalive` writes go inline.)**

`AGENTS.md` does **not** exist in this repo.

### TypeScript types

**Single-file barrel.** Everything frontend lives in `frontend/src/types/index.ts` (~970 lines). No subdirectories, no per-domain barrel files, no per-feature `.types.ts`. Components import via `import type { Antibody, … } from '@/types'`. Some component-local types are exported alongside the component (e.g., `PanelLibraryData` from `FlowPanelBlock.tsx:24–35`, `PanelDesignerViewHandlers` from `PanelDesignerView.tsx:57–87`).

For the new features: keep adding to `types/index.ts` for shared domain types; co-locate UI-only types with their component.

### Commit message format

Looking at recent commits:

```
c43cb96 feat: complete import/export coverage for dye-labels, plate-maps, and experiments
dd51d51 fix: bump list caps to 2000 and add ORDER BY on all remaining list endpoints
c0336d5 tests: add antibody duplicate-409 and full-shape round-trip tests
67a03f2 feat: extend import diff flow to remaining seven resources
875fdea feat: antibody import diff flow with side-by-side conflict resolution
```

Conventional Commits style (`feat: …`, `fix: …`, `tests: …`, `chore: …`). Lowercase, no scope, single line is normal.

---

## 13. Picture-in-Picture / multi-window

**No precedent for any of it.**

```
$ grep -rn "BroadcastChannel|window.open|documentPictureInPicture|navigator.sendBeacon" frontend/src/
(no matches)
```

- **No** `documentPictureInPicture` use.
- **No** `window.open`, no popout / detached-window pattern.
- **No** `BroadcastChannel`, `localStorage` storage events, `postMessage`, or any cross-tab/cross-window sync code.
- **No** existing "pop out / detach" feature anywhere in the app.
- **No** `navigator.sendBeacon` either; the keepalive pattern is `fetch(..., { keepalive: true })`.

Building the detach-to-window mode is greenfield. The most plausible architecture given this codebase:

1. Mount a second React tree inside a `window.open(...)` document, sharing the same `QueryClient` (passable through `unsafe_QueryClientProvider` only if you persist queries — otherwise re-instantiate and accept a brief refetch).
2. For state coherence with the main window, `BroadcastChannel('lab-tools-calc')` or persisted state in `localStorage` with `storage` event listening.

But the calculations panel is **purely a derived view** of `experiment.blocks` (since volume math is "frontend-only" per CLAUDE.md), so the simpler approach is: have the detached window re-fetch `useExperiment(id)` from the server and recompute. No state-sync needed beyond the experiment id in a URL search param.

---

## 14. Dependencies snapshot

`frontend/package.json` (full):

```jsonc
{
  "name": "lab-tools-2",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@dnd-kit/core": "^6.3.1",
    "@dnd-kit/modifiers": "^9.0.0",
    "@dnd-kit/sortable": "^10.0.0",
    "@dnd-kit/utilities": "^3.2.2",
    "@tanstack/react-query": "^5.62.0",
    "chart.js": "^4.4.7",
    "chartjs-plugin-annotation": "^3.1.0",
    "html2canvas-pro": "^2.0.2",
    "react": "^18.3.1",
    "react-chartjs-2": "^5.3.0",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.28.0"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.6.3",
    "@testing-library/react": "^16.1.0",
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1",
    "@vitejs/plugin-react": "^4.3.4",
    "autoprefixer": "^10.4.20",
    "jsdom": "^25.0.1",
    "postcss": "^8.5.3",
    "tailwindcss": "^3.4.17",
    "typescript": "^5.7.2",
    "vite": "^6.0.5",
    "vitest": "^3.0.0"
  }
}
```

### Presence / absence checklist

| Lib                        | Status       | Notes                                                                |
|----------------------------|--------------|----------------------------------------------------------------------|
| zustand                    | **absent**   | No external state store. State is local + TanStack.                  |
| jotai                      | **absent**   |                                                                      |
| immer                      | **absent**   | Reducers use plain spread/filter.                                    |
| zundo                      | **absent**   | Bespoke undo stack in `usePanelDesigner`.                            |
| use-undo / use-immer       | **absent**   |                                                                      |
| @tanstack/react-query      | present 5.62 | Single `QueryClient` in `main.tsx`.                                  |
| @tanstack/react-table      | **absent**   | Tables are hand-rolled.                                              |
| react-hook-form            | **absent**   |                                                                      |
| zod / yup / valibot        | **absent**   | No schema validation library.                                        |
| @radix-ui/*                | **absent**   |                                                                      |
| @headlessui/react          | **absent**   |                                                                      |
| cmdk / vaul                | **absent**   |                                                                      |
| lucide-react / heroicons   | **absent**   | Emoji literals everywhere.                                           |
| tailwindcss                | present 3.4  | `darkMode: 'class'`, no custom theme extensions.                     |
| shadcn components          | **absent**   |                                                                      |
| @dnd-kit (core/sortable/utilities/modifiers) | present | Used in panel rows + block reorder.                                  |
| react-chartjs-2 / chart.js / chartjs-plugin-annotation | present | Mandatory `animation: false`, `pointRadius: 0`.                      |
| html2canvas-pro            | present      | Used for plate-map canvas exports; large-canvas safe.                |

There is no formatter (`prettier` is absent), no linter (`eslint` is absent). Type-checking via `tsc --noEmit` from `frontend/` is the formal gate.

`backend/requirements.txt` was not opened in detail, but the imports show: FastAPI, SQLAlchemy 2.x, Pydantic v2, httpx (per CLAUDE.md), pytest.

---

## 15. Open questions

These need product / architectural decisions before the new features can be designed cleanly.

### Controls accordion (feature a)

1. **Scope of "controls" in this product context.** The term commonly means flow-cytometry compensation controls (single-stained, FMO, unstained, isotype, viability, comp beads). Which categories should the accordion support? Are bead types (e.g. UltraComp eBeads, OneComp, ArC) tracked as separate entities, or are they free-text descriptions per row?
2. **Persistence model.** Add a `controls` field to the existing `flow_panel` / `if_panel` block content JSON? Or introduce a new sibling block type (`flow_controls`, `if_controls`) that lives next to the panel block? The first is simpler; the second matches the "Notion-export-friendly" precedent.
3. **Per-control rows: do they reference the catalog?** I.e., is each control row "a real `Antibody` from the library + a control type tag", or "free-text label + dilution + notes"? The flow vs IF dilution-source asymmetry will matter here.
4. **Should controls roll into mastermix detection too?** A single-stain CD3 control at the same dilution as the panel CD3 row — same mastermix, or kept separate by convention?
5. **Default control suggestions.** Should opening the accordion with no controls auto-suggest one row per panel target (auto-generate single-stain controls), or stay empty until user adds? "Auto-suggest" is the typical workflow but adds UI complexity.
6. **Where should the accordion's open/closed state live** — `localStorage` per-block-id (`block-${blockId}-controls-open`), in the block JSON `content.controls.expanded`, or page-scoped? Persisted-in-content matches the existing one-source-of-truth pattern; localStorage matches `experiment-page-full-width`.

### Calculations engine (feature b)

7. **Which inputs are user-tunable vs. snapshot-frozen?** `volume_params` lives on each panel block today (`num_samples`, `volume_per_sample_ul`, `pipet_error_factor`, `dilution_source`). For the calculations sidebar, are these editable from the sidebar (cross-panel-aware), or only from the panel block itself? If the sidebar edits them, it has to PUT into multiple blocks.
8. **Mastermix UX trigger.** `EXPERIMENT-PAGE-ARCHITECTURE.md` Phase 6 describes mastermix selection living in "an experiment-scoped JSON field (either on the experiment model or as a special block type)" — never decided. Where should it live? Adding a column to `Experiment` is the easy path; a synthetic `mastermix` block type fits the existing block model better (and exports more cleanly).
9. **Sidebar / dock / detach — single instance or multi?** Can a user open the calc sidebar for two experiment pages simultaneously in two tabs? Detach the sidebar from one tab while the panel block in the other tab keeps editing? This decides whether you need cross-window sync at all.
10. **Detach-window data refresh.** When the user detaches the calc panel and then edits a panel block back in the main window, does the detached window auto-refresh, poll, or require a manual refresh? Polling is simplest; live sync via `BroadcastChannel` is slick but unprecedented here.
11. **Calculation outputs the user expects.** Per-antibody primary volume, primary cocktail, secondary cocktail, mastermix table — all defined in the Phase 5 spec. Anything beyond? E.g.: tube-volume rounding, "x.xx µL ≥ 0.5 µL pipettable" warnings, optional "include 10% extra for dead volume" beyond the existing pipet_error_factor? Each adds calc-engine surface area.
12. **Save model for the sidebar's own UI state.** Selected mastermix antibodies, expand/collapse states, last-displayed panel — page-scoped? localStorage? Because there's no global UI store, this needs an explicit decision before two surfaces (sidebar + detached window) end up disagreeing.
13. **Markdown / Notion export — in scope or future?** The task description mentions calculations rendering in a sidebar; it doesn't say "export." But the feature spec in `EXPERIMENT-PAGE-ARCHITECTURE.md` ties Notion export to calculations. If export is in scope for this round, recognize that the Notion export serializer is **fully unbuilt** and will be its own significant slice of work.

### Ambient

14. **Where do the calc utilities live?** Create `frontend/src/utils/volumes.ts` (matches the `dilutions.ts` / `spillover.ts` precedent), or carve out a first-ever `frontend/src/services/` directory? The codebase has used `utils/` for everything so far, so `utils/volumes.ts` is the lowest-friction choice.
15. **Test conventions for the new code.** Pure-function tests in `frontend/src/__tests__/volumes.test.ts` is clear. Tests for the sidebar and detached-window mode require new test patterns the codebase doesn't have yet (notably mocking `window.open` and `BroadcastChannel`).
