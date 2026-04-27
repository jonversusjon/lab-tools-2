import { NodeViewContent, NodeViewWrapper } from '@tiptap/react'
import type { NodeViewProps } from '@tiptap/react'

export default function ColumnView({ node }: NodeViewProps) {
  const widthPct: number | null = node.attrs.width_pct
  const style: React.CSSProperties =
    widthPct == null
      ? { flex: 1, minWidth: 0 }
      : { flexBasis: `${widthPct}%`, minWidth: 0 }

  return (
    <NodeViewWrapper
      as="div"
      style={style}
      className="group relative rounded border border-transparent hover:border-gray-200 dark:hover:border-gray-700 px-2 py-1"
    >
      <NodeViewContent as="div" />
    </NodeViewWrapper>
  )
}
