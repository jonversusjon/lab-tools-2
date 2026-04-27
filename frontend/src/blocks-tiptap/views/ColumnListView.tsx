import { NodeViewContent, NodeViewWrapper } from '@tiptap/react'

export default function ColumnListView() {
  return (
    <NodeViewWrapper as="div" className="flex w-full gap-4 my-3">
      <NodeViewContent as="div" className="flex w-full gap-4" />
    </NodeViewWrapper>
  )
}
