# Calc-sidebar recon

**Date:** 2026-05-30
**Commit:** e30d395f8c01f4ea7a841e837227319a3d729ba9
**Purpose:** Ground the calculations-sidebar architecture prompt in current code.

---

## TL;DR (upside triangle)

- **Volume/mastermix code is entirely absent.** No `VolumeCalculator`, no volume-math utility, no mastermix detection — these are described only in `ARCHITECTURE.md`. Everything must be built from scratch.
- **The keystone observation problem:** Panel data lives exclusively in Tiptap node attrs. A sibling component can reach these attrs only by walking `editor.state.doc` — but `editor` is a local variable in `ExperimentPage`, not exposed via any context or ref. No `EditorContext`/`EditorProvider` exists today.
- **Edits to dilution/sample-count inside a panel block update Tiptap attrs immediately** (via `updateAttributes`), so a live doc-walk does see changes instantly — but there is no mechanism for a sibling to subscribe to those transactions without being given the `editor` instance.
- **TanStack Query (`useExperiment`) reflects only persisted state**, subject to the 1500 ms save debounce. A sidebar that reads from TanStack Query would lag behind live edits.
- **The preference pattern is well-established** (key/value string store, JSON blob, `useBlockFramesConfig` as the template hook) and ready to extend for `calc_sidebar.open`.
- **Left-nav collapse uses `localStorage` directly** (keys `sidebar-collapsed`, `sidebar-groups`) — not `UserPreference`. The right rail should use `UserPreference` for cross-device persistence, matching the `experiment_page.last_full_width` precedent.
- **Biggest open decision:** where to expose the editor instance to the sidebar — React context, prop, or a module-level ref — and whether the sidebar reads live doc state or persisted TanStack Query data (with the lag that implies).

---

## A. Panel block data model

### A1. Node specs

**`flow_panel`** — `frontend/src/blocks-tiptap/nodes/flowPanel.ts:5`
- `group: 'block'`, `atom: true`, `selectable: true`, `draggable: true`
- Attrs schema (verbatim):
  ```
  source_panel_id: { default: null }
  name:            { default: '' }
  instrument:      { default: null, rendered: false }
  targets:         { default: [], rendered: false }
  assignments:     { default: [], rendered: false }
  volume_params:   { default: { num_samples: 1, volume_per_sample_ul: 100,
                                pipet_error_factor: 1.1, dilution_source: 'flow' },
                    rendered: false }
  ```

**`if_panel`** — `frontend/src/blocks-tiptap/nodes/ifPanel.ts:5`
- `group: 'block'`, `atom: true`, `selectable: true`, `draggable: true`
- Attrs schema (verbatim):
  ```
  source_panel_id: { default: null }
  name:            { default: '' }
  panel_type:      { default: 'IF' }
  microscope:      { default: null, rendered: false }
  view_mode:       { default: 'simple' }
  targets:         { default: [], rendered: false }
  assignments:     { default: [], rendered: false }
  volume_params:   { default: { num_samples: 1, volume_per_sample_ul: 200,
                                pipet_error_factor: 1.1, dilution_source: 'icc_if' },
                    rendered: false }
  ```

Both nodes are `atom: true` and have `rendered: false` on `instrument`/`microscope`, `targets`, `assignments`, and `volume_params` — these never appear in serialized HTML.

### A2. TypeScript interfaces

**`FlowPanelInstanceTarget`** — `frontend/src/types/index.ts:843`
```typescript
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
  staining_mode: string
  secondary_antibody_id: string | null
  secondary_antibody_name: string | null
  sort_order: number
  flow_dilution_factor: number | null
  icc_if_dilution_factor: number | null
}
```

**`IFPanelInstanceTarget`** — `frontend/src/types/index.ts:873`
```typescript
export interface IFPanelInstanceTarget {
  id: string
  antibody_id: string | null
  antibody_name: string | null
  antibody_target: string | null
  antibody_host: string | null
  dye_label_id: string | null
  dye_label_name: string | null
  dye_label_target: string | null
  dye_label_fluorophore_id: string | null
  dye_label_fluorophore_name: string | null
  staining_mode: string
  secondary_antibody_id: string | null
  secondary_antibody_name: string | null
  secondary_fluorophore_id: string | null
  secondary_fluorophore_name: string | null
  sort_order: number
  dilution_override: string | null
  icc_if_dilution_factor: number | null
}
```

