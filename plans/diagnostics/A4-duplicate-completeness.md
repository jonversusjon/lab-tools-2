# Diagnostic — Phase 9b Duplicate completeness

**Date:** 2026-05-14
**Status:** spec-issue (flow/if panels + leaf blocks OK; nested blocks have a `_rowId` collision bug)

## Problem statement

> Duplicate in context menu — does Phase 9b's implementation duplicate
> "with all current values and properties"?

## Investigation

Read `blocks-tiptap/dragHandle/BlockMenu.tsx` (`handleDuplicate`, lines
113-124) and `blocks-tiptap/nodes/rowIdExtension.ts`.

```ts
function handleDuplicate() {
  if (currentNode === null) return
  const nodeJSON: any = currentNode.toJSON()
  if (nodeJSON.attrs) { delete nodeJSON.attrs._rowId }   // top-level only
  const insertPos = currentNodePos + currentNode.nodeSize
  editor.chain().focus().insertContentAt(insertPos, nodeJSON).run()
  closeMenu()
}
```

`currentNode.toJSON()` is a **deep** serialization — it includes every attr
and the full child subtree. So content is genuinely deep-copied. The only
post-processing is `delete nodeJSON.attrs._rowId` on the **top-level node
only**.

`RowIdExtension`'s `appendTransaction` mints a fresh UUID for any node whose
`_rowId` is `null` — but it **does not detect or fix duplicate `_rowId`s**.
It only fills in nulls.

### Per-block-type assessment

| Block type | Deep-copies content? | Fresh `_rowId`? | Verdict |
|---|---|---|---|
| paragraph / heading | yes (text in `content`) | yes — top-level stripped, re-minted | **OK** |
| flow_panel / if_panel | yes — `atom`, all content is in attrs, fully copied | yes — top-level stripped, re-minted; atoms have no `_rowId`-bearing children | **OK** |
| table | yes | yes — `table` top-level stripped; `tableRow/Header/Cell` are synthetic (never get `_rowId`s) | **OK** |
| bulletList / orderedList | yes | **NO** — the list wrapper is synthetic (no `_rowId`), but its `listItem` children keep their **original** `_rowId`s; only the top-level attr is stripped | **BUG** |
| column_list / column | yes | **NO** — child `column`s and their block descendants keep original `_rowId`s | **BUG** |

### The bug

`handleDuplicate` strips only the top-level node's `_rowId`. For any block
whose subtree contains other `_rowId`-bearing nodes (`listItem`, `column`,
nested blocks inside columns), the duplicated descendants **share `_rowId`
values with the originals**. `RowIdExtension` won't fix this because the
values are non-null. Two nodes with the same `_rowId` will collide in the
save coordinator's `inspectTransaction` diff (`baseline` vs `current`
correlation is keyed on `_rowId`), producing wrong creates/updates/deletes.

This contrasts with the paste path, which uses `stripRowIdsFromSlice` via
`transformPasted` to recursively strip every `_rowId` — `insertContentAt`
from Duplicate does **not** go through `transformPasted`.

## Test added

Added to `frontend/src/blocks-tiptap/__tests__/dragHandle.test.tsx`:
`'Duplicate deep-copies flow_panel content and assigns a fresh _rowId'` —
creates a flow_panel with populated `targets`, `assignments`, and tweaked
`volume_params`, duplicates it, and asserts both blocks are flow_panels in
document order, the content attrs are deep-equal, and the two `_rowId`s are
distinct and non-empty. **This test passes** against the current
implementation (flow_panel is a leaf atom, so the top-level-only strip is
sufficient). Committed.

A test for the nested-block bug was deliberately **not** committed (the
prompt says only commit a passing test).

## Reproduction

Duplicate a bulleted list (≥1 item) or a column_list on an experiment page,
then edit either copy — the save coordinator will mis-correlate the rows
because the `listItem`/`column` `_rowId`s are shared between original and
copy.

## Proposed fix

> In `frontend/src/blocks-tiptap/dragHandle/BlockMenu.tsx`, `handleDuplicate`
> only strips `_rowId` from the top-level node, so duplicating a list or
> column_list yields children that share `_rowId`s with the originals and
> collide in the save coordinator. Fix it to strip `_rowId` **recursively**
> from the serialized JSON before insert — reuse the existing recursive
> stripper logic (see `blocks-tiptap/paste/stripRowIdsFromSlice` /
> `transformPasted`) or write a small recursive walk over `nodeJSON.content`.
> Then add a vitest test in `dragHandle.test.tsx`: duplicate a bulletList
> with two items, assert every `listItem` in the document (original + copy)
> has a distinct `_rowId`. This will also become part of B2's
> `duplicateBlockAtPos` utility — fix it there once and have both the menu
> and the keyboard shortcut call it.

## Priority

**Medium-high** — flow/if panels (the headline use case) duplicate
correctly, so the reported question gets a "yes" for panels. But the
nested-block `_rowId` collision is a real latent data-integrity bug for
lists and columns. Should be fixed as part of B2's utility extraction.

## Resolution

**Fixed in commit `<pending>` (Fix-A4).**

`duplicateBlockAtPos` (`blocks-tiptap/dragHandle/duplicateBlock.ts`) now
strips `_rowId` **recursively** from the serialized node JSON before
insertion, via a new in-module `stripAllRowIds` helper that walks
`nodeJSON.content` depth-first. RowIdExtension then mints fresh UUIDs for
the copy and every `_rowId`-bearing descendant (`listItem`, `column`,
nested blocks), so no node in the duplicate collides with the original in
the save coordinator's diff.

The recursive stripper was kept inline rather than shared with the paste
path: `stripRowIdsFromSlice` operates on ProseMirror `Slice` objects, not
plain JSON, so there was no JSON-shaped utility to reuse without
refactoring the paste path (out of scope).

Coverage added to `blocks-tiptap/__tests__/dragHandle.test.tsx`: duplicate
a bulletList with 2 items → 4 distinct `listItem` `_rowId`s; duplicate a
column_list with 2 columns → every `_rowId` in the tree unique. Both pass.
