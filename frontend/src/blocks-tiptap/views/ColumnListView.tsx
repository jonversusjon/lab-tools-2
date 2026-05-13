import { NodeViewWrapper, NodeViewContent } from '@tiptap/react'
import type { NodeViewProps } from '@tiptap/react'
import { useRef } from 'react'
import type { Node as PMNode } from '@tiptap/pm/model'

export const COLUMN_RESIZE_MIN_PCT = 15

export default function ColumnListView({ node, editor, getPos }: NodeViewProps) {
  const wrapperRef = useRef<HTMLDivElement>(null)

  // Collect column widths from child nodes
  const colWidths: number[] = []
  node.forEach((child) => {
    colWidths.push((child.attrs.width_pct as number | null) ?? (100 / node.childCount))
  })

  // One handle per adjacent pair (N-1 handles for N columns)
  const handles: Array<{ leftIndex: number; rightIndex: number; pct: number }> = []
  let cumPct = 0
  for (let i = 0; i < colWidths.length - 1; i++) {
    cumPct += colWidths[i]
    handles.push({ leftIndex: i, rightIndex: i + 1, pct: cumPct })
  }

  function startResize(
    e: React.MouseEvent,
    leftColIndex: number,
    rightColIndex: number,
  ): void {
    e.preventDefault()

    const rawPos = getPos()
    if (rawPos == null) return
    const colListPos: number = rawPos

    const colListNode = editor.state.doc.nodeAt(colListPos)
    if (!colListNode) return

    const leftChild = colListNode.child(leftColIndex)
    const rightChild = colListNode.child(rightColIndex)
    const leftStart =
      (leftChild.attrs.width_pct as number | null) ?? (100 / colListNode.childCount)
    const rightStart =
      (rightChild.attrs.width_pct as number | null) ?? (100 / colListNode.childCount)
    const combinedWidth = leftStart + rightStart

    const startX = e.clientX
    // Capture container width at drag start; 0 disables the move handler
    const containerWidth = wrapperRef.current?.offsetWidth ?? 0

    document.body.style.userSelect = 'none'

    function onMouseMove(ev: MouseEvent): void {
      if (containerWidth === 0) return
      const deltaPct = ((ev.clientX - startX) / containerWidth) * 100
      const newLeft = Math.max(
        COLUMN_RESIZE_MIN_PCT,
        Math.min(combinedWidth - COLUMN_RESIZE_MIN_PCT, leftStart + deltaPct),
      )
      const newRight = combinedWidth - newLeft

      // Re-read the document on each move so positions stay accurate
      const currentDoc = editor.state.doc
      const currentColList = currentDoc.nodeAt(colListPos)
      if (!currentColList) return

      let leftPos = colListPos + 1
      let rightPos = colListPos + 1
      currentColList.forEach((_: PMNode, offset: number, index: number) => {
        if (index === leftColIndex) leftPos = colListPos + 1 + offset
        if (index === rightColIndex) rightPos = colListPos + 1 + offset
      })

      editor.view.dispatch(
        editor.state.tr
          .setNodeMarkup(leftPos, null, {
            ...currentColList.child(leftColIndex).attrs,
            width_pct: Math.round(newLeft * 100) / 100,
          })
          .setNodeMarkup(rightPos, null, {
            ...currentColList.child(rightColIndex).attrs,
            width_pct: Math.round(newRight * 100) / 100,
          }),
      )
    }

    function onMouseUp(): void {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
      document.body.style.userSelect = ''
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }

  return (
    <NodeViewWrapper>
      <div
        ref={wrapperRef}
        data-block-type="column_list"
        style={{ position: 'relative', marginTop: '0.75rem', marginBottom: '0.75rem' }}
      >
        <NodeViewContent style={{ display: 'flex', gap: '1rem', width: '100%' }} />
        <div
          contentEditable={false}
          aria-hidden="true"
          style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
        >
          {handles.map(({ leftIndex, rightIndex, pct }) => (
            <div
              key={leftIndex}
              className="column-resize-handle"
              style={{ left: `${pct}%`, position: 'absolute', top: 0, bottom: 0 }}
              onMouseDown={(e) => startResize(e, leftIndex, rightIndex)}
            />
          ))}
        </div>
      </div>
    </NodeViewWrapper>
  )
}
