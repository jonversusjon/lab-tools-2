import { NodeViewWrapper, NodeViewContent } from '@tiptap/react'
import type { NodeViewProps } from '@tiptap/react'
import type React from 'react'

export default function ColumnView({ node }: NodeViewProps) {
  const widthPct: number | null = node.attrs.width_pct

  const style: React.CSSProperties =
    widthPct != null
      ? { flex: `0 0 ${widthPct}%`, width: `${widthPct}%`, minWidth: '15%' }
      : { flex: '1 1 0', minWidth: 0 }

  return (
    <NodeViewWrapper data-block-type="column" style={style}>
      <NodeViewContent />
    </NodeViewWrapper>
  )
}
