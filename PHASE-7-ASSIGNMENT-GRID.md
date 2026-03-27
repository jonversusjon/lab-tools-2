# Phase 7: Panel Designer — Assignment Grid

> **Context:** Read `ARCHITECTURE.md`. Panel designer skeleton exists (Phase 6) with rendered headers and target rows (backed by PanelTarget model). This phase makes the grid interactive.
>
> **Before starting:** Run all backend and frontend tests to confirm baseline is green.

## Goal

Implement the core assignment interaction: clicking a cell opens a fluorophore picker filtered by laser/detector compatibility, selecting a fluorophore creates an assignment, and the grid visually reflects assigned rows and occupied columns. Pre-conjugated antibodies auto-select their fluorophore. Each detector gets exactly one antibody and each antibody gets exactly one detector.

## Prerequisites

- PanelTargets are persisted to the backend (Phase 6). Every antibody in the grid has a PanelTarget record.
- The batch-spectra endpoint (`POST /fluorophores/batch-spectra`) is implemented (Phase 4). The panel designer uses it to pre-fetch spectra for compatibility checks.
- Panel can have `instrument_id = null`. **No assignment interaction is possible without an instrument.** If instrument is null, all cells are disabled/hidden and the UI shows "Select an instrument."

## Tasks

### 1. Implement spectra utility functions

**`utils/spectra.ts`** — replace stubs with real implementations:

```typescript
/**
 * Linear interpolation: given a spectrum as [[wavelength, intensity], ...],
 * return the intensity at the given wavelength.
 * Returns 0 if wavelength is outside the spectrum range.
 * Spectrum must be sorted by wavelength (ascending).
 */
export function interpolateAt(
  spectra: number[][],
  wavelength: number
): number

/**
 * Downsample a spectrum to every `stepNm` nanometers.
 * Used before passing spectra to Chart.js for rendering.
 */
export function downsampleSpectra(
  spectra: number[][],
  stepNm: number = 2
): number[][]

/**
 * Can this fluorophore be excited by the given laser?
 * If full excitation spectrum available: use interpolateAt to get
 * intensity at laser wavelength, compare to max intensity in spectrum.
 * Threshold: ≥ 15% of peak.
 * Fallback (no spectra or empty): laser within ±40nm of excitation max.
 */
export function isExcitable(
  fluorophore: Fluorophore,
  laserWavelength: number
): boolean

/**
 * Can this detector collect meaningful signal from this fluorophore?
 * If full emission spectrum available: compute integral of emission
 * over bandpass [midpoint - width/2, midpoint + width/2] at 1nm steps
 * using interpolateAt. Compare to total emission integral.
 * Threshold: ≥ 5% of total.
 * Fallback (no spectra): emission max within [midpoint - width, midpoint + width].
 * Note: fallback uses generous 2× window.
 */
export function isDetectable(
  fluorophore: Fluorophore,
  filterMidpoint: number,
  filterWidth: number
): boolean

/**
 * Combined: is this fluorophore compatible with this laser+detector pair?
 */
export function isCompatible(
  fluorophore: Fluorophore,
  laserWavelength: number,
  filterMidpoint: number,
  filterWidth: number
): boolean
```

**Spectra data source:** These functions need full spectra data. The panel designer pre-fetches all fluorophore spectra via `useBatchSpectra()` (calls `POST /fluorophores/batch-spectra`) on mount. The spectra data is merged into the fluorophore objects before being passed to compatibility functions. Do NOT fetch spectra per-fluorophore — use the batch cache.

### 2. Fluorophore picker

