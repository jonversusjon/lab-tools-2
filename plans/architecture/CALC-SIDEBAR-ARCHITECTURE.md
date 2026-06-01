# Calculations Sidebar — Architecture (Phase 1)

**Status:** Drafted, pre-build. Corrected against the full recon (`plans/research/calc-sidebar-recon.md` @ `e30d395`). Replaces the prior committed draft (`b711c6a`).
**Supersedes:** EXPERIMENT-PAGE-ARCHITECTURE.md Phase 5 (per-block `VolumeCalculator`) and Phase 6 (modal mastermix detector) — see §11.

---

## 1. TL;DR (upside triangle)

A page-level **right rail** on the experiment page. Collapses to a thin labeled strip with a single arrow. When expanded, one **accordion section per panel block** on the current page, each showing that panel's cocktail/volume breakdown. A **cross-panel mastermix callout** sits at the top.

The facts that shape everything (from the full recon):

- **The rail is a pure computed view.** All inputs live in the panel blocks. It reads + computes; it persists only its own open/closed flag.
- **Observation is live, via the editor doc.** The rail gets the `editor` instance (prop + a thin `EditorContext`), subscribes to `editor.on('transaction', …)`, and walks `editor.state.doc` for panel nodes. Edits to dilutions/params are `updateAttributes` → `docChanged` transactions → seen immediately. TanStack lags ~1500 ms (save debounce), and `ExperimentPage` doesn't even subscribe to it, so live doc-walk is the only correct path.
- **The calculator reuses the app's existing staining-mode logic; it does not reinvent it.** Direct vs indirect is already inferred from whether the primary antibody has a fluorophore conjugate (conjugated → direct, conjugate auto-fills the dye/secondary column, uneditable; unconjugated or chemical-only e.g. biotin → indirect, the column activates for compatible-secondary selection). The calculator keys off the *output* of that logic — whether `target.secondary_antibody_id` is set. Each panel emits a **primary cocktail** (a draw per *antibody* primary, conjugated or not), a **secondary cocktail** for any target with a secondary assigned, and a **separate single-reagent cocktail per dye** (dyes are stained in their own steps with unique incubation times — never in the antibody mixes). Flow and IF differ only in which primary dilution field is read, which `volume_params.dilution_source` already encodes. Controls slot in later as additional cocktails.
- **`volume_params` has no edit UI today** (recon J2) — the attr exists but nothing writes it. Phase 1 adds the three inputs (samples, µL/sample, excess ×) to both panel views.
- **No migration.** Secondary dilution becomes a per-instance numbers-only `secondary_dilution_factor` field inside the `targets` attr (block-content JSON), not a DB column. Templates carry dilutions, so no library-default field is needed on `SecondaryAntibody`/`Antibody`.
- **Volume/mastermix code is built from scratch** (recon D) — nothing exists.

Phase 1 ships volume calc + mastermix **detection** (display only). Mastermix **action**/persistence and the **controls** selectors are out of Phase 1 (§9, §12).

---

## 2. Locked decisions

