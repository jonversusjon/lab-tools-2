import type { Editor } from '@tiptap/react'

// Recursively strips `_rowId` from a serialized node JSON tree, in place.
// RowIdExtension's `appendTransaction` mints a fresh UUID for any node whose
// `_rowId` is absent/null — but it only fills nulls, it does NOT de-duplicate.
// So every node in a duplicated subtree must have its `_rowId` removed, not
// just the top-level one: otherwise nested `_rowId`-bearing descendants
// (`listItem`, `column`, blocks inside columns) would collide with the
// originals in the save coordinator's `_rowId`-keyed diff.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function stripAllRowIds(nodeJSON: any): void {
  if (nodeJSON?.attrs && '_rowId' in nodeJSON.attrs) {
    delete nodeJSON.attrs._rowId
  }
  if (Array.isArray(nodeJSON?.content)) {
    for (const child of nodeJSON.content) {
      stripAllRowIds(child)
    }
  }
}

// Duplicates the block at `pos`, inserting the copy immediately after the
// original. `pos` is the position directly before the block node (the same
// convention BlockMenu uses for `currentNodePos`).
//
// `_rowId` is stripped recursively from the entire serialized subtree so
// RowIdExtension mints fresh UUIDs for the copy and every descendant — the
// save coordinator correlates Tiptap nodes with database rows by `_rowId`,
// so neither the copy nor any of its children may share one with the
// original.
export function duplicateBlockAtPos(editor: Editor, pos: number): void {
  const node = editor.state.doc.nodeAt(pos)
  if (!node) return
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nodeJSON: any = node.toJSON()
  stripAllRowIds(nodeJSON)
  const insertPos = pos + node.nodeSize
  editor.chain().focus().insertContentAt(insertPos, nodeJSON).run()
}
