Overnight-1 — completed

Pre-flight: pass (clean status, fresh index, tsc clean, vitest 514 passing; start commit aed6809)

=== Section A: Diagnostics ===
A1 flow-panel-blank:       root-cause-found — no flush-on-unmount; SPA navigate-away within the 1500ms debounce window silently discards unsaved edits (beforeunload doesn't fire on SPA nav). A1c repro confirmed edit loss. Literal "blank render" not reproduced — panel block itself always reappears from the server-side snapshot.
A2 placeholder-cursor:     hypothesis-only — caret-color is fine (visible dark color); prime suspect is `float: left` on the placeholder `::before` (index.css) obscuring the caret in empty blocks. Prior `caret-color: currentColor` rule is a no-op. Needs visual confirmation in a browser.
A3 detector-ordering:      verified-complete — flow panel (PanelDesignerView.tsx:295-304) already sorts laser groups by wavelength ascending; IF panel fixed in c15faed; both have passing column-order tests (23 detector tests green). No code changes needed.
A4 duplicate-completeness: spec-issue — flow/if panels + leaf blocks (paragraph/heading/table) duplicate correctly with fresh _rowId. BUG found: nested blocks (lists, column_lists) keep child _rowId collisions because handleDuplicate strips only the top-level _rowId. flow_panel test added + passes + committed.

=== Section B: Implementations ===
B1 change-to-current-type: committed 7073f92 — "Change from <Type>" trigger label + current type shown disabled (opacity-50 cursor-not-allowed) in the submenu. +1 test.
B2 duplicate-shortcut:     committed e5784e3 — extracted duplicateBlockAtPos util, added DuplicateShortcut extension (Mod-Shift-D, no conflicts), registered in extensions.ts, BlockMenu refactored to call the util. +2 tests. Note: the util faithfully extracts existing behavior (top-level _rowId strip only) — the recursive-strip fix from A4 is deliberately NOT bundled here (out of B2 scope; tracked in A4 report).

=== Section C: Housekeeping ===
C1 vitest:    518 passing (was 514; +1 A4, +1 B1, +2 B2)
C2 tsc:       pass (clean)
C3 E2E:       FAIL — 17 passed, 3 failed (paste.spec 4.1, paste.spec 4.2, sandbox-create 6.1). All 3 cluster on /tiptap-sandbox: the sandbox auto-creates the experiment row but renders with EMPTY seed content (no blocks). VERIFIED PRE-EXISTING: the same 3 specs fail identically at the pre-phase commit aed6809. Not a regression from B1/B2.
C4 push:      HELD BACK — C3 did not pass. Per the phase's forbidden-patterns rule ("Pushing to origin if any test failed during the phase") the push is held even though the 3 failures are confirmed pre-existing. Commits are safe locally; push after morning review.

=== Final state ===
Branch: main
HEAD: e5784e3
Local commits ahead of origin: 12 (9 pre-existing + 3 from this phase: f388a25 A4, 7073f92 B1, e5784e3 B2)
Diagnostic reports written to plans/diagnostics/:
- A1-flow-panel-blank.md
- A2-placeholder-cursor.md
- A3-detector-ordering.md
- A4-duplicate-completeness.md
- OVERNIGHT-1-SUMMARY.md

=== Morning priorities ===
1. HIGH — A1: silent data loss on SPA navigate-away. Add flush-on-unmount and/or a React Router navigation guard to useSaveCoordinator. Draft fix prompt in A1-flow-panel-blank.md.
2. HIGH — C3 pre-existing E2E break: /tiptap-sandbox seeds an empty document. paste + sandbox-topology e2e tests have been red since at least aed6809. Investigate the sandbox auto-create seed path. Then decide whether to push the 3 held commits (they are independently green: vitest 518 + tsc clean).
3. MEDIUM — A4: handleDuplicate / duplicateBlockAtPos strips only the top-level _rowId; lists and column_lists produce duplicates whose descendants collide with the originals in the save coordinator. Fix recursively in duplicateBlockAtPos.
4. MEDIUM — A2: replace `float: left` placeholder CSS with an absolutely-positioned placeholder so the caret is visible in empty blocks; verify visually.

=== C3 Resolution ===
Fixed in Fix-C3 (2 commits). All 4 pre-existing E2E failures now pass; E2E
suite green at 21/21. vitest unchanged at 520, tsc clean.

Section A — sandbox seed (TiptapSandbox.tsx):
- Root cause confirmed: audit cleanup A7 (3631dc1) removed the
  empty-blocks → INITIAL_CONTENT routing from the initialEditorContent
  memo, so a fresh sandbox loaded rowsToTiptapDoc([]) (an empty doc) and
  never seeded.
- Fix: restore the empty-blocks branch — when the experiment has no
  blocks, the editor starts from INITIAL_CONTENT against the save
  coordinator's empty baseline, so the first transaction persists every
  block through the normal save path (the observable dirty→saved cycle
  the paste/topology specs depend on). Subsequent loads have blocks and
  route through rowsToTiptapDoc as before — idempotent.
- A trailing empty paragraph is appended to the INITIAL_CONTENT doc in
  the memo (not the constant) to mirror rowsToTiptapDoc's output:
  tiptapDocToRows skips it, so it is never persisted and edits at the doc
  end land on fresh nodes instead of mutating a seeded block (this was
  the stray PUT that failed paste 4.2).
- The plan's createBlock-API seeding approach was tried first and
  rejected: API writes bypass the save coordinator, so no dirty→saved
  cycle is produced and paste 4.2 / sandbox-create 6.1 (which cannot be
  modified — out of scope) fail.
- Commit: 007e913

Section B — drag-handle-panel.spec.ts:
- The "Sandbox (panels in columns)" test hardcoded experiment ID
  2459272d-… which is not present in local DBs. Replaced with an
  API-created experiment (column_list → 2 columns → flow_panel /
  if_panel) in the test body, torn down via a describe-level afterEach.
  The FDA1 and cK009 tests are untouched.
- Commit: 95a49ed

=== Project knowledge re-upload manifest ===
REUPLOAD_REQUIRED:
- plans/diagnostics/OVERNIGHT-1-SUMMARY.md
- plans/diagnostics/A1-flow-panel-blank.md
- plans/diagnostics/A2-placeholder-cursor.md
- plans/diagnostics/A3-detector-ordering.md
- plans/diagnostics/A4-duplicate-completeness.md

REUPLOAD_NOT_NEEDED: source-only B1/B2 commits auto-tracked in CODEBASE_INDEX.md
