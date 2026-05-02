import { Fragment, Node, Slice } from '@tiptap/pm/model'

/**
 * Strip `_rowId` from every node in a pasted slice. Called by Tiptap's
 * `editorProps.transformPasted` before the slice lands in the editor.
 *
 * Why: pasted nodes carry `_rowId`s that reference DB rows in the SOURCE
 * experiment. Dropping them lets the RowIdExtension auto-populate plugin
 * assign fresh UUIDs, which the save coordinator treats as new creates
 * rather than ghost updates on foreign rows.
 */
export function stripRowIdsFromSlice(slice: Slice): Slice {
  const stripped = stripFragmentRowIds(slice.content)
  return new Slice(stripped, slice.openStart, slice.openEnd)
}

function stripFragmentRowIds(fragment: Fragment): Fragment {
  const newNodes: Node[] = []
  fragment.forEach((node) => {
    if (node.isText) {
      newNodes.push(node)
      return
    }
    const newContent = stripFragmentRowIds(node.content)
    const newAttrs = { ...node.attrs }
    delete newAttrs['_rowId']
    newNodes.push(node.type.create(newAttrs, newContent, node.marks))
  })
  return Fragment.fromArray(newNodes)
}
