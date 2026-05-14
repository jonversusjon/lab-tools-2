import type { Editor } from '@tiptap/react'

// Duplicates the block at `pos`, inserting the copy immediately after the
// original. `pos` is the position directly before the block node (the same
// convention BlockMenu uses for `currentNodePos`).
//
// The copy's top-level `_rowId` is stripped so RowIdExtension mints a fresh
// UUID — the save coordinator correlates Tiptap nodes with database rows by
// `_rowId`, so the copy must not share one with the original.
//
// Known limitation (see plans/diagnostics/A4-duplicate-completeness.md):
// only the top-level `_rowId` is stripped. Blocks with `_rowId`-bearing
// descendants (lists, column_lists) still produce a copy whose descendants
// share `_rowId`s with the original. Fixing that recursively is tracked
// separately.
export function duplicateBlockAtPos(editor: Editor, pos: number): void {
  const node = editor.state.doc.nodeAt(pos)
  if (!node) return
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nodeJSON: any = node.toJSON()
  if (nodeJSON.attrs) {
    delete nodeJSON.attrs._rowId
  }
  const insertPos = pos + node.nodeSize
  editor.chain().focus().insertContentAt(insertPos, nodeJSON).run()
}