**`VolumeParams`** — `frontend/src/types/index.ts:904`
```typescript
export interface VolumeParams {
  num_samples: number
  volume_per_sample_ul: number
  pipet_error_factor: number
  dilution_source: 'flow' | 'icc_if'
}
```

### A3. `volume_params` defaults

Flow default set in two places (consistent):
- Node attr default — `frontend/src/blocks-tiptap/nodes/flowPanel.ts:37–44`
- Slash-menu insert — `frontend/src/blocks-tiptap/slashMenu/items.ts:125–131`
- `FlowPanelView` fallback ref — `frontend/src/blocks-tiptap/views/FlowPanelView.tsx:82–88`

IF default set in three places (consistent):
- Node attr default — `frontend/src/blocks-tiptap/nodes/ifPanel.ts:42–49`
- Slash-menu insert — `frontend/src/blocks-tiptap/slashMenu/items.ts:151–157`
- `IfPanelView` helper — `frontend/src/blocks-tiptap/views/IfPanelView.tsx:41–47`

### A4. Per-target dilution storage

**Flow targets** — dilution is `flow_dilution_factor: number | null` on `FlowPanelInstanceTarget` (`frontend/src/types/index.ts:859`). The `icc_if_dilution_factor` field is also present on the same interface but `volume_params.dilution_source` is always `'flow'` for flow panels.

**IF targets** — dilution is `dilution_override: string | null` (user-entered string, e.g. `"1:500"`) and `icc_if_dilution_factor: number | null` (parsed numeric factor) on `IFPanelInstanceTarget` (`frontend/src/types/index.ts:890–891`). The effective dilution for volume math is `dilution_override ?? icc_if_dilution_factor` per ARCHITECTURE.md.

Note: `FlowPanelInstanceTarget.flow_dilution_factor` is `number | null` whereas the `Antibody` type stores `flow_dilution_factor: number | null` at `frontend/src/types/index.ts:146`. The snapshot target carries the factor at snapshot time.

### A5. Secondary-antibody data on IF targets

`IFPanelInstanceTarget` carries:
```
secondary_antibody_id: string | null
secondary_antibody_name: string | null
secondary_fluorophore_id: string | null
secondary_fluorophore_name: string | null
```
(`frontend/src/types/index.ts:882–885`)

The secondary's dilution is NOT stored in the instance target. It would need to be looked up from the `SecondaryAntibody` record (via `secondary_antibody_id`) at calc time. **ARCHITECTURE.md** describes a secondary cocktail calculation but no secondary dilution field exists on `IFPanelInstanceTarget`. This is a gap — volume math for indirect staining secondaries cannot be done purely from panel-block attrs today.

### A6. Dye/label (non-antibody) targets

`FlowPanelInstanceTarget` represents a dye via `dye_label_id: string | null` and `dye_label_fluorophore_id`, etc. The dilution fields are still `flow_dilution_factor: number | null` and `icc_if_dilution_factor: number | null`. No separate polymorphic shape — whether `antibody_id` or `dye_label_id` is set determines the target type (`frontend/src/types/index.ts:843–861`). A dye target uses the same `flow_dilution_factor` or `icc_if_dilution_factor` as an antibody target; which one applies depends on `volume_params.dilution_source`.

---

## B. Block-type registry

### B1. Authoritative list

`RowIdExtension` is the authoritative registry of block types that participate in the persistence system (`frontend/src/blocks-tiptap/nodes/rowIdExtension.ts:7–23`):

```typescript
const ROW_BACKED_TYPES = [
  'paragraph',
  'heading',
  'bulletList',
  'orderedList',
  'listItem',
  'horizontalRule',
  'callout',
  'column_list',
  'column',
  'flow_panel',
  'if_panel',
  'table',
  'tableRow',
  'tableHeader',
  'tableCell',
]
```

Synthetic types (no DB row emitted, no UUID minted):
```typescript
const SYNTHETIC_TYPES = new Set(['bulletList', 'orderedList', 'tableRow', 'tableHeader', 'tableCell'])
```

