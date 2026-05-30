# Calculations Sidebar — Architecture (Phase 1)

**Status:** Drafted, pre-build. Grounds the phased CC prompts that follow.
**Recon basis:** `plans/research/calc-sidebar-recon.md` @ commit `47d71a8`.
**Supersedes:** the per-block `VolumeCalculator` (EXPERIMENT-PAGE-ARCHITECTURE.md Phase 5) and the modal mastermix detector (Phase 6). Those two sections of the experiment-page arch doc are now **deprecated** — see §11.

---

## 1. TL;DR (upside triangle)

A page-level **right rail** on the experiment page. Collapses to a thin labeled strip with a single arrow (distinct from the left nav's emoji-collapse). When expanded, one **accordion section per panel block** on the current page, each showing that panel's volume breakdown. A **cross-panel mastermix callout** sits at the top.

The five facts that shape everything:

- **The rail is a pure computed view.** All inputs live in the panel blocks. The rail reads and computes; it stores nothing of its own except its own open/closed preference.
- **Observation is live, via the editor doc.** A new `EditorContext` exposes the Tiptap instance to the sibling rail. The rail subscribes to transactions and re-walks the doc for panel nodes. Edits to dilutions/sample-counts are Tiptap transactions, so the rail updates immediately — no 1.5s TanStack save lag.
- **`volume_params` inputs get added to the panel blocks** (flow + IF), since no edit UI exists today. Defaults: `pipet_error = 1.05`, `num_samples = 1`, `volume_per_sample = 50` µL.
- **The calculator is cocktail-based and pluggable.** Each block type registers a calculator that emits a list of *cocktails* (mixes the user pipettes). Phase 1: flow emits 1 cocktail, IF emits 2 (primary + secondary). This abstraction is what lets the deferred **controls** feature slot in later as additional cocktails without reworking the rail.
- **Volume/mastermix code is built from scratch.** Nothing exists today.

Phase 1 ships volume calc + mastermix **detection** (display only). Mastermix **action** (persisting a "combine these" selection) and the **controls selectors** are explicitly out of Phase 1 — see §9 and §11.

---

## 2. Locked decisions

| # | Decision | Choice |
|---|----------|--------|
| 1 | Observation mechanism | Live doc-walk via new `EditorContext` + transaction subscription |
| 2 | Sidebar open/closed persistence | `UserPreference` global key `editor.calc_sidebar_open` |
| 3 | Mastermix selection persistence | **Deferred.** Phase 1 is detection-only (derived, no storage) |
| 4 | Volume params location | In each flow/IF block (instance node attrs). Rail reads them |
| 5 | Calculator registry shape | Cocktail-emitting, per-block-type registry (this doc, §5) |
| 6 | Print/export | Suppress in `@media print`; explicitly out of scope for Notion export |
| 7 | Volume param defaults | `pipet_error = 1.05`, `num_samples = 1`, `volume_per_sample = 50` µL |

---

## 3. Data model

### 3.1 `volume_params` on panel nodes

The recon confirmed `volume_params` already exists in the `flow_panel` / `if_panel` node attrs but has **no edit UI**. Phase 1:

- **Verify the current attr default** in the node specs. If it differs from `{ pipet_error: 1.05, num_samples: 1, volume_per_sample: 50 }`, reconcile to these values. (The mockup used `1.1`; we're standardizing on `1.05`.)
- **Add edit inputs** to `FlowPanelView` and `IfPanelView`: three numeric fields (samples, µL/sample, excess ×). Editing calls `updateAttributes` on the panel node → fires a transaction → rail recomputes. Match the existing panel-view styling and the semantic design tokens (no raw gray).
- Field names: use whatever the existing attr schema calls them (confirm in node spec). This doc assumes `num_samples`, `volume_per_sample`, `pipet_error`; the build reconciles to actual names.

### 3.2 No new persistence in Phase 1

Mastermix detection is a derived view recomputed from the doc on every relevant transaction. **No new table, column, or block type.** This sidesteps an Alembic migration until the mastermix *action* phase, when we'll most likely add a per-experiment JSON column (mastermix selection is experiment-scoped). Decision deferred to that phase.

### 3.3 The secondary-dilution gap (IF only)

The recon found IF instance targets carry `secondary_antibody_id` but **no secondary dilution factor**. The IF secondary cocktail needs that dilution. Phase 1 resolves it at the **data layer, not the calculator**: the rail collects all `secondary_antibody_id`s referenced by IF panels on the page, batch-fetches the `SecondaryAntibody` records via TanStack Query, and passes a resolved `{ id → dilution }` map into the IF calculator as a dependency. The calculator stays a pure synchronous function (§5.3).

> **Follow-up flagged, not fixed here:** the instance snapshot not capturing secondary dilution means the IF calc has a data dependency the flow calc doesn't, and the panel block isn't self-contained. A future fix could snapshot secondary dilution into the instance target so the calc needs no external fetch. Out of Phase 1 scope; noted in §12.

---

## 4. Editor exposure — `EditorContext`

The recon confirmed the editor is a local variable in `ExperimentPage.tsx` with no context. A sibling rail can't see it. Phase 1 adds a minimal context, modeled on the existing `BlockFramesProvider` precedent (which already reaches into the editor).

```tsx
// frontend/src/blocks-tiptap/EditorContext.tsx  (location: match BlockFramesProvider)
const EditorContext = createContext<Editor | null>(null)

export function EditorProvider({ editor, children }: {
  editor: Editor | null
  children: React.ReactNode
}) {
  return <EditorContext.Provider value={editor}>{children}</EditorContext.Provider>
}

export function useEditorInstance(): Editor | null {
  return useContext(EditorContext)
}
```

`ExperimentPage` wraps its editor region in `<EditorProvider editor={editor}>`. The rail is mounted as a sibling **inside** that provider so it can call `useEditorInstance()`.

### 4.1 Observation hook

```tsx
// useExperimentPanels.ts — subscribes to the doc, returns parsed panel data
function useExperimentPanels(): PanelBlockData[] {
  const editor = useEditorInstance()
  const [panels, setPanels] = useState<PanelBlockData[]>([])

  useEffect(() => {
    if (!editor) return
    const recompute = () => setPanels(walkPanelNodes(editor.state.doc))
    recompute() // initial
    const handler = ({ transaction }: { transaction: Transaction }) => {
      if (transaction.docChanged) recompute()
    }
    editor.on('transaction', handler)
    return () => { editor.off('transaction', handler) }
  }, [editor])

  return panels
}
```

`walkPanelNodes` descends the doc, collects every `flow_panel` / `if_panel` node, and returns `{ rowId, blockType, content, volumeParams }` per panel in document order.

**Efficiency note:** recompute fires on any `docChanged`, including edits to unrelated text blocks. Volume math is cheap and panels are few, so Phase 1 does the simple thing. If profiling later shows cost (cf. the BlockFrames "50 walks per keystroke" lesson), gate `recompute` on whether the transaction's steps touched a panel node. Deferred optimization, noted inline.

---

## 5. Calculator registry

The pluggable seam. The unit is a **cocktail**: a mix the user prepares and pipettes. The rail asks each panel's calculator for its cocktails, then renders and aggregates them.

### 5.1 Types

```ts
type ReagentKind = 'antibody' | 'secondary' | 'dye'

interface ReagentDraw {
  reagentId: string        // antibody_id, secondary_antibody_id, or dye id
  name: string
  kind: ReagentKind
  dilutionFactor: number   // the "1:N" → N
  volume: number           // µL drawn into this cocktail
}

interface Cocktail {
  id: string               // stable within a panel (e.g. `${rowId}:primary`)
  label: string            // "Stain cocktail", "Primary cocktail", "Secondary cocktail"
  draws: ReagentDraw[]
  totalVolume: number      // num_samples × volume_per_sample × pipet_error
  bufferVolume: number     // totalVolume − Σ draw.volume
}

interface CalcDeps {
  // resolved external data the calculator can't read from the node
  secondaryDilutions: Record<string, number>  // secondary_antibody_id → dilution
}

interface PanelCalculator {
  blockType: 'flow_panel' | 'if_panel'
  computeCocktails(panel: PanelBlockData, deps: CalcDeps): Cocktail[]
}

const CALCULATORS: Record<string, PanelCalculator> = {
  flow_panel: flowCalculator,
  if_panel: ifCalculator,
  // add a third block type's calculator here — that's the whole extension
}
```

Calculators are **pure functions** of node content + params + resolved deps. No fetching, no editor access — those live in the rail. This keeps them trivially unit-testable.

### 5.2 Flow calculator (Phase 1: 1 cocktail)

```
totalVolume = num_samples × volume_per_sample × pipet_error
for each target:
  draw.volume = totalVolume / target.flow_dilution_factor
bufferVolume = totalVolume − Σ draw.volume
→ [ { label: "Stain cocktail", draws, totalVolume, bufferVolume } ]
```

Flow targets are direct conjugates (the recon's drift note confirms flow instance targets lack secondary fields). One cocktail. `dye`-kind targets (DAPI etc.) with no dilution are excluded from draws but may be listed as "no dilution / added separately" — UX detail for the build.

### 5.3 IF calculator (Phase 1: 2 cocktails)

```
totalVolume = num_samples × volume_per_sample × pipet_error

primary cocktail:
  for each target with a primary antibody:
    dilution = target.dilution_override ?? target.icc_if_dilution_factor
    draw.volume = totalVolume / dilution
  bufferVolume = totalVolume − Σ draw.volume

secondary cocktail:
  for each target with a secondary_antibody_id:
    dilution = deps.secondaryDilutions[secondary_antibody_id]   // from §3.3 fetch
    draw.volume = totalVolume / dilution
  bufferVolume = totalVolume − Σ draw.volume

→ [ primaryCocktail, secondaryCocktail ]
```

If a secondary dilution is missing from `deps` (fetch pending or record absent), that draw renders as a no-data state in the rail (parallel to the no-spectra chip pattern — don't fabricate a number). Build detail.

### 5.4 Math reference

Per-reagent volume and buffer match EXPERIMENT-PAGE-ARCHITECTURE.md's "Per-antibody primary volume" / "cocktail buffer" formulas, verified against the mockup. Single source of truth is this doc going forward.

---

## 6. Sidebar component architecture

### 6.1 Layout integration

`ExperimentPage` becomes a flex row: editor region (flex-1, retains its centering/max-width) + the rail (fixed width when open, thin strip when collapsed). The rail must not break the editor's existing width/centering — the recon's §G findings govern exactly where it slots.

### 6.2 Collapse / expand

- Open: fixed width (~320px), header "Calculations" + a `→` collapse arrow.
- Collapsed: thin strip (~36px), a `←` reopen arrow + vertical "Calculations" label. Deliberately single-arrow, not emoji — distinct from the left nav per the recon's §F notes.
- State persists via `UserPreference` key `editor.calc_sidebar_open`, read/written through the existing `getPreferences()` / `updatePreference()` API and a `useCalcSidebarOpen()` hook modeled on `useBlockFramesConfig`.

### 6.3 Accordion sections

One collapsible section per panel block (from `useExperimentPanels()`), in document order. Header: panel name + total cocktail volume. Body: one table per cocktail (flow → 1, IF → 2), each row a `ReagentDraw` (reagent name, 1:N, µL) plus a buffer row. Section open/closed state is **local UI state** (not persisted) — defaults open for the first panel, collapsed for the rest (matches the mockup).

### 6.4 Mastermix detection callout

Top of the rail, above the sections. Pure derived view:

1. Flatten all `ReagentDraw`s across **same-type** panels (flow↔flow, IF↔IF — never cross-type).
2. Group by `(reagentId, dilutionFactor)`.
3. A group with draws from **>1 panel** is a mastermix opportunity → show reagent name, dilution, panel count, summed volume.
4. A reagent that appears in >1 panel at **different dilutions** is a **mismatch** → show a warning ("CD3 is 1:100 in Panel A but 1:200 in Panel B — not combinable"), not an opportunity.

No "combine" action in Phase 1 — detection and display only. The action (and its persistence) is a later phase (§9).

---

## 7. Print / export

`@media print` hides the rail entirely (it's a live interactive tool). The recon found no real Notion-export implementation in code, so the rail is explicitly **out of scope** for export; revisit when/if export is built. Low-stakes, easy to revisit.

---

## 8. Conventions & guards

The build prompt must enforce, per recon §H:

- Semantic design tokens only (no raw gray utilities) — the rail is new UI under the active design-token system.
- TanStack Query rules: the stale-cache coerce rule (the secondary-antibody fetch must null-coalesce if its gate flips), `refetchType: 'none'` on mid-edit refetches.
- Missing-data affordance rule (no fabricated numbers — missing secondary dilution renders a no-data state, not a 0 or a guess).
- CLAUDE.md "NEVER FORGET" checklist (tests, index regen, etc.).

---

## 9. Controls phase — the seam (design pending, NOT in Phase 1)

The controls selectors (built-in vocabulary, in the panel blocks) are a separate design track. Phase 1 is built so they slot in without rework:

- Controls selection lives in **node attrs** (like `volume_params`) — a new `controls` field on the flow/IF node. The editor-observation path already picks up attr changes; no new plumbing.
- A selected control = the calculator emits **additional cocktails**. Examples: a single-stain comp control → a 1-draw cocktail (that one antibody); an FMO-minus-X → a cocktail with all draws except X; unstained → a 0-draw cocktail (buffer only). The `Cocktail[]` return type already expresses all of these.
- Mastermix detection already operates on flattened draws across cocktails, so control-tube draws participate automatically once emitted.
- The rail's "controls accordion" aggregated view is then a second rail section that reads the same computed cocktails, filtered to control-origin ones.

**Open for the controls design conversation:** the exact flow vocabulary (unstained / single-stain / FMO / viability / isotype / comp-beads) and whether IF gets its own vocabulary (secondary-only / autofluorescence / single-channel) or flow ships first. The `flow-cytometry-controls` domain logic is a useful reference for the math (FMO = all-but-one, single-stain = one-each).

---

## 10. Phasing (Phase 1 build → CC prompts)

Proposed commit breakdown for the Phase 1 build prompt (to be written from this doc):

1. **`EditorContext` + provider wiring** in `ExperimentPage`. Tests: sibling can read the editor.
2. **`volume_params` edit UI** in `FlowPanelView` / `IfPanelView` + default reconciliation. Tests: editing fires `updateAttributes`.
3. **Calculator registry + flow + IF calculators** (pure functions). Tests: cocktail math against hand-checked fixtures, including the missing-secondary-dilution no-data path.
4. **`useExperimentPanels` observation hook + secondary-dilution batch fetch.** Tests: doc-walk returns panels; transaction triggers recompute.
5. **Sidebar shell** (layout integration, collapse/expand, `UserPreference` persistence). Tests: collapse state round-trips.
6. **Accordion sections + mastermix detection callout.** Tests: section renders cocktails; mastermix groups + flags mismatches.
7. **Print suppression + CONVENTIONS/doc updates.**

Likely split across two CC sessions (1–4 backend-adjacent/logic, 5–7 UI) with an intermediate report. To be finalized when the prompt is drafted.

---

## 11. Deprecations

This design replaces two sections of `EXPERIMENT-PAGE-ARCHITECTURE.md`:

- **Phase 5 (per-block `VolumeCalculator`)** — superseded. Volume math now lives in the page-level rail, not inside each block. The block only gains the three `volume_params` inputs.
- **Phase 6 (modal mastermix detector)** — superseded. Mastermix is a rail callout, not a modal, and detection is live/derived rather than a triggered scan.

When this doc is accepted, mark those two phases deprecated in `EXPERIMENT-PAGE-ARCHITECTURE.md` (pointer to this doc) rather than deleting them, to preserve history.

---

## 12. Deferred / follow-ups

- **Mastermix action + persistence** (combine-selection storage; likely per-experiment JSON column).
- **Controls selectors** (separate design track, §9).
- **Secondary dilution in the instance snapshot** so the IF calc needs no external fetch (§3.3).
- **Recompute optimization** — gate on panel-touching transactions if profiling warrants (§4.1).
- **Notion export of the rail's computed tables** (§7).
- **`sort_order` float compaction** — unrelated, but the same experiment-page surface; noted in TIPTAP-FOLLOWUPS.

---

## 13. Open items before the build prompt

1. **Field-name reconciliation:** confirm the actual `volume_params` attr field names in the node spec (this doc assumed `num_samples` / `volume_per_sample` / `pipet_error`).
2. **`volume_per_sample` default of 50 µL** — confirm or set a house number.
3. **IF controls in scope for the controls track, or flow-first** (non-blocking for Phase 1).
4. **Commit split / session boundary** for the Phase 1 build prompt (§10).
