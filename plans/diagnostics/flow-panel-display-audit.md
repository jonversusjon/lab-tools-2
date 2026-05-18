# Diagnostic — Flow panel display audit

**Date:** 2026-05-18
**Status:** verified-clean (no bug of the IF #2 shape; intentional UX differences documented)

## Problem statement

The IF panel chip display (Ex %/Det %) had a bug (Phase 2 #2) where the
displayed number was sourced from the thresholded compat endpoint, so
deliberately-picked low-efficiency combos rendered an em-dash. The fix
was to compute efficiency frontend-side from raw spectra
(`utils/efficiencyScore.ts`). This audit asks: does the flow panel have
the same class of bug?

## Investigation

Read in order:

1. `frontend/src/components/panels/PanelDesignerView.tsx` — locate every
   Ex/Det/efficiency display.
2. `frontend/src/components/panels/PanelDesigner.tsx` — identify the
   hooks that feed display.
3. `frontend/src/utils/spectra.ts` — examine `rankChannels` math.
4. `frontend/src/utils/efficiencyScore.ts` — compare math to the IF
   panel reference.

### Display surfaces in `PanelDesignerView.tsx`

The flow panel does NOT have a dedicated Ex %/Det % chip column the way
the IF panel does. Efficiency numbers appear in three places, all in
the assignment-grid cells:

| Surface | Lines | Source | When shown |
|---|---|---|---|
| Compatible candidate cell — big % background number | 1208–1223 | `rankings.score × 100`, tooltip pulls `ranking.excitationEff` / `ranking.detectionEff` | Unassigned row + unassigned detector, `score ≥ 0.01` |
| Below-threshold candidate cell — em-dash | 1192–1206 | `score < 0.01` from `rankChannels` | Unassigned row + unassigned detector, low score |
| Assigned cell | 1120–1138 | Renders the fluorophore NAME, no efficiency number | The user's actual assignment |

Other em-dashes/markers in the grid (occupied-by-other at line 1141,
this-row-assigned-elsewhere at line 1158, awaiting-fluorophore at line
1172) are state indicators, not efficiency values.

### Data flow

```
useFluorophores                  → fluorophores list
useBatchSpectra (PanelDesigner)  → spectraCache
   → merged into `allFluorophoresForScoring`
   → rankChannels(fl, instrument) per row
   → rowChannelScores (Map<antibodyId, ChannelRanking[]>)
   → cell render reads ranking.score / .excitationEff / .detectionEff
```

There is NO call to a backend compat endpoint
(`useInstrumentCompatibility` etc.) in the display path. All numbers
are computed client-side from raw spectra via `rankChannels`.

### `rankChannels` math vs. `efficiencyScore.ts`

| Aspect | `utils/spectra.ts` (flow) | `utils/efficiencyScore.ts` (IF, backend-matching) |
|---|---|---|
| Excitation: spectrum available | `interpolateAt(EX, λ) / peak`, **then noise floor**: `if ratio < 0.05 return 0` | `interpolateAt(EX, λ) / peak`, **no floor** |
| Excitation: spectrum missing | Gaussian fallback, σ=21 nm, with 5% floor | ±40 nm step → 1.0 / 0 |
| Detection: spectrum available | 1nm bandpass integral / full-range integral (`Math.round(low)` to `Math.round(high)`) | Same shape, **`low` not rounded** (starts at exact float low, matching backend) |
| Detection: spectrum missing | Gaussian fallback, σ=17, width-attenuated | ±filter_width step → 1.0 / 0 |
| Arc lamp support | none (flow always laser) | yes (`excitation_type === 'arc'`, `ex_filter_width`) |
| Score cutoff before inclusion | `score > 0.001` filter in `rankChannels` itself | no cutoff (caller decides) |

## Findings

### Per display element

- **Compatible candidate cell (line 1208–1223).** Source: `rankings`
  filtered by `score > 0.001`. Numbers reflect `excitationEfficiency` /
  `detectionEfficiency` AFTER the 5% noise floor has been applied. For
  fluorophores without spectra, the Gaussian fallback runs.

- **Below-threshold candidate cell (line 1192–1206).** Rendered when
  `score < 0.01` (note: 0.01 here, but `rankChannels` filters at
  `score > 0.001`, so values in `[0.001, 0.01)` would render as
  em-dash AND be present in the rankings — minor inconsistency but
  not a bug).

- **Assigned cell (line 1120–1138).** Renders the fluorophore name only
  via `fluorophoreMap.get(rowAssignment.fluorophore_id)`. NO efficiency
  number is shown for the user's actual assignment. The display path
  for assigned combos does NOT pass through `rankChannels` at all for
  numeric output.

### Comparison to IF #2

The IF #2 bug shape required ALL of:
1. A chip displaying the efficiency of the user's ACTUAL assignment
2. That chip's source being a thresholded data set
3. Sub-threshold combos rendering as em-dash because of (2)

Flow panel: **does NOT meet (1)**. The user's actual assignment shows
the fluorophore name, not an efficiency number. There is no equivalent
"this assignment's efficiency is X%" chip in the flow panel today.

## Bug status

**(a) No bug of the IF #2 shape.**

The flow panel's efficiency displays are PROSPECTIVE (across all
candidate cells in the grid, showing "what you'd get if you assigned
here"). The 5% noise floor and `score < 0.01` em-dash in candidate
cells are intentional UX — a heatmap signal that says "not worth
considering." Em-dash on the candidate cell does NOT prevent the user
from clicking and assigning anyway (`handleCellClick` at line 1199
fires regardless).

### Related design differences worth noting (not bugs)

These are intentional today but would matter if anyone proposes
sharing math between the two panels:

1. **5% excitation noise floor.** Live and visible. Sub-5%
   prospective combos render as em-dash. For a researcher deliberately
   picking a weak combo (e.g. cyanine vibronic shoulder at 488 nm for
   AF647 spectral unmixing), the heatmap says "no" even though the
   assignment is valid. Documented intent: noise rejection. If display
   ever needs to show the actual raw number, `efficiencyScore` should
   be the source, not `rankChannels`.

2. **Gaussian fallback divergence.** Flow uses a smooth Gaussian falloff
   (σ=21 ex, σ=17 em) for fluorophores without spectra. Backend (and
   `efficiencyScore`) uses a ±40 nm / ±filter_width step → 1.0 / 0.
   For fluorophores without seeded spectra, the flow grid heatmap
   shows finer gradation than what the backend compat endpoint would
   report. If anyone ever displays per-channel numbers from the
   backend alongside the flow grid, the user will see different
   numbers for the same combo.

3. **`Math.round(low)` in detection integration.** Flow rounds the
   integration bounds to integers before stepping; `efficiencyScore`
   starts at the exact float low and increments by 1. For typical
   integer filter midpoints/widths this is a no-op, but if a filter
   ever has a non-integer width/midpoint the two would diverge by
   sub-1%.

## If bug exists — proposed fix sketch

N/A. No bug.

If the flow panel ever gains an "actual efficiency for assigned combo"
display (e.g. a side panel showing spillover diagonals or a per-row
"channel quality" indicator that reads the assigned combo), the fix
sketch is:

- Import `excitationEfficiency` / `detectionEfficiency` from
  `efficiencyScore.ts` (backend-matching, no noise floor).
- Compute display values from `(spectraCache[fluorophore_id],
  laser.wavelength_nm, det.filter_midpoint, det.filter_width)`.
- Keep `rankChannels` for the grid heatmap and auto-suggest — its
  noise floor and ranking are appropriate for those uses.

This mirrors the IF panel post-fix architecture: two efficiency
utilities, one for raw display, one for ranked/thresholded UX.

## Priority

**Low (no bug today).**

The audit's working assumption (that the flow panel might have
inherited the same shape as IF #2) is not borne out by the code. The
intentional UX differences noted above are worth keeping in a single
place — this file — so the next person who touches the flow panel
chips knows that `rankChannels` and `efficiencyScore` exist for
different reasons and shouldn't be conflated.

Re-audit if a future feature adds an "actual efficiency of the
assigned combo" display to the flow panel.