The complete extension list registered in `tiptapExtensions` (`frontend/src/blocks-tiptap/extensions.ts:14–51`): `StarterKit` (paragraph, heading, bulletList, orderedList, listItem, horizontalRule), `TableKit` (table, tableRow, tableHeader, tableCell), `RowIdExtension`, `BlockFramesExtension`, `Callout`, `ColumnList`, `Column`, `FlowPanel`, `IfPanel`, `SlashMenu`, `DuplicateShortcut`, `Placeholder`.

### B2. Atom vs content-bearing

Atom (`atom: true`): `flow_panel`, `if_panel`, `callout`
Content-bearing (have `content:` spec or StarterKit content): `paragraph`, `heading`, `bulletList`, `orderedList`, `listItem`, `horizontalRule`, `column_list`, `column`, `table`, `tableRow`, `tableHeader`, `tableCell`

### B3. Touch points for adding a new node type

To add a NEW block type (e.g., a future `volume_summary` block):
1. **Node spec** — new file in `frontend/src/blocks-tiptap/nodes/` defining `Node.create({name, group, ...})`
2. **`nodes/index.ts`** — add export (`frontend/src/blocks-tiptap/nodes/index.ts`)
3. **`extensions.ts`** — add the node to `tiptapExtensions` array (`frontend/src/blocks-tiptap/extensions.ts`)
4. **`rowIdExtension.ts`** — add type name to `ROW_BACKED_TYPES`; if it emits a DB row, do NOT add to `SYNTHETIC_TYPES` (`frontend/src/blocks-tiptap/nodes/rowIdExtension.ts`)
5. **`blockFramesExtension.ts`** — add entry to `NODE_TO_CONFIG_KEY` if it should support frame modes (`frontend/src/blocks-tiptap/nodes/blockFramesExtension.ts:15–29`)
6. **`tiptapToDb.ts`** — add serialization case in `handleNode()` (`frontend/src/blocks-tiptap/adapter/tiptapToDb.ts:127`)
7. **`dbToTiptap.ts`** — add deserialization case in `buildSingleNode()` (`frontend/src/blocks-tiptap/adapter/dbToTiptap.ts:119`)
8. **`slashMenu/items.ts`** — add slash-menu entry if user-insertable (`frontend/src/blocks-tiptap/slashMenu/items.ts`)
9. **`types/index.ts`** — add content interface and `BlockFramesConfig` key if applicable
10. **Optional view** — `ReactNodeViewRenderer` registration in the node spec if a custom React view is needed

For the calculator registry specifically: a pluggable per-block-type calculator would likely live as a separate lookup table (e.g., `Map<blockType, CalcFn>`), NOT inside the Tiptap extension system. The extension touch points above apply to adding the node to the editor; the calc-registry is a separate concern.

---

## C. Editor access & observation (KEYSTONE)

### C1. Where the editor instance is created

`ExperimentPage.tsx:61–70` — `useEditor(...)` is called inside the `ExperimentPage` function component:

```typescript
const editor = useEditor(
  {
    extensions: tiptapExtensions,
    content: initialEditorContent ?? { type: 'doc', content: [] },
    editorProps: {
      transformPasted: (slice) => stripRowIdsFromSlice(slice),
    },
  },
  [initialEditorContent]
)
```

The returned `Editor | null` is held in the local `editor` constant. It is passed to `useSaveCoordinator` (`ExperimentPage.tsx:72–76`) and to `<DragHandleWrapper editor={editor} />` (`ExperimentPage.tsx:147`).

### C2. Is the editor reachable by a sibling component?

**No.** There is no `EditorContext`, no editor provider, no exported ref, and no forwarded prop that exposes `editor` beyond `ExperimentPage`'s own render scope. `BlockFramesProvider` is a sibling wrapper but it holds only block-frame config state via a module-level ref, not the editor instance (`frontend/src/blocks-tiptap/blockFramesProvider.tsx`).

A sibling right-rail component mounted next to `<EditorContent>` inside `ExperimentPage` could receive `editor` as a prop (the simplest option), or `ExperimentPage` could be refactored to expose it via a new React context.

