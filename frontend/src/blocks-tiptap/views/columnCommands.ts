/**
 * columnCommands.ts — Low-level column manipulation commands.
 *
 * ## Position Math
 *
 * All commands receive absolute ProseMirror positions. The "position of a node"
 * is the position BEFORE its open token — the value doc.descendants() passes as
 * its second argument, and the same value doc.nodeAt(pos) expects.
 *
 * Given `columnPos` (position before a column node):
 *
 *   const $col            = doc.resolve(columnPos)
 *   // $col is between siblings inside column_list's content.
 *   // $col.parent         = the column_list node
 *   // $col.start($col.depth) = absolute start of column_list's content area
 *   //                          (position after column_list's open token)
 *   const columnListPos   = $col.start($col.depth) - 1
 *   const columnListNode  = $col.parent
 *
 * To enumerate sibling columns with their absolute positions:
 *
 *   columnListNode.forEach((child, offset) => {
 *     // offset is relative to column_list's content start
 *     // absolute position = columnListPos + 1 + offset
 *   })
 *
 * This approach works for both top-level and nested column_lists because
 * $col.depth correctly reflects the nesting depth, and $col.start() adapts.
 */

import type { Editor } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'

export const COLUMN_MIN_WIDTH_PCT = 10

/**
 * Redistributes widths after removing one column. Each remaining column
 * receives its proportional share of the total (so the sum stays ~100).
 *
 * Edge case: if the sum is 0 (all nulls converted to 0), distribute evenly.
 */
export function redistributeAfterRemoval(remainingWidths: number[]): number[] {
  const sum = remainingWidths.reduce((a, b) => a + b, 0)
  if (sum === 0) {
    return remainingWidths.map(() => 100 / remainingWidths.length)
  }
  return remainingWidths.map((w) => (w / sum) * 100)
}

/** Replaces the column's content with a single empty paragraph. */
export function clearColumn(editor: Editor, columnPos: number): void {
  const { state } = editor
  const { doc, schema } = state
  const columnNode = doc.nodeAt(columnPos)
  if (!columnNode || columnNode.type.name !== 'column') return

  const emptyParagraph = schema.nodes['paragraph'].create()
  editor.chain().command(({ tr }) => {
    tr.replaceWith(columnPos + 1, columnPos + columnNode.nodeSize - 1, emptyParagraph)
    return true
  }).run()
}

/**
 * Removes the column from its parent column_list.
 *
 * Width redistribution formula for N >= 3 survivors:
 *   new_width[j] = old_width[j] / sum(old_widths) * 100
 *   (null widths treated as 0 for proportional math; redistributeAfterRemoval
 *    handles the all-zero edge case with even distribution)
 *
 * Edge cases:
 *   - N = 2 (second-to-last deleted): collapse column_list — replace it with
 *     the surviving column's children as direct doc siblings.
 *   - N = 1 (only column deleted): remove the column_list entirely.
 */
export function deleteColumn(editor: Editor, columnPos: number): void {
  const { state } = editor
  const { doc, schema } = state

  const $col = doc.resolve(columnPos)
  const columnListNode = $col.parent
  const columnListPos = $col.start($col.depth) - 1

  if (!columnListNode || columnListNode.type.name !== 'column_list') return

  const siblings: Array<{ pos: number; node: PMNode }> = []
  columnListNode.forEach((child: PMNode, offset: number) => {
    siblings.push({ pos: columnListPos + 1 + offset, node: child })
  })

  const deleteIndex = siblings.findIndex((s) => s.pos === columnPos)
  if (deleteIndex === -1) return

  const N = siblings.length

  if (N === 1) {
    editor.chain().command(({ tr }) => {
      tr.delete(columnListPos, columnListPos + columnListNode.nodeSize)
      return true
    }).run()
    return
  }

  if (N === 2) {
    const survivingIndex = deleteIndex === 0 ? 1 : 0
    const survivingColumn = siblings[survivingIndex].node
    const survivingContent: PMNode[] = []
    survivingColumn.forEach((child: PMNode) => survivingContent.push(child))
    if (survivingContent.length === 0) {
      survivingContent.push(schema.nodes['paragraph'].create())
    }

    editor.chain().command(({ tr }) => {
      tr.replaceWith(
        columnListPos,
        columnListPos + columnListNode.nodeSize,
        survivingContent
      )
      return true
    }).run()
    return
  }

  // N >= 3: redistribute widths among survivors
  const survivors = siblings.filter((_, i) => i !== deleteIndex)
  const widthsForRedist = survivors.map(
    (s) => (s.node.attrs['width_pct'] as number | null) ?? 0
  )
  const newWidths = redistributeAfterRemoval(widthsForRedist)

  const newColumns = survivors.map((s, i) =>
    s.node.type.create({ ...s.node.attrs, width_pct: newWidths[i] }, s.node.content)
  )

  editor.chain().command(({ tr }) => {
    tr.replaceWith(
      columnListPos + 1,
      columnListPos + columnListNode.nodeSize - 1,
      newColumns
    )
    return true
  }).run()
}

