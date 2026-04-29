# Migration: Deferred Work

This file tracks work paused mid-migration due to external blockers
(upstream package issues, etc.) that are expected to resolve on their
own. Future agents and developers should read this before starting
new migration phases.

## Drag handle and block context menu (Phase 9b)

**Status:** DEFERRED — waiting on Tiptap upstream package coherence

**Original plan:** Phase 9b was to build a left-margin drag handle
that doubles as the entry point to a per-block context menu (Duplicate,
Delete, Convert-to, plus per-block-type items: Clear/Insert-left/
Insert-right for columns, etc.). Implementation planned via
`@tiptap/extension-drag-handle-react`.

### Why this is paused

`@tiptap/extension-drag-handle-react@3.22.5` (latest as of late
April 2026) declares a strict peer requirement on
`@tiptap/pm@3.22.5`. The rest of the Tiptap suite in this project
(and in `@tiptap/extension-drag-handle-react@3.22.5`'s peer
dependencies-of-dependencies) is pinned at `^3.22.4`. The Tiptap
suite's other extensions are not yet published at 3.22.5. The
package literally requires a peer version that hasn't been published
across the rest of the suite — `npm install` fails with `ERESOLVE`,
and `--legacy-peer-deps` would ship a tree with a missing peer that
might surface as runtime import errors.

This appears to be a recurring issue with Tiptap's monorepo release
process. Their own v3.22.4 release notes include:
> "Fix dependencies installation after packages updates producing
> peer dependency resolution conflicts"

### How to detect it's been fixed (auto-discovery for future agents)

Run this from `frontend/`:

```bash
npm install --save @tiptap/extension-drag-handle-react --dry-run 2>&1 | tail -20
```

If the output shows a clean install plan with no `ERESOLVE` errors,
the upstream issue is resolved and Phase 9b can proceed. If it still
shows `ERESOLVE` mentioning peer dependency conflicts on `@tiptap/pm`,
remain paused.

A more thorough check that confirms the entire Tiptap suite is coherent:

```bash
npm install --save \
  @tiptap/core@latest \
  @tiptap/pm@latest \
  @tiptap/react@latest \
  @tiptap/starter-kit@latest \
  @tiptap/extension-placeholder@latest \
  @tiptap/suggestion@latest \
  @tiptap/extension-table@latest \
  @tiptap/extension-drag-handle-react@latest \
  --dry-run 2>&1 | tail -20
```

If the dry-run succeeds, the entire suite can be coherently updated
and Phase 9b can proceed.

### What to do when ready to proceed with Phase 9b

1. Run the actual install (drop `--dry-run`).
2. Verify versions in `package.json` are coherent:
   ```bash
   grep -E '"@tiptap/' frontend/package.json | sort
   ```
   All Tiptap packages should be at the same patch version
   (e.g., all at `^3.22.5` or higher).
3. Run the full test suite — should still pass at 477+ tests.
4. Resume Phase 9b: build a `<DragHandle>` component using the
   package's `<DragHandle>` React component, with a hover-revealed
   menu. Per-block-type menu items defined in a registry
   (block_type → array of menu items).

### What lives in Phase 9c after 9b

Phase 9c is column drag-resize. It depends on Phase 9b's
infrastructure (drag handles between columns reuse the same
positioning library — `floating-ui/dom` per `@tiptap/extension-drag-handle-react`'s
docs). Phase 9c also depends on `frontend/src/blocks-tiptap/views/columnCommands.ts`'s
exported `COLUMN_MIN_WIDTH_PCT = 10` constant for clamping during drag.

### Alternative path if upstream stays broken

If `@tiptap/extension-drag-handle-react`'s peer-dep issue persists
for more than a few weeks, consider building a DIY drag handle as a
ProseMirror plugin. Tiptap's official examples include a worked DIY
drag-handle implementation. Cost: roughly +1 day of work compared to
the package-based approach. The work is well-trodden but adds code
volume.

The DIY approach was discussed but deferred to upstream resolution.
The trade-off is:
- DIY: more code now, no future dep risk
- Wait for upstream: less code now, accepts ongoing dep churn

Default is to wait. Switch to DIY only if:
- `npm install --save @tiptap/extension-drag-handle-react@latest`
  has been failing for >4 weeks past 2026-04-29
- A new migration milestone explicitly needs the drag handle to
  unblock something else

### What's still possible without 9b

Phase 9a (slash menu) is fully independent of the drag handle. It
uses `@tiptap/suggestion` (already installed in Phase 1) and proceeds
on schedule.

Phase 10 (backend persistence), Phase 11 (cut/paste), and Phase 12
(cleanup) are all independent of Phase 9b. They proceed without it.

The only user-facing capability missing if 9b stays deferred forever:
- No drag handle on blocks (so no drag-to-reorder via mouse — though
  the dnd-kit-based reorder inside panel target tables still works)
- No generic block context menu
- No column drag-resize

Each of these is a UX feature, not a correctness blocker. The migration
can complete (Phase 12 cleanup landing on `main`) without Phase 9b/c.
The deferred features ship as a follow-up release when upstream
stabilizes.

## Other deferred items

## Empty column visibility (UX gap)

**Status:** DEFERRED — addressed by Phase 13 (block frames feature)

When a user deletes a panel (or any other content) from inside a column,
the column itself is preserved with a default empty paragraph (per
ProseMirror's `block+` content rule). This is intentional design
choice (b) from the migration discussion — the column structure is
preserved so the user can put new content there. However, in current
rendering, the empty column is visually invisible (no border, no
placeholder, no width collapse), which can feel like a bug to users
who expected the surviving column(s) to reflow and fill the space.

The Phase 13 block-frames feature (configurable `always | empty | never`
frames per block type) is the right fix: with empty-column frames
enabled, the empty space becomes visually obvious as a placeholder ready
for new content. Until then, this is a known visual gap.

To work around manually: select the empty column and use undo (Ctrl+Z)
if the deletion was recent, or use the (eventual) column drag-handle
context menu (Phase 9b) to delete the column explicitly.

## Hand-rolled engine save mechanisms (Phase 12 cleanup target)

The hand-rolled engine has two parallel save patterns that the new
save coordinator (Phase 10b) replaces:

- **Structural ops** in `BlockRenderer.tsx`: direct `await` calls to
  `@/api/experiments.ts` functions (createBlock, updateBlock,
  deleteBlock, reorderBlocks, snapshotPanel) followed by manual
  `qc.invalidateQueries(['experiments', experimentId])`.
- **Content edits** in 4+ child components (`TextBlockEditor`,
  `CalloutBlock`, `TableBlock`, `FlowPanelBlock`, `IFPanelBlock`):
  inline `fetch('/api/v1/experiments/...')` calls with 1500ms
  debounce, `keepalive: true` on unmount, errors silently swallowed.

Phase 12 cleanup deletes both patterns when removing the hand-rolled
engine. The TanStack Query mutation hooks in
`useExperimentBlocks.ts` (currently dead code) become the canonical
API surface, used internally by Phase 10b's save coordinator.

The `_rowId` attribute added in Phase 10a is what enables this
replacement: Phase 10b's transaction inspector identifies which
database rows to save by reading `_rowId` from each Tiptap node.