### C3. Enumerating panel nodes in the current doc

No existing helper walks the doc for specific node types. The pattern used by `BlockFramesExtension.buildDecorations` (`frontend/src/blocks-tiptap/nodes/blockFramesExtension.ts:50–60`) is the canonical pattern:

```typescript
doc.descendants((node, pos) => {
  if (node.type.name === 'flow_panel' || node.type.name === 'if_panel') {
    // node.attrs contains source_panel_id, name, targets, assignments, volume_params
  }
})
```

This must be called with access to `editor.state.doc`. No exported helper function exists — the sidebar would need to implement this inline or share the `buildDecorations` pattern.

### C4. Subscribing to live changes

The save coordinator uses `editor.on('transaction', handler)` / `editor.off('transaction', handler)` to subscribe — `frontend/src/blocks-tiptap/save/saveCoordinator.ts:370–381`:

```typescript
editor.on('transaction', ({ transaction }) => {
  if (!transaction.docChanged) return
  handleDocChange()
})
```

The `BlockFramesExtension` uses `window.addEventListener('block-frames-config-changed', handler)` for config updates but directly dispatches a meta transaction to the editor (`frontend/src/blocks-tiptap/nodes/blockFramesExtension.ts:84–88`). 

A sibling could subscribe to `editor.on('transaction', ...)` in a `useEffect`. This is the correct Tiptap API for live observation.

### C5. CRITICAL — when dilution/sample-count edits hit the doc

**Attrs-update path — YES, immediately visible.** When a user edits `volume_params` (or any other panel attr) inside `FlowPanelView` or `IfPanelView`, `updateAttributes(...)` is called (e.g., `FlowPanelView.tsx:98–108` via the `onChange` callback wired to `usePanelDesignerInstance`). `updateAttributes` is Tiptap's API for updating a node's attrs — it dispatches a ProseMirror transaction that sets `tr.setNodeMarkup(pos, undefined, newAttrs)`. **This is a `docChanged` transaction.** A doc-observer subscribed via `editor.on('transaction', ...)` will see it immediately.

Crucially, `volume_params` is stored in a `useRef` in both panel views (`FlowPanelView.tsx:82–88`, `IfPanelView.tsx:112–113`) and is included in every `updateAttributes` call. However: volume_params edits (num_samples, volume_per_sample_ul, pipet_error_factor) are not currently wired to any UI inside the panel views — there is no input field for these in `FlowPanelView` or `IfPanelView`. The `volume_params` ref is initialized from initial attrs and is never updated after mount in the current code. **There is no UI today for editing volume_params in a panel block.** The sidebar would need to provide this editing surface, or the panel views would need to be extended.

For dilution edits on IF targets: `onSaveDilution` in `IfPanelView.tsx:399–407` dispatches `UPDATE_TARGET` which calls `onChange` and thus `updateAttributes`. This IS a doc transaction.

### C6. Save coordinator mechanics

`useSaveCoordinator` (`frontend/src/blocks-tiptap/save/saveCoordinator.ts:84–426`):
- Subscribes to `editor.on('transaction', onTransaction)` — fires `handleDocChange()` on `docChanged`
- `handleDocChange` calls `tiptapDocToRows(editor.getJSON(), expId)` to serialize the doc to `ExperimentBlock[]`
- Stores current rows in `currentRowsRef`; baseline in `baselineRowsRef`
- `inspectTransaction(baseline, current)` (`transactionInspector.ts:33`) diffs the two to find creates/deletes/contentChanged/topologyChanged
- `_rowId` (from `RowIdExtension`) is the identity key — the `id` field of each emitted `ExperimentBlock`
- A sidebar could reuse the same `editor.on('transaction', ...)` subscription pattern and call `editor.getJSON()` (or `editor.state.doc.descendants()`) to extract panel nodes on each change

### C7. TanStack Query alternative

`useExperiment(id)` in `frontend/src/hooks/useExperiments.ts:18`:
```typescript
export function useExperiment(id: string) {
  return useQuery({
    queryKey: ['experiments', id],
    queryFn: () => getExperiment(id),
    enabled: !!id,
  })
}
```

