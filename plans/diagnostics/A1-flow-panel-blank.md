# Diagnostic — Flow panel blank on navigate-away

**Date:** 2026-05-14
**Status:** root-cause-found (data-loss mechanism); literal "blank render" symptom not reproduced

## Problem statement

> Created new experiment with flow panel, filled out several things on the
> flow panel, navigated away and back, now the flow panel is blank, but
> using the browser refresh button correctly loads the panel with the data
> that was entered.

## Investigation

Read in order: `ExperimentPage.tsx`, `saveCoordinator.ts`, `FlowPanelView.tsx`,
`useExperiments.ts`, `useExperimentBlocks.ts`, plus `api/experiments.ts`,
`adapter/dbToTiptap.ts`, `adapter/tiptapToDb.ts`, `nodes/flowPanel.ts`.

Wrote a Playwright reproduction harness (`tests/e2e/a1-flow-panel-blank.spec.ts`,
since deleted — diagnostics make no source changes) with three cases, run
against a live backend:

- **A1a** — open experiment with a snapshotted flow panel, SPA-navigate to
  `/experiments` and back, no edits. → Panel **still visible**. Not reproduced.
- **A1b** — edit the document, wait for the save indicator to reach "saved",
  then navigate away and back. → Panel **still visible**, edit persisted.
  Not reproduced.
- **A1c** — edit the document, then SPA-navigate away **immediately** (within
  the 1500ms debounce window), wait, navigate back. → Panel visible, but the
  **edit was lost** (`survived=false`).

### Key findings

1. `ExperimentPage` does not use TanStack Query for the experiment fetch — it
   calls `getExperiment(id)` directly into local `useState`. Every mount
   (SPA-nav or full reload) refetches fresh server data. There is no stale
   cache path; SPA-nav-back and browser-reload fetch identically.

2. `useSaveCoordinator` debounces saves by **1500ms** (`debounceMs = 1500`).
   Every editor transaction reschedules the debounce.

3. The unmount cleanup (`saveCoordinator.ts:349-355`) **clears the debounce
   timer without flushing**:
   ```ts
   useEffect(() => {
     return () => {
       if (debounceTimerRef.current != null) clearTimeout(debounceTimerRef.current)
     }
   }, [])
   ```

4. The only safety net is the `beforeunload` guard (`saveCoordinator.ts:361-377`),
   which fires the browser "unsaved changes" prompt — but `beforeunload` does
   **not** fire on React Router SPA navigation, and the comment explicitly
   notes it "does NOT actually flush." There is **no React Router navigation
   guard and no flush-on-unmount.**

## Root cause / hypothesis

**Confirmed data-loss mechanism:** edits made within the 1500ms debounce
window are silently discarded when the user SPA-navigates away. The component
unmounts, the cleanup effect cancels the pending debounce, and nothing
flushes. `beforeunload` cannot help — it does not fire on SPA navigation.

**Mapping to the reported "blank" symptom (hypothesis):** the flow panel
*block itself* is created by `snapshot-panel`, which persists server-side
immediately — so the panel frame always reappears. What the user calls
"filled out several things" are edits to the flow_panel node's `attrs`
(name, instrument, targets, assignments) routed through the same debounced
save. If the user finished editing and navigated away in under 1500ms, that
entire batch of attr edits is lost. On navigate-back the panel renders from
the *snapshot baseline* — empty targets/assignments — i.e. it looks "blank."

The "browser refresh shows the data" half of the report could not be
reproduced and does not fit a pure data-loss model (if the data never
reached the server, no reload would show it). Most likely the user's two
observations were from different moments — one where the debounce *had*
flushed before leaving, one where it had not. A pure client-side render
bug (server has data, SPA-nav renders blank, reload renders it) was
**searched for and not found**: A1a/A1b show the panel rendering correctly
from fresh server data on SPA-nav-back.

## Reproduction

A1c reproduces the data loss reliably:
1. Open an experiment containing a flow panel.
2. Make any editor edit.
3. SPA-navigate to `/experiments` within ~1.5s (before the save indicator
   reaches "saved").
4. Navigate back — the edit is gone.

## Proposed fix

Flush pending work on unmount, and/or add a React Router navigation guard.
Draft prompt for the morning:

> In `frontend/src/blocks-tiptap/save/saveCoordinator.ts`, the unmount
> cleanup at lines 349-355 cancels the debounce timer without flushing,
> so edits made within the 1500ms debounce window are lost when the user
> SPA-navigates away from an ExperimentPage. Fix it so pending changes are
> not lost:
> 1. In the unmount cleanup effect, if `debounceTimerRef.current != null`
>    (or `hasUnsynced()` is true), call `flush()` synchronously-ish before
>    clearing — note `flush()` is async and the component is unmounting, so
>    the mutations must be allowed to complete detached from the component
>    (they already are: the mutation functions don't touch component state
>    on the `noop` path; verify `setStatus`/`setPendingCount` calls inside
>    `flush` are guarded against post-unmount execution, or skip them).
> 2. Additionally, expose a `flushNow()` from `useSaveCoordinator` and have
>    `ExperimentPage` call it from a React Router `useBlocker` or a cleanup
>    effect keyed on `id`, so navigation between experiments also flushes.
> Add an e2e test mirroring the A1c case in this diagnostic: edit, navigate
> away immediately, navigate back, assert the edit survived.

Caution: `flush()` reads/writes component-scoped refs and calls `setState`.
A post-unmount `setState` warning is harmless in React 18 but the cleaner
fix is to make the mutation calls fire-and-forget on unmount and skip the
status `setState`s when unmounting.

## Priority

**High** — silent, unrecoverable data loss on a normal user action
(navigating between pages). No error shown to the user.

## Resolution

**Fixed in commit `724cd61` (Fix-A1).**

`useSaveCoordinator`'s unmount cleanup now flushes pending edits instead
of only cancelling the debounce timer:

1. Added `isUnmountingRef` plus `setStatusSafe` / `setPendingCountSafe` /
   `setLastErrorSafe` wrappers so the detached flush cannot `setState` on
   the dead component.
2. Exposed a referentially-stable `flushNow()` from the hook (reads the
   latest `flush` through a ref; never throws — fire-and-forget).
3. The `[]` unmount-cleanup effect sets `isUnmountingRef = true`, clears
   the debounce timer, and calls `flushNow()` when `hasUnsynced()` is
   true. The effect body resets `isUnmountingRef = false` on (re)mount —
   required because StrictMode runs mount→unmount→mount on the same
   instance and would otherwise leave the flag stuck `true`, silently
   disabling the save indicator.
4. `ExperimentPage` and `TiptapSandbox` each gained an `id`-keyed cleanup
   effect calling `flushNow()`, covering experiment-switch-without-unmount.

E2E coverage: `tests/e2e/save-coordinator-flush.spec.ts` mirrors A1c —
edit, SPA-navigate away within the debounce window, navigate back, assert
the edit survived. Passes.
