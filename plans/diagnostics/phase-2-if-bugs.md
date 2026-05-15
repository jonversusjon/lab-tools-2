# Phase 2 — IF panel bug diagnoses

Investigation conducted by reading code at commit `7412995`, plus inspecting
the live `panels.db` (DAPI dye-label and ImageXpress microscope rows).

## #2 — Secondary efficiency scores

**Suspected root cause:** Could NOT be definitively pinpointed from code
reading. The data-flow appears correct end-to-end:

- `IFPanelDesigner.tsx:onSelectSecondary` (lines 224–237) updates the
  target with `secondary_antibody_id`/`staining_mode='indirect'`, then
  if the secondary has a `fluorophore_id`, calls
  `handleAssignFluorophore(antibody_id, sec.fluorophore_id)`.
- `handleAssignFluorophore` (lines 66–114) creates the assignment with
  `fluorophore_id = sec.fluorophore_id`.
- `IFPanelDesignerView.tsx:760, 777` reads `assignment.fluorophore_id`
  for Ex %/Det % lookup.

Per CLAUDE.md "Indirect staining PanelAssignment" rule, the assignment
SHOULD store the secondary's fluorophore_id (copy, not reference) — and
the code does this.

**Possible mechanisms still uninvestigated:**

1. Backend `get_microscope_fluorophore_compatibility` filters out
   fluorophore/filter combinations below `min_excitation_pct` (default 5%)
   AND `min_detection_pct` (default 10%). For an indirect staining
   scenario where the secondary's fluorophore is not strongly excitable
   on any of the user's lasers, the combination won't appear in
   `compatibilityData`, and the lookup at View.tsx:763 returns no match
   → "—" displayed for both Ex and Det. The user could perceive this as
   "skipped" / "no scoring".
2. A timing/closure issue where `state.assignments` snapshot used by
   `handleAssignFluorophore` is stale (the effect closure captures
   `state.assignments` at function-creation time) — could lead to
   double-add or wrong assignment_id for indirect targets.

**Location:** Likely `IFPanelDesigner.tsx:onSelectSecondary` or backend
threshold filtering at `microscopes.py:359, 377`.

**Fix approach:** Requires live reproduction in the running app to
distinguish (1) from (2). I cannot fix this confidently from code
reading alone.

---

## #3 — Secondary swap clears channel

**Root cause:** `IFPanelDesigner.tsx:handleAssignFluorophore` (lines 66–114)
unconditionally creates the new assignment with `filter_id: null`
(line 82, line 103). When `onSelectSecondary` (line 233–236) auto-assigns
a new secondary's fluorophore on top of an existing assignment, the
existing-assignment branch (line 86–94) removes the prior assignment
(which may have a `filter_id` set), and the subsequent ADD goes through
`addAssignmentMutation` with no filter_id. Consequently the channel
selection is lost on every secondary change.

**Location:** `frontend/src/components/if-panels/IFPanelDesigner.tsx:75–84`
(optimistic assignment construction omits `filter_id`) and `:99–105`
(POST data omits `filter_id`).

**Fix approach:** When an existing assignment is being replaced because
of a fluorophore change (i.e. user picked a new secondary or new direct
fluorophore), preserve the existing `filter_id` in both the optimistic
assignment and the POST payload. The cleanest path is to thread the
existing `filter_id` through `handleAssignFluorophore` (read it from the
existing assignment found inside the function — line 71). If no existing
assignment exists, `filter_id` stays null.

This is a localized, frontend-only change, no new backend endpoint
needed.

---

## #4 — DAPI yields empty channel selector

**Suspected root cause:** Could NOT be definitively pinpointed from code
reading. Investigation findings:

- DAPI is seeded as a `dye_label` (`main.py:443`) with
  `fluorophore_id` populated by case-insensitive name match against the
  `fluorophores` table (`main.py:474–485`). Live DB confirms
  `dye_labels.DAPI.fluorophore_id = 'dapi-default'`.
- DAPI's fluorophore `'dapi-default'` exists with `ex_max_nm=359`,
  `em_max_nm=461`, and 134 EX spectra rows (range 300–433 nm).
- When DAPI is added as a target via the `dye_label` path,
  `IFPanelDesigner.tsx:onAddTarget:177–179` auto-calls
  `handleAssignDyeLabelFluorophore` to create an assignment with
  `fluorophore_id = 'dapi-default'`, `filter_id: null`.
- The channel cell at `IFPanelDesignerView.tsx:722–755` shows a
  `<select>` listing ALL of `state.microscope.lasers[*].filters[*]` —
  there is NO compatibility filtering applied to the dropdown options.
- For ImageXpress (the only seeded microscope in the live DB) with a
  377 nm laser + 447/60 filter, DAPI's excitation at 377 nm is 80% of
  peak (well above the 5% threshold), and the 447/60 filter covers
  DAPI's 461 nm emission peak.

**So:** The dropdown SHOULD render with all of ImageXpress's
filters (5 of them) listed. The Ex %/Det % SHOULD compute and display.

**Possible mechanisms still uninvestigated:**

1. Maybe the bug only manifests on a specific microscope shape (UV
   lamp + DAPI cube) not present in the live DB.
2. Maybe the auto-assignment path skips DAPI for some unknown reason
   (e.g., the dye_label data fetched by `useDyeLabels` is missing
   `fluorophore_id` due to a stale TanStack cache or the API serializer).
3. Maybe the user is referring to the IFFluorophorePicker (which is for
   picking a fluorophore to ASSIGN to an antibody-typed target, not a
   dye-label target) showing an empty result for some DAPI-related
   workflow I haven't reproduced.

**Location:** Unknown without live reproduction.

**Fix approach:** I cannot fix this confidently from code reading alone.
Need a live reproduction of the user's exact steps to identify which UI
element the user means by "channel selector" and what condition triggers
the empty state.

---

## #6 — Empty channel box without microscope

**Root cause:** Currently there IS a guard at
`IFPanelDesignerView.tsx:723–725` that shows
"Select a microscope above" italic in the per-row Channel cell when
`!state.microscope`. This was added by a previous fix
(commit `db15d7e`). However, per the user's spec, the affordance is
not strong/visible enough — they want an explicit, prominent prompt
(possibly with a button/link that focuses the microscope picker).

**Location:** `IFPanelDesignerView.tsx:723–725` (per-row cell hint) and
`:461–481` (microscope selector).

**Fix approach:** Add an above-table banner/callout when
`showSpectral && !state.microscope` that explicitly tells the user
"Select a microscope to enable channel assignment" and includes a
button that scrolls/focuses the microscope `<select>`. Keep the per-row
hint as a quieter fallback or replace it with a single column-spanning
row, depending on what reads cleanly.

Localized frontend change. Does NOT require new state or endpoints.

---

## Summary

| Bug | Diagnosis confidence | Can fix in this phase? |
|---|---|---|
| #2 | LOW — multiple possible mechanisms, code path looks correct | NO — needs live repro |
| #3 | HIGH — root cause identified at IFPanelDesigner.tsx:82,103 | YES |
| #4 | LOW — code path looks correct given live DB state | NO — needs live repro |
| #6 | HIGH — current fix exists but is too quiet | YES (strengthen affordance) |

Per the phase prompt's STOP-during-diagnosis condition, surfacing this
to the PM rather than guessing at #2 and #4.