No `staleTime` is set — default Tiptap Query staleTime of 0 applies, meaning the data is considered stale immediately. However, `ExperimentPage` does NOT use this hook — it fetches via a plain `getExperiment(id)` in a `useEffect` on mount (`ExperimentPage.tsx:33–47`) and never subscribes to TanStack Query for the experiment data. Save mutations invalidate `['experiments', expId]` (`saveCoordinator.ts:306`), but this does not cause `ExperimentPage` to re-render with new data since it read once on mount.

**Conclusion:** TanStack Query reflects persisted state with 1500 ms lag (the save debounce). It does NOT reflect live in-editor panel state before save. A sidebar using `useExperiment` would show stale volume_params until the next debounced save completes.

---

## D. Existing volume / mastermix code

### D1. `VolumeCalculator.tsx`

**Absent.** No file named `VolumeCalculator` or `volumeCalc` exists anywhere in `frontend/src`. Grep confirms zero hits for `VolumeCalculator`, `mastermix`, `masterMix`, `master_mix`, `cocktail` in all `.ts`/`.tsx` files.

### D2. Volume-math utility

**Absent.** No function implementing the `ab_vol = (volume_per_sample / dilution_factor) × num_samples × pipet_error_factor` formula exists in the codebase. The formula is described in `ARCHITECTURE.md § Volume Calculation` but is not implemented anywhere in `frontend/src`.

### D3. Cross-panel mastermix detection

**Absent.** No code scans panel blocks for shared `antibody_id` values or compares dilution factors across panels. Zero hits for mastermix-related terms in frontend source.

### D4. Mastermix selection persistence

**Absent.** No `mastermix` column on `Experiment` (`backend/models.py:521–531`), no dedicated block type for mastermix, no node attr on panel blocks for mastermix state. The `Experiment` model has only `id`, `name`, `description`, `is_full_width`, `created_at`, `updated_at`, `blocks`. Nothing persists mastermix selection today.

---

## E. Preference persistence pattern

### E1. `UserPreference` model

`backend/models.py:306–310`:
```python
class UserPreference(Base):
    __tablename__ = "user_preferences"
    key = Column(String, primary_key=True)
    value = Column(String, nullable=False)
```
Plain key/value store. `key` is the primary key (unique string). `value` is unbounded `String` (SQLite TEXT). No type constraints on value — JSON blobs, booleans-as-strings, and raw numbers are all valid.

### E2. Read/write API

`frontend/src/api/preferences.ts`:
```typescript
export async function getPreferences(): Promise<Record<string, string>>
export async function updatePreference(key: string, value: string): Promise<UserPreference>
```
`getPreferences` returns all preferences as `Record<string, string>` from `GET /api/v1/preferences`.
`updatePreference` does a `PUT /api/v1/preferences/${key}` with `{ value }`.

### E3. Reference hook — `useBlockFramesConfig`

`frontend/src/hooks/useBlockFramesConfig.ts:10–34`:
```typescript
export function useBlockFramesConfig() {
  const qc = useQueryClient()
  const query = useQuery({
    queryKey: ['preferences'],
    queryFn: getPreferences,
    staleTime: 5 * 60 * 1000,
  })
  const config: BlockFramesConfig = parseConfigOrDefault(
    query.data?.[BLOCK_FRAMES_PREFERENCE_KEY],
  )
  const setConfig = async (key: keyof BlockFramesConfig, value: FrameMode) => {
    const next: BlockFramesConfig = { ...config, [key]: value }
    await updatePreference(BLOCK_FRAMES_PREFERENCE_KEY, JSON.stringify(next))
    qc.invalidateQueries({ queryKey: ['preferences'] })
  }
  return { config, setConfig, isLoading: query.isLoading }
}
```

Pattern: read all prefs via `['preferences']` query key (5 min stale), parse the specific key from the result, write via `updatePreference`, invalidate to refresh.

`useExperimentLastFullWidth` in `frontend/src/hooks/useExperimentLastFullWidth.ts:7` follows the identical pattern for a scalar boolean preference.

### E4. Naming convention for preference keys