| # | Decision | Choice |
|---|----------|--------|
| 1 | Observation | Live doc-walk: `editor` via prop + thin `EditorContext`; `editor.on('transaction')` subscription |
| 2 | Sidebar open/closed persistence | `UserPreference` key `experiment_page.calc_sidebar_open`, modeled on `useExperimentLastFullWidth` (NOT the left nav's `localStorage`) |
| 3 | Mastermix selection persistence | **Deferred.** Phase 1 = detection-only, derived, no storage |
| 4 | Volume params location | Per-block, in node attrs (already there). Phase 1 adds the edit inputs to the panel views |
| 5 | Calculator shape | Uniform; secondary draw keyed off `secondary_antibody_id` (the existing conjugate-inference logic's output — not re-derived); per-block-type only via `dilution_source` (§5) |
| 6 | Print/export | Suppress in `@media print`; out of scope for Notion export (none exists in code) |
| 7 | Volume param defaults | Keep code's existing: `num_samples 1`, `volume_per_sample_ul 100 (flow) / 200 (IF)`, `pipet_error_factor 1.1`. Templates + on-the-fly editing carry real values |
| 8 | Secondary dilution | New per-instance numbers-only `secondary_dilution_factor` on BOTH target interfaces. No migration, no DB default (templates carry it) |
| 9 | Phase 0 | **Cancelled.** Templates obviate library default dilutions |

---

## 3. Data model

### 3.1 Confirmed current shapes (recon §A, verbatim field names)

`VolumeParams` (`types/index.ts:904`): `num_samples`, `volume_per_sample_ul`, `pipet_error_factor`, `dilution_source: 'flow' | 'icc_if'`. Node defaults at `flowPanel.ts:37` / `ifPanel.ts:42` (also slash-menu + view fallback — three sync points each; the build keeps them consistent if it touches defaults, but per decision #7 we don't change the values).

`FlowPanelInstanceTarget` (`types/index.ts:843`): `antibody_*`, `dye_label_*`, `staining_mode: string`, `secondary_antibody_id/name`, `flow_dilution_factor: number|null`, `icc_if_dilution_factor: number|null`. (No `secondary_fluorophore_*` — irrelevant to volume math.)

`IFPanelInstanceTarget` (`types/index.ts:873`): `antibody_*`, `dye_label_*`, `staining_mode: string`, `secondary_antibody_id/name`, `secondary_fluorophore_id/name`, `dilution_override: string|null`, `icc_if_dilution_factor: number|null`.

### 3.2 New field (no migration)

Add `secondary_dilution_factor: number | null` to **both** `FlowPanelInstanceTarget` and `IFPanelInstanceTarget`. It lives inside each target object in the `targets` attr array (block-content JSON), so it round-trips through the existing adapter with no Alembic migration. Defaults to `null`. Populated by the user (numbers-only input) or pre-filled when a template carrying it is inserted. Never writes back to any library record (there is no library dilution field — by design).

Touch points (target-object level, not a new node): `types/index.ts` interfaces; wherever targets are constructed/edited in the panel designers (new targets default the field to `null`); the panel views' target editor (the numbers-only input, shown only when the **existing** dye/conjugate logic has activated the secondary column for that row — reuse that condition, do not write a new direct/indirect check). The adapter round-trips `targets` wholesale, so no per-field adapter change is expected — the build verifies (§13.2).

### 3.3 Secondary dilution model (was the §3.3 "design hole")

Stamp-free, library-free: `secondary_dilution_factor` is a plain editable per-instance number. Empty on a bare insert → the calc renders that secondary draw as a **no-data state** (the no-spectra-chip convention — never fabricate a number). Templates pre-fill it. On-the-fly edits stay local to the instance. This is option (c) from the design discussion; templates replace any DB-sourced default.

### 3.4 No new persistence in Phase 1

Mastermix detection is derived from the doc on every relevant transaction. No table, column, or block type added. The mastermix *action* phase (later) will most likely add a per-experiment JSON column on `Experiment` (recon D4 confirms none exists); deferred to that phase.

---

## 4. Editor exposure & observation

Editor is local to `ExperimentPage` (recon C1–C2); no context exists. Phase 1 adds a thin context and mounts the rail as a sibling inside `ExperimentPage`.

```tsx
// blocks-tiptap/EditorContext.tsx
const EditorContext = createContext<Editor | null>(null)
export const EditorProvider = ({ editor, children }) =>
  <EditorContext.Provider value={editor}>{children}</EditorContext.Provider>
export const useEditorInstance = () => useContext(EditorContext)
```

Observation hook (subscription pattern mirrors `saveCoordinator.ts:370`):

```tsx
function useExperimentPanels(): PanelBlockData[] {
  const editor = useEditorInstance()
  const [panels, setPanels] = useState<PanelBlockData[]>([])
  useEffect(() => {
    if (!editor) return
    const recompute = () => setPanels(walkPanelNodes(editor.state.doc))
    recompute()
    const handler = ({ transaction }) => { if (transaction.docChanged) recompute() }
    editor.on('transaction', handler)
    return () => { editor.off('transaction', handler) }
  }, [editor])
  return panels
}
```

`walkPanelNodes` uses `doc.descendants` filtered to `flow_panel`/`if_panel` (recon C3 canonical pattern), returning `{ rowId, blockType, name, targets, volumeParams }` in document order.

**Efficiency note:** recompute fires on any `docChanged`. Volume math is cheap and panels are few — Phase 1 does the simple thing. If profiling warrants (cf. BlockFrames "50 walks per keystroke"), gate on whether the transaction touched a panel node. Deferred (§12).

---

## 5. Calculator

The pluggable unit is a **cocktail** (a mix the user pipettes). The structure is shared; only dilution-field selection is per-block-type, via `dilution_source`.

### 5.1 Types

```ts
type ReagentKind = 'antibody' | 'secondary' | 'dye'
type DrawState = 'computed' | 'no_dilution'   // no fabricated numbers

interface ReagentDraw {
  reagentId: string
  name: string
  kind: ReagentKind
  state: DrawState
  dilutionFactor: number | null
  volume: number | null            // null when state === 'no_dilution'
}
interface Cocktail {
  id: string                       // `${rowId}:primary` | `${rowId}:secondary`
  label: string                    // "Stain cocktail" if sole; else "Primary"/"Secondary"
  draws: ReagentDraw[]
  totalVolume: number              // num_samples × volume_per_sample_ul × pipet_error_factor
  bufferVolume: number             // totalVolume − Σ computed draw volumes
}
```

### 5.2 Algorithm (one function, both block types)

```
vp = panel.volume_params
totalVolume = vp.num_samples × vp.volume_per_sample_ul × vp.pipet_error_factor

primaryDraws   = []   // antibody primaries (conjugated + unconjugated) — one primary incubation
secondaryDraws = []   // secondaries for targets with a secondary assigned — one secondary incubation
dyeCocktails   = []   // each dye is its OWN step (unique incubation times); never in primary/secondary

for target in panel.targets:
  dilution =
    vp.dilution_source === 'flow'
      ? target.flow_dilution_factor                                    // number | null
      : parseDilution(target.dilution_override) ?? target.icc_if_dilution_factor

  if target.antibody_id:
    primaryDraws.push(makeDraw(antibodyReagentOf(target), dilution, totalVolume))
    // secondary draw iff a secondary antibody is assigned — the OUTPUT of the app's
    // existing conjugate-inference logic (unconjugated / chemical-only primary →
    // secondary column activates → user picks a compatible secondary → secondary_antibody_id
    // set). The calculator does NOT re-derive staining mode.
    if target.secondary_antibody_id:
      secondaryDraws.push(
        makeDraw(secondaryReagentOf(target), target.secondary_dilution_factor, totalVolume))
  else if target.dye_label_id:
    // dyes stained separately, each its own incubation — one single-draw cocktail per dye
    dyeCocktails.push(
      cocktail(`dye:${target.id}`, dyeLabelNameOf(target),
               [ makeDraw(dyeReagentOf(target), dilution, totalVolume) ], totalVolume))

cocktails = []
if primaryDraws.length:   cocktails.push(cocktail('primary',   primaryDraws,   totalVolume))
if secondaryDraws.length: cocktails.push(cocktail('secondary', secondaryDraws, totalVolume))
cocktails.push(...dyeCocktails)
return cocktails
```

- `makeDraw`: `dilution == null || dilution <= 0` → `state: 'no_dilution', volume: null`; else `volume = totalVolume / dilution`.
- `parseDilution(str)`: `"1:500"` → 500, `"500"` → 500, blank/garbage → `null`. (IF `dilution_override` is a string; flow `flow_dilution_factor` is already a number — no parse.)
- `antibodyReagentOf` / `secondaryReagentOf` / `dyeReagentOf`: read the relevant name/id off the target. A target is an antibody target if `antibody_id` is set, else a dye target if `dye_label_id` is set.
- **Dyes are never folded into the primary or secondary cocktail.** Each dye target becomes its own single-draw cocktail (separate incubation, unique timing). A panel with only dyes emits only dye cocktails; a panel with no dyes emits none. Dye steps use the same `totalVolume` formula (per-sample volume assumed equal — confirm if a dye step differs).
- No `staining_mode` string-matching: the secondary draw is gated purely on `secondary_antibody_id` being set. `staining_mode` is the existing UI's derived label; the actionable signal (a secondary was assigned) is what the calculator reads, so the conjugate-inference logic is reused via its output rather than duplicated.
- `bufferVolume` ignores `no_dilution` draws (can't subtract an unknown).
- Cocktail label: the antibody cocktail is "Stain cocktail" when there's no secondary cocktail, "Primary cocktail" when there is; the secondary is "Secondary cocktail"; each dye cocktail is labelled by the dye's name.

### 5.3 Registry

```ts
// the per-block-type seam is just dilution-source selection today;
// kept as a registry so a future block type with different field shapes plugs in cleanly
const CALCULATORS: Record<string, (p: PanelBlockData) => Cocktail[]> = {
  flow_panel: computeCocktails,   // same fn; reads vp.dilution_source === 'flow'
  if_panel:   computeCocktails,   // same fn; reads vp.dilution_source === 'icc_if'
  // add a third block type here
}
```

Calculators are pure functions of node content + params. No fetching, no editor access — the §3.2 change means there's no secondary fetch either. Trivially unit-testable.

---

## 6. Sidebar component

### 6.1 Layout integration (recon §G)

`ExperimentPage`'s container is a flex column with no rail slot. Refactor: wrap the editor region and the rail in a flex **row** — editor `flex-1` (retaining its `prose`/centering and the full-width vs `max-w-7xl` toggle), rail in a fixed-width column when open / thin strip when collapsed. The rail lives inside `ExperimentPage` (not `Shell`). Must not break `PageWidthToggle` behavior.

### 6.2 Collapse / expand

Open ~320px: header "Calculations" + `→` collapse arrow. Collapsed ~36px: `←` reopen + vertical "Calculations" label. Single-arrow, deliberately unlike the left nav's icon strip. State via `UserPreference` `experiment_page.calc_sidebar_open`, read/written through `getPreferences()`/`updatePreference()` with a `useCalcSidebarOpen()` hook modeled on `useExperimentLastFullWidth`.

### 6.3 Accordion sections

One collapsible section per panel (from `useExperimentPanels()`), document order. Header: panel name + summed cocktail volume. Body: one table per cocktail (primary, optional secondary, and one per dye), rows = `ReagentDraw` (name, 1:N, µL) + a buffer row; `no_dilution` draws render the no-data affordance, not 0. Section open state is local UI state (not persisted); first panel open, rest collapsed.

### 6.4 Volume-params inputs

Phase 1 adds three numbers-only inputs (samples, µL/sample, excess ×) to `FlowPanelView` and `IfPanelView` — *in the blocks, not the rail* (decision #4). Editing calls `updateAttributes` on `volume_params` → transaction → rail recomputes. The secondary-dilution numbers-only input (§3.2) is added to the target editor in the same views, shown whenever the existing dye/conjugate logic has activated the secondary column for that row (reuse that condition; do not write a new direct/indirect check).

### 6.5 Mastermix detection callout

Top of the rail. Derived: flatten all draws across **same-block-type** panels (flow↔flow, IF↔IF, never cross-type); group by `(reagentId, dilutionFactor)`; a group spanning >1 panel = opportunity (reagent, dilution, panel count, summed volume); a reagent in >1 panel at **different** dilutions = mismatch warning ("not combinable"), not an opportunity. No combine *action* in Phase 1.

---

## 7. Print / export

Add `@media print { display: none }` for the rail (recon G3 shows only the frame-border suppression rule exists today). Notion export has no code (recon G3) — rail explicitly out of scope for export; revisit if/when export is built.

---

## 8. Conventions & guards (recon §H)

- Semantic design tokens only (`text-foreground`, `bg-surface`, `border-border`) — no raw gray.
- TanStack: stale-cache coerce rule (any gated hook), `refetchType: 'none'` on mid-edit refetches, mutations invalidate list key.
- Missing-data affordance: `no_dilution` draws show a distinct state, never a fabricated 0 (raw-display rule).
- `@/` alias in tsconfig + vite + vitest; loading/error/empty states on any data-dependent component; async unmount writes guard with `isUnmountingRef`.
- Dropdowns (if any) need `z-50`.

---

## 9. Controls phase — the seam (design pending, NOT in Phase 1)

Built-in control vocabulary, selectors in the panel blocks (flow + IF each get their own vocab). Phase 1 is built so they slot in:

- Controls selection → a `controls` node attr (like `volume_params`); the observation path already picks up attr changes.
- A selected control = the calculator emits **additional cocktails**: single-stain comp → 1-draw cocktail; FMO-minus-X → all primary draws except X; unstained → buffer-only. The `Cocktail[]` return type already expresses all of these — no interface change.
- Mastermix detection already flattens across cocktails, so control draws participate automatically.
- The rail's "controls accordion" is a second section reading the same computed cocktails, filtered to control-origin ones.

Open for that conversation: exact flow vs IF control vocabularies. Domain reference: the `flow-cytometry-controls` skill (FMO = all-but-one, single-stain = one-each).

---

## 10. Phase 1 build phasing (approved 7-commit / ~2-session split)

1. `EditorContext` + provider wiring + rail mount point (layout row refactor). Tests: sibling reads editor; layout preserves width toggle.
2. `volume_params` edit inputs + `secondary_dilution_factor` field + its input, in both panel views. Tests: editing fires `updateAttributes`; new targets default the field to null.
3. Calculator (pure fn + registry, `parseDilution`, staining-mode routing). Tests: cocktail math vs hand-checked fixtures incl. direct-only (1 cocktail), indirect (2), mixed, and `no_dilution` paths.
4. `useExperimentPanels` observation hook. Tests: doc-walk returns panels; transaction triggers recompute.
5. Sidebar shell (layout, collapse/expand, `UserPreference`). Tests: collapse round-trips.
6. Accordion sections + mastermix detection callout. Tests: cocktails render; mastermix groups + flags mismatches.
7. Print suppression + CONVENTIONS/doc updates.

Logic 1–4, UI 5–7, intermediate report between sessions. Finalized in the build prompt.

---

## 11. Deprecations

Mark deprecated in `EXPERIMENT-PAGE-ARCHITECTURE.md` (pointer here, don't delete):
- Phase 5 (per-block `VolumeCalculator`) — volume math now in the page rail; blocks only gain the `volume_params` inputs.
- Phase 6 (modal mastermix detector) — now a live derived rail callout, not a modal scan.

---

## 12. Deferred / follow-ups

- Mastermix action + persistence (likely per-experiment JSON column).
- Controls selectors (separate design track, §9).
- Recompute optimization — gate on panel-touching transactions if profiling warrants (§4).
- Notion export of the rail's tables (§7).
- Primary/secondary dilution model unification — primary uses a snapshotted number + string override; secondary (new) is a single editable number. Cleaner; unify someday. Out of scope.
- Flow `secondary_fluorophore_id/name` absence (recon J1) — irrelevant to volume math, but a gap for any future flow indirect spectral display.

---

## 13. Open items before/within the build prompt

1. **Reuse the existing conjugate-inference logic; don't reinvent it.** The build must (a) locate where the dye/conjugate UI decides the secondary column is active vs auto-filled, and reuse that exact condition to gate the secondary-dilution input; (b) confirm `primaryReagentOf` — specifically whether a *conjugated* antibody target leaves `dye_label_*` empty (conjugate intrinsic to the antibody) or populates it, since that determines whether the primary draw reads the antibody or a dye. The secondary-draw trigger is settled: `secondary_antibody_id` presence. Folded into commits 2–3.
2. **`secondary_dilution_factor` adapter round-trip** — verify the `targets` adapter serializes the new field without per-field changes (expected, since `targets` round-trips wholesale). Confirm in commit 2.
3. Commit split / session boundary — §10, approved.