**`components/panels/FluorophorePicker.tsx`**:
- Rendered as a popover/dropdown anchored to the clicked cell
- Receives: `laserWavelength`, `filterMidpoint`, `filterWidth`, `assignedFluorophoreIds` (already used in this panel), `antibody` (the target row's antibody object), `spectraCache` (the batch-fetched spectra data)
- **Pre-conjugated antibody handling:**
  - If `antibody.fluorophore_id` is set AND the conjugated fluorophore is compatible with this laser+detector: show ONLY that fluorophore, pre-selected. The user can confirm or cancel but cannot pick a different fluorophore.
  - If the conjugated fluorophore is NOT compatible with this cell: show a warning "Pre-conjugated fluorophore (X) is not compatible with this detector" and disable selection for this cell.
- **Unconjugated antibody handling:**
  - Uses the full fluorophore list with spectra from the batch cache
  - Filters to only compatible fluorophores using `isCompatible()`
  - Each option shows: fluorophore name, Ex/Em max
  - Fluorophores already assigned to a different detector in this panel: shown with a warning icon (⚠️) and dimmed, but still selectable (user might want to use same fluorophore on a different detector in rare cases — the backend unique constraint on `panel_id + detector_id` will still prevent same detector reuse)
- "Clear" option if the cell is currently assigned
- On select: dispatches `ADD_ASSIGNMENT` to the reducer and POSTs to backend
- On clear: dispatches `REMOVE_ASSIGNMENT` and DELETEs from backend
- **On 409 from backend** (detector already occupied or antibody already assigned): show error, roll back local state
- Click outside or Escape closes the popover

### 3. Assignment table interaction

Update the assignment table/grid component from Phase 6:

**Guard: no interaction without instrument.** If `panel.instrument_id` is null, the detector columns don't exist. Show only the target list with a message "Select an instrument to assign fluorophores."

**Cell rendering logic:**
- **Unassigned + detector available**: default background, clickable cursor, subtle hover effect
- **Unassigned + detector occupied** (another antibody already assigned to this detector): grey background with diagonal stripe or "×" indicator. **Not clickable** — each detector gets exactly one antibody. Show tooltip: "Detector assigned to [other target name]"
- **Assigned cell** (this target has a fluorophore in this detector): shows fluorophore name, colored background matching the laser group color (muted/pastel version), clickable to reassign or clear
- **Incompatible cell** (no fluorophores pass the compatibility filter for this laser+detector, or for pre-conjugated antibodies the conjugated fluorophore is incompatible): very light grey, not clickable, show a "—" with disabled cursor

**Row state:**
- If the target has an assignment in the panel → entire row gets a subtle background tint
- Pre-conjugated targets: show a small lock icon (🔒) or "conj." badge next to the fluorophore name in the assigned cell

**Column state:**
- If a detector has an assignment → the column header sub-cell gets a colored dot or background indicating it's occupied. **Other rows' cells in this column become non-clickable** (enforcing 1:1 detector:antibody).

### 4. Sync assignments to backend

When a fluorophore is picked or cleared:
1. Dispatch to local reducer (instant UI update — optimistic)
2. POST or DELETE to `/api/v1/panels/{id}/assignments`
3. On success: keep local state
4. On error (e.g., 409 conflict): roll back the reducer state, show error toast

**Backend validation reminder:** POST assignment validates that the antibody is already a PanelTarget for this panel. If somehow the target was removed between the UI rendering and the POST, the backend returns 400.

Use the existing `usePanelDesigner` reducer from Phase 6 — wire up the API calls.

### 5. Tests

**`frontend/src/__tests__/spectra.test.ts`** — test the utility functions:
- Test: `interpolateAt` with known data points → exact match at data point
- Test: `interpolateAt` between data points → linear interpolation
- Test: `interpolateAt` outside range → returns 0
- Test: `downsampleSpectra` reduces point count
- Test: FITC (ex 494, em 519) is excitable by 488nm laser → true
- Test: FITC is NOT excitable by 637nm laser → false
- Test: FITC is detectable by 530/30 filter (515–545nm, em max 519 inside) → true
- Test: FITC is NOT detectable by 780/60 filter → false
- Test: APC (ex 650, em 660) is excitable by 637nm → true
- Test: APC is detectable by 670/30 (655–685nm) → true
- Test: with full spectra data, excitability check uses intensity threshold
- Test: with full spectra data, detectability check uses integral threshold

**`frontend/src/__tests__/FluorophorePicker.test.tsx`**:
- Test: only shows compatible fluorophores for a given laser/detector (unconjugated antibody)
- Test: pre-conjugated antibody shows only the conjugated fluorophore
- Test: pre-conjugated antibody with incompatible fluorophore shows warning
- Test: shows warning icon for already-assigned fluorophores
- Test: selecting a fluorophore calls the onSelect handler
- Test: "Clear" option appears when cell is already assigned

**`frontend/src/__tests__/AssignmentTable.test.tsx`**:
- Test: clicking an unassigned cell opens the picker
- Test: assigned cell shows fluorophore name with colored background
- Test: occupied detector column disables cells for other targets
- Test: assigned row has tint
- Test: occupied column header shows indicator
- Test: null instrument state shows no detector columns, just targets

## Tests to run

```bash
cd frontend && npx vitest run && npx tsc --noEmit
cd backend && pytest tests/ -v --tb=short
```

## Success criteria — ALL must pass before moving to Phase 8

1. All tests pass
2. TypeScript clean
3. Manual verification:
   - Open a panel with the seed instrument, add CD3 + CD4 + CD8 as targets
   - Click cell at CD3 × 530/30 (Blue laser) → picker shows FITC, BB515 (compatible fluorophores)
   - Select FITC → cell shows "FITC" with blue-tinted background
   - CD3 row gets background tint
   - 530/30 column header shows occupied indicator
   - **Other rows' cells in the 530/30 column become non-clickable** (detector is taken)
   - Click cell at CD4 × 670/30 (Red laser) → picker shows APC, AF647 (compatible)
   - Select APC → cell shows "APC" with red-tinted background
   - Click the FITC cell on CD3 → picker opens with "Clear" option, can reassign
   - Clear it → cell returns to empty, row tint removed, 530/30 column cells become clickable again
   - Reload page → assignments persist (and targets also persist)
   - Incompatible cells (e.g., FITC options shouldn't appear under Red laser detectors) are correctly filtered
   - If you add a pre-conjugated antibody (created in Phase 5), its cell auto-shows the conjugated fluorophore
   - Panel with null instrument: shows targets but no detector columns, message to select instrument