Existing keys (from types/index.ts):
- `'editor.block_frames'` — JSON blob, `BLOCK_FRAMES_PREFERENCE_KEY` at `frontend/src/types/index.ts:982`
- `'experiment_page.last_full_width'` — boolean string, `EXPERIMENT_LAST_FULL_WIDTH_PREFERENCE_KEY` at `frontend/src/types/index.ts:984`

Convention: `<domain>.<feature_name>` — lowercase, dot-separated. A calc sidebar open/closed preference would fit as `'calc_sidebar.open'` or `'experiment_page.calc_sidebar_open'`.

---

## F. Left-nav collapse pattern

### F1. Left sidebar component

`frontend/src/components/layout/Sidebar.tsx` — full implementation including collapse toggle.

### F2. State persistence

**`localStorage` directly** — NOT `UserPreference`. Two keys:
- `'sidebar-collapsed'` — boolean stored as string `'true'`/`'false'` (`Sidebar.tsx:61`, `Sidebar.tsx:81`)
- `'sidebar-groups'` — JSON blob of group open/closed states (`Sidebar.tsx:62`, `Sidebar.tsx:68`)

Reading: `localStorage.getItem(STORAGE_KEY) === 'true'` in `useState` initializer. Writing: `localStorage.setItem(STORAGE_KEY, String(collapsed))` in a `useEffect`. No server round-trip.

### F3. Collapsed strip UX

When `collapsed === true`, the sidebar renders at `w-14` (56 px). Each nav item shows only its emoji icon centered (`justify-center`, icon only, no label). Group entries become icon buttons that open portal flyouts. The collapse button shows a left-chevron SVG that rotates to right-pointing when collapsed. `Sidebar.tsx:217–260`.

### F4. Shared layout primitives

None. No `Resizable`, `Collapsible`, or `Panel` shared component exists in `frontend/src/components/layout/`. The left sidebar implements its own collapse via `useState` + CSS width transition (`transition-all duration-200 ease-in-out`). The right rail would need to implement its own collapse or create a shared primitive.

---

## G. Experiment page layout & print

### G1. `ExperimentPage.tsx` structure

`frontend/src/components/experiments/ExperimentPage.tsx:122–152`:

```tsx
return (
  <BlockFramesProvider>
    <div className={containerClass}>      // full-width or max-w-7xl flex column
      <div className="flex items-center justify-between">
        <h1>...</h1>
        <div className="flex items-center gap-3">
          {/* save-status badge, pending count, PageWidthToggle */}
        </div>
      </div>
      <div className="prose dark:prose-invert max-w-none border border-border rounded p-4">
        {editor && <DragHandleWrapper editor={editor} />}
        <EditorContent editor={editor} />
      </div>
    </div>
  </BlockFramesProvider>
)
```

`containerClass` is either `'w-full px-[5vw] py-6 space-y-6'` (full-width) or `'mx-auto max-w-7xl px-4 py-6 space-y-6'` (normal). The outer `<div>` is a flex column (via `space-y-6` stacking). There is NO horizontal flex wrapper — no existing slot for a right rail.

To insert a right rail without breaking the editor width: the `<div className={containerClass}>` would need to become a flex row, with the editor region in `flex-1` and the rail in a fixed-width column, or the right rail would need to be positioned absolutely/fixed within the page.

The `<main>` in `Shell.tsx:11` is `flex-1 overflow-auto p-6`. The right rail would need to live inside `ExperimentPage` itself, not in `Shell`.

### G2. Existing right-hand region

No TOC, outline, or comments panel exists. The right side of the page is currently empty space (max-width capped at 7xl in normal mode).

### G3. Print/export behavior

**Print:** A single `@media print` rule exists in `frontend/src/index.css:293–297` that suppresses block-frame borders: `[data-frame] { border: none !important; }`. No other print-specific styles. No `@media print` rules in `ExperimentPage.tsx`.

**Notion export:** No export code exists in the frontend. The `ARCHITECTURE.md § Notion Export Path` describes a future feature. The MCP server tools for Notion are listed in the system context but no implementation exists in the codebase.

---

## H. Conventions & guards

### H1. CLAUDE.md "NEVER FORGET" checklist items applicable to this feature

