# Diagnostic — Detector ordering on flow panels

**Date:** 2026-05-14
**Status:** verified-complete (no code changes needed)

## Problem statement

> Detectors need to be ordered by wavelength in the panel design tables from
> left to right, violet to red

## Investigation

Reviewed the three referenced commits and the current source:

- **`c15faed`** "fix(if-panels): sort filter columns by laser wavelength
  ascending" — touched **only** `IFPanelDesignerView.tsx`: the filter
  `<select>` now iterates `state.microscope.lasers` sorted by
  `wavelength_nm` ascending.
- **`77743b0`** "docs: add convention for detector column sort order" — added
  a `CONVENTIONS.md` section stating panel designer tables (flow **and** IF)
  iterate lasers sorted by `wavelength_nm` ascending; within-laser order
  preserved; editors keep user order.
- **`ed61ed9`** "test(panels): assert detector/filter column order by
  wavelength" — added column-order assertions to **both**
  `PanelDesignerView.test.tsx` (flow) and `IFPanelDesignerView.test.tsx` (IF).
  The flow test reorders the mock instrument so Red (637nm) precedes Blue
  (488nm) in the data, then asserts the rendered headers show 488nm before
  637nm.

### Flow panel rendering — confirmed sorted

`frontend/src/components/panels/PanelDesignerView.tsx:295-304`:
```ts
const laserGroups = useMemo(() => {
  if (!state.instrument) return []
  return [...state.instrument.lasers]
    .sort((a, b) => a.wavelength_nm - b.wavelength_nm)
    .map((laser) => ({ laser, detectors: laser.detectors, ... }))
}, [state.instrument])
```
The flow panel sorts laser groups by `wavelength_nm` ascending before
flattening into detector columns. `git log -L` shows this sort has been
present since commit `2299a5e` (the panel-designer-view extraction) — i.e.
the flow panel was **already correct** before the `c15faed` IF-only fix.
Within-laser detector order is preserved (`detectors: laser.detectors`),
matching the documented convention.

### Test run

`npx vitest run -t "detector"` → **23 passed, 0 failed**. Includes the new
`'sorts laser group headers by wavelength ascending'` test for the flow
panel and the equivalent IF panel test.

## Root cause / hypothesis

No bug. Flow panel detector columns are sorted by laser wavelength
ascending (violet → red), the IF panel was fixed in `c15faed`, the
convention is documented, and both paths have regression tests that pass.

## Reproduction

N/A — no defect.

## Proposed fix

None needed. Coverage is complete for both flow and IF panels.

## Priority

**Low** — verification only; nothing to do.
