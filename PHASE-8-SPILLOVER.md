# Phase 8: Spillover Matrix Heatmap + Panel Spectra

> **Context:** Read `ARCHITECTURE.md`. Assignment grid is functional (Phase 7). SpectraViewer exists (Phase 4). This phase adds the live spillover matrix and integrates the spectra viewer into the panel context.
>
> **Before starting:** Run all backend and frontend tests to confirm baseline is green.

## Goal

Implement the client-side spillover calculation, render the NxN heatmap below the assignment table, and embed the spectra viewer in the panel designer with laser lines and detector windows overlaid.

## Tasks

### 1. Spillover calculation

**`utils/spillover.ts`** — replace stub:

```typescript
interface SpilloverInput {
  fluorophoreId: string
  fluorophoreName: string
  emissionSpectra: number[][]  // [[wavelength, intensity], ...]
  detectorMidpoint: number
  detectorWidth: number
}

/**
 * Compute NxN spillover matrix for assigned fluorophores.
 *
 * spillover[i][j] = fraction of fluorophore i's emission captured by
 * fluorophore j's assigned detector, relative to fluorophore i's own detector.
 *
 * = ∫ emission_i(λ) × T_j(λ) dλ  /  ∫ emission_i(λ) × T_i(λ) dλ
 *
 * T(λ) = rectangular bandpass: 1 inside [midpoint - width/2, midpoint + width/2], 0 outside.
 * Integrate numerically at 1nm resolution using interpolateAt from utils/spectra.ts.
 * Diagonal = 1.0 by definition.
 * Return null for entries where spectra are unavailable or denominator is 0.
 */
export function computeSpilloverMatrix(
  assignments: SpilloverInput[]
): { labels: string[], matrix: (number | null)[][] }
```

**Performance requirements:**
- **Memoize the 1nm interpolated emission grid per fluorophore.** Create a cache (Map keyed by fluorophoreId) that stores the pre-interpolated emission array from 300–850nm at 1nm steps. Compute this once per fluorophore, not on every matrix recalculation.
- The `interpolateAt` function from `utils/spectra.ts` is the source of truth for interpolation — reuse it here.
- Should handle 20×20 matrices without noticeable lag (<50ms).
- The function must be pure aside from the memoization cache. Expose a `clearSpilloverCache()` function for testing.

### 2. Spillover heatmap component

**`components/panels/SpilloverHeatmap.tsx`**:

Props:
```typescript
interface SpilloverHeatmapProps {
  labels: string[]              // fluorophore names
  matrix: (number | null)[][]   // NxN values, null = N/A
}
```

Rendering:
- Pure HTML/CSS grid or table (no charting library needed)
- Row and column headers = fluorophore names (rotated 45° for columns if many, or truncated with tooltip)
- Each cell:
  - Shows value to 2 decimal places (e.g. "0.15")
  - "N/A" if null
  - Diagonal cells: "1.00", neutral background (light grey #F3F4F6)
  - Off-diagonal color using `heatmapColor()` from `utils/colors.ts`:
    - 0.00 → white
    - 0.10–0.20 → yellow
    - 0.30–0.50 → orange
    - >0.50 → red
  - Text is **bold** if value > 0.25
  - Cell size: minimum ~50px square, readable text
- If no assignments yet → show placeholder message "Add fluorophore assignments to see spillover matrix"
- If only 1 assignment → show single cell (just the 1.00 diagonal) with a note that ≥2 assignments are needed for spillover analysis

### 3. Wire heatmap into panel designer

In `PanelDesigner.tsx`:
- Replace the Phase 6 placeholder with `SpilloverHeatmap`
- After every assignment change (add, remove, reassign), recompute the matrix from current assignments using `computeSpilloverMatrix`
- Use `useMemo` — recompute only when assignments array changes
- Pass spectra data from the batch-spectra cache (`useBatchSpectra` hook from Phase 4). Do NOT fetch spectra per-fluorophore — use the cached batch data.

### 4. Spectra viewer in panel context

Add a collapsible "Panel Spectra" section to the panel designer (between the assignment table and the spillover heatmap):

- Automatically shows emission spectra for all assigned fluorophores in overlay mode
- Overlays laser lines (dashed verticals) for the selected instrument's lasers
- Overlays detector bandpass windows (shaded rectangles) for all detectors that have assignments
- Uses the existing `SpectraViewer` component from Phase 4 — just pass the right props
- Default to collapsed if >5 assignments (to save vertical space), with a toggle button
- When no assignments, show helper text instead of empty chart

### 5. Tests

**`frontend/src/__tests__/spillover.test.ts`**:
- Test: two non-overlapping fluorophores → spillover ≈ 0.0 (e.g., BV421 em ~421nm into APC detector 670/30)
- Test: two overlapping fluorophores → spillover > 0.1 (e.g., FITC em into PE detector 582/15, or similar known pair with overlapping emission)
- Test: diagonal is always 1.0
- Test: missing/empty spectra → null entries
- Test: single fluorophore → 1×1 matrix with [[1.0]]
- Test: empty input → empty matrix
- Test: `clearSpilloverCache()` resets the memoization cache
- Test: matrix computation completes in <50ms for 10 fluorophores (performance sanity check)

**`frontend/src/__tests__/SpilloverHeatmap.test.tsx`**:
- Test: renders NxN grid with correct labels
- Test: diagonal cells show "1.00"
- Test: null values show "N/A"
- Test: high spillover cell (>0.25) has bold text
- Test: placeholder shown when no assignments
- Test: cell background colors are applied (check style or class)

## Tests to run

```bash
cd frontend && npx vitest run && npx tsc --noEmit
```

## Success criteria — ALL must pass before moving to Phase 9

1. All tests pass
2. TypeScript clean
3. Manual verification:
   - Panel with seed instrument. Assign FITC→530/30, PE→582/15, APC→670/30 (Red)
   - Spillover heatmap shows 3×3 matrix
   - FITC→PE detector shows moderate spillover (FITC emission tail into 567–597nm range)
   - FITC→APC detector shows ~0.00 (no overlap)
   - Diagonal all shows 1.00
   - High spillover cells are yellow/orange/red with bold text
   - Low spillover cells are white/near-white
   - Add a 4th assignment → heatmap updates to 4×4 instantly (no page reload)
   - Remove an assignment → heatmap shrinks to 3×3 instantly
   - Spectra overlay section shows emission curves of all assigned fluorophores with laser lines and detector rectangles visible
   - Heatmap update is instantaneous — no perceptible lag even with 10+ assignments
   - Values are physically plausible (someone who knows flow cytometry would look at this and say "yeah that makes sense")