From `/home/jramirez2/proj/lab-tools-2/CLAUDE.md`:
- **`@/` path alias** configured in BOTH `tsconfig.json` AND `vite.config.ts` AND `vitest` resolve config
- **Mock `react-chartjs-2` in vitest** (if any spectra charts appear in the sidebar)
- **`useFluorophores` mock must include `useToggleFluorophoreFavorite` and `useRecentFluorophores`** if FluorophoreBrowser is touched
- **`animation: false`, `pointRadius: 0`** if any Chart.js usage
- **`dnd-kit` conventions** if any drag-and-drop in the sidebar
- **Omnibox dropdowns need `z-50`** if any dropdowns are rendered in the sidebar

### H2. CONVENTIONS.md rules

From `/home/jramirez2/proj/lab-tools-2/CONVENTIONS.md`:

**TanStack Query:**
- "Mid-edit refetches must use `refetchType: 'none'`" — panel mutations on panels use this to avoid disruptive mid-edit refetches
- "Hooks gated by `enabled: false` must be null-coalesced at the call site"
- "Mutations invalidate the list key on success"

**Display conventions:**
- "Display paths must NOT apply thresholds, noise floors, ranking scores, or other transformations that hide low values" — volume math must show raw computed values, not rounded/floored
- "Missing-data cases must be signaled with a distinct affordance (e.g. `NoSpectraChip`) rather than hidden behind a fallback approximation" — if dilution is null, show a "no dilution set" affordance, not 0

**React hooks:**
- "Async state writes in unmount cleanups must guard with an `isUnmountingRef`"

**Per-resource UI properties:**
- "When a per-resource UI property should persist on the resource AND seed defaults for newly-created resources, model it as a paired structure: column + UserPreference key + write both on toggle" — if sidebar open/closed is per-experiment, needs an `Experiment` column; if global, just `UserPreference`

### H3. FRONTEND-CONVENTIONS.md patterns

- **State management:** Server state via TanStack Query; local UI state via `useState`/`useReducer`. No Redux/Zustand.
- **API layer:** All fetch calls in `src/api/`. Components never call `fetch()` directly.
- **Loading/error/empty states:** Every data-dependent component must handle all three.
- **Tailwind:** Semantic color tokens (`text-foreground`, `bg-surface`, `border-border`, etc.), not raw gray/gray-N classes.

---

## I. Open decisions (for PM + user)

### I1. Per-block vs page-level volume params

**What exists today:** `volume_params` (num_samples, volume_per_sample_ul, pipet_error_factor, dilution_source) is stored per panel block as a Tiptap node attr (`flowPanel.ts:37`, `ifPanel.ts:42`). There is no page-level volume params. Each block independently holds its own sample count and volume. **The mockup assumed per-block params** — this is what the code supports. A page-level approach would require a new storage mechanism (Experiment column or separate block type) and has no code foundation today.

### I2. Mastermix selection persistence location

**What exists today:** Nothing. Options: (a) a JSON column on `Experiment` (requires Alembic migration); (b) a dedicated `mastermix_config` block type in the doc (stored as DB row, persists through saves); (c) a `mastermix_selections` node attr on the `column_list` or `doc` level (no Tiptap doc-level attrs); (d) `UserPreference` (global, not per-experiment — wrong granularity); (e) ephemeral client state only (lost on reload). No code settles this.

### I3. Observation mechanism

**What exists today:** The editor instance is a local variable in `ExperimentPage`, not exposed to siblings. Two paths:
- **Live doc-walk + transaction subscribe:** requires passing `editor` to the sidebar (via prop or new context). Pros: reflects edits immediately, no lag. Cons: sidebar re-renders on every doc transaction (mitigatable with selective filtering).
- **TanStack Query (persisted rows):** sidebar reads `useExperiment(id)` and parses panel blocks from `blocks`. Pros: no editor coupling, no new context. Cons: reflects only persisted state, 1500 ms lag behind live edits. Given that `volume_params` is not currently editable in the panel views, the lag would be from dilution/secondary edits (IF target `dilution_override`), which are wired through attrs-update.

### I4. Sidebar open/closed persistence

**What exists today:** Sidebar uses `localStorage`. `UserPreference` (server-persisted, cross-device) is used for `experiment_page.last_full_width` and `editor.block_frames`. Options: (a) `localStorage` (simplest, session-scoped per browser); (b) `UserPreference` global key — one setting for all experiments; (c) `Experiment` column — per-experiment open/closed (requires schema migration). No code settles this.