/**
 * Inserts a new empty column adjacent to the column at columnPos.
 * Each existing column's width scales by N/(N+1); new column gets 100/(N+1).
 */
export function insertColumnAdjacent(
  editor: Editor,
  columnPos: number,
  side: 'left' | 'right',
): void {
  const { state } = editor
  const { doc, schema } = state

  const $col = doc.resolve(columnPos)
  const columnListNode = $col.parent
  const columnListPos = $col.start($col.depth) - 1

  if (!columnListNode || columnListNode.type.name !== 'column_list') return

  const siblings: Array<{ pos: number; node: PMNode }> = []
  columnListNode.forEach((child: PMNode, offset: number) => {
    siblings.push({ pos: columnListPos + 1 + offset, node: child })
  })

  const N = siblings.length
  const targetIndex = siblings.findIndex((s) => s.pos === columnPos)
  if (targetIndex === -1) return

  const insertIndex = side === 'right' ? targetIndex + 1 : targetIndex
  const newColumnWidth = 100 / (N + 1)

  const emptyParagraph = schema.nodes['paragraph'].create()
  const newColumnNode = schema.nodes['column'].create(
    { width_pct: newColumnWidth },
    emptyParagraph
  )

  const newColumns: PMNode[] = []
  for (let i = 0; i <= N; i++) {
    if (i === insertIndex) {
      newColumns.push(newColumnNode)
    }
    if (i < N) {
      const s = siblings[i]
      const oldWidth = (s.node.attrs['width_pct'] as number | null) ?? (100 / N)
      newColumns.push(
        s.node.type.create(
          { ...s.node.attrs, width_pct: oldWidth * N / (N + 1) },
          s.node.content
        )
      )
    }
  }

  editor.chain().command(({ tr }) => {
    tr.replaceWith(
      columnListPos + 1,
      columnListPos + columnListNode.nodeSize - 1,
      newColumns
    )
    return true
  }).run()
}

/**
 * Reshapes a column_list to have exactly `count` columns.
 * Grows by appending empty columns on the right; shrinks by removing from the right.
 * Resets all column widths to 100/count (even distribution).
 * If count < 1, no-op.
 */
export function setColumnsCount(
  editor: Editor,
  columnListPos: number,
  count: number,
): void {
  if (count < 1) return

  const { state } = editor
  const { doc, schema } = state
  const columnListNode = doc.nodeAt(columnListPos)
  if (!columnListNode || columnListNode.type.name !== 'column_list') return

  const widthPct = 100 / count
  const existingColumns: PMNode[] = []
  columnListNode.forEach((child: PMNode) => existingColumns.push(child))

  const newColumns: PMNode[] = []
  for (let i = 0; i < count; i++) {
    if (i < existingColumns.length) {
      newColumns.push(
        existingColumns[i].type.create(
          { ...existingColumns[i].attrs, width_pct: widthPct },
          existingColumns[i].content
        )
      )
    } else {
      const emptyParagraph = schema.nodes['paragraph'].create()
      newColumns.push(schema.nodes['column'].create({ width_pct: widthPct }, emptyParagraph))
    }
  }

  editor.chain().command(({ tr }) => {
    tr.replaceWith(
      columnListPos + 1,
      columnListPos + columnListNode.nodeSize - 1,
      newColumns
    )
    tr.setNodeMarkup(columnListPos, null, {
      ...columnListNode.attrs,
      column_count: count,
    })
    return true
  }).run()
}

/** Sets all sibling columns to width_pct = 100/N where N is the current column count. */
export function rescaleColumnsEvenly(
  editor: Editor,
  columnListPos: number,
): void {
  const { doc } = editor.state
  const columnListNode = doc.nodeAt(columnListPos)
  if (!columnListNode || columnListNode.type.name !== 'column_list') return

  const N = columnListNode.childCount
  if (N === 0) return
  const widthPct = 100 / N

  editor.chain().command(({ tr }) => {
    columnListNode.forEach((child: PMNode, offset: number) => {
      const childPos = columnListPos + 1 + offset
      tr.setNodeMarkup(childPos, null, { ...child.attrs, width_pct: widthPct })
    })
    return true
  }).run()
}
