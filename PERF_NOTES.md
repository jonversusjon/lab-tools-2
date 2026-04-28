# Performance notes

This document tracks known performance concerns and the measures
taken or deferred. Future agents working on Tiptap NodeViews should
read this before adding/modifying NodeView components.

## Cross-panel re-render isolation (Tiptap)

**Concern:** Tiptap dispatches a transaction on every keystroke. By
default, ALL React NodeViews in the editor re-render on every
transaction. Without intervention, typing one character in a panel
re-renders every other panel's chart, spillover heatmap, and spectra
viewer in the same document — a meaningful perf hit at 3+ panels.

**Mitigations in place (Phase 7c, Phase 8):**

1. NodeView root components (`FlowPanelView`, `IfPanelView`) are
   wrapped in `React.memo` with a custom comparator that compares
   `node.attrs` reference identity. Default `React.memo` shallow
   equality doesn't catch this because Tiptap creates fresh `node`
   objects per transaction.

2. Charts inside panels (`PanelSpectraByLaser`, etc.) should be
   wrapped in `React.memo` with a comparator that checks only the
   data slices the chart consumes (assigned fluorophore IDs +
   spectra refs), not the entire props object.

3. Derived data passed to charts is wrapped in `useMemo` to keep
   referential identity stable across re-renders when the underlying
   data hasn't changed.

**What we deferred (post-migration):**

- Render-count regression tests verifying isolation. The Tiptap spike
  empirically confirmed isolation is achievable; per-component memo
  is the correct mitigation. Verifying numerically in tests is a
  separate perf-correctness pass after Phase 12.

- Aggressive memoization of sub-components (target rows, picker rows,
  etc.) inside PanelDesignerView. Currently relying on the View's
  internal memoization patterns (which exist for template mode and
  carry over). If profiler shows slowness, optimize there.

- Debouncing `onChange` -> `updateAttributes` calls. Currently
  immediate per-dispatch. If many fast keystrokes in a single panel
  cause Tiptap transaction flooding, debounce 200ms.

**How to verify cross-panel isolation manually:**

1. Run `cd frontend && npm run dev`
2. Open `/tiptap-sandbox`
3. Insert two flow_panel blocks (or use the seed)
4. Open browser DevTools -> Performance -> start recording
5. Type rapidly in a paragraph between the two panels
6. Stop recording. Look at component renders by name.
7. Expected: paragraph block re-renders. Panels do NOT re-render.
8. If panels DO re-render, the memo comparator on FlowPanelView is
   not catching the change. Investigate.

## Other notes

(Add as concerns arise.)