### I5. Print/export behavior for sidebar

**What exists today:** One `@media print` rule suppresses block-frame borders. No print-specific sidebar handling. The sidebar would need a `@media print { display: none; }` rule or equivalent. Notion export doesn't exist in code, so no alignment needed yet.

### I6. Calculator-registry shape for pluggable per-block-type rules

**What exists today:** No registry. `BlockFramesExtension` uses a `NODE_TO_CONFIG_KEY` map (`frontend/src/blocks-tiptap/nodes/blockFramesExtension.ts:15–29`) as a pattern. A calc registry could be a similar `Map<string, CalcFn>` outside the Tiptap extension system. How a future block type registers its calculator (side-effect import, explicit registration call, or convention-based file discovery) is unsettled. The Tiptap touch-point list in Section B3 indicates 7–10 files to touch per new block type; a calc registry would add one more.

---

## J. Drift / anomalies

### J1. `FlowPanelInstanceTarget` has no `secondary_fluorophore_id/name` fields (ARCHITECTURE drift)

`ARCHITECTURE.md § flow_panel content` shows:
```json
{
  "secondary_antibody_id": null,
  "secondary_antibody_name": null,
  ...
}
```
The actual `FlowPanelInstanceTarget` interface at `frontend/src/types/index.ts:843` does not include `secondary_fluorophore_id` or `secondary_fluorophore_name`. These fields exist on `IFPanelInstanceTarget` but not `FlowPanelInstanceTarget`. **Consequence:** secondary dilution data is not available in flow panel instance targets for volume math.

### J2. `volume_params` is stored but has no edit UI

`ARCHITECTURE.md` describes volume calculations driven by `volume_params` (num_samples, volume_per_sample_ul, etc.), and these fields are stored as Tiptap attrs. However, **neither `FlowPanelView.tsx` nor `IfPanelView.tsx` renders any inputs for editing these fields.** The `volumeParamsRef` is initialized at mount and never updated. The calc sidebar's core value proposition — letting users input sample counts and volumes — has no existing wiring. The sidebar itself must provide the edit inputs and write them back to the node attrs.

### J3. Secondary antibody dilution is not carried in panel instance targets

`ARCHITECTURE.md § Volume Calculation` describes a "secondary cocktail" calculation using secondary antibody dilutions. But `IFPanelInstanceTarget` does not carry a secondary dilution factor. Only `secondary_antibody_id` is stored. To compute secondary volumes, the sidebar would need to fetch `SecondaryAntibody` records by ID. This is a data gap not acknowledged in the architecture docs.

### J4. `EXPERIMENT-PAGES.md` in `plans/` is an older planning document

`/home/jramirez2/proj/lab-tools-2/plans/EXPERIMENT-PAGES.md` exists as a planning doc but has not been verified against current code in this recon. `TIPTAP-FOLLOWUPS.md` is authoritative for current implementation status. Trust `TIPTAP-FOLLOWUPS.md` over `EXPERIMENT-PAGES.md` for what is actually built.

### J5. `heading_4` demotes to `heading_3` on save — documented in CLAUDE.md and TIPTAP-FOLLOWUPS.md, confirmed by `dbToTiptap.ts:138–145`

The code at `frontend/src/blocks-tiptap/adapter/dbToTiptap.ts:138` maps `heading_4` blocks to Tiptap `heading` with `level: 3`. This is confirmed drift between what the DB can store and what the editor roundtrips. Not directly relevant to the calc sidebar but noted per Section J directive.

### J6. No `useExperiment` used by `ExperimentPage`

`useExperiments.ts` exports a `useExperiment(id)` hook (`frontend/src/hooks/useExperiments.ts:18`), but `ExperimentPage.tsx` does NOT use it — it calls `getExperiment(id)` directly in a `useEffect`. Any sidebar that uses `useExperiment` would be working from a separately-managed cache that `ExperimentPage` itself never populates after mount. Cache invalidation from save mutations still works (the mutations invalidate `['experiments', expId]`), but the initial load would be a second fetch.
