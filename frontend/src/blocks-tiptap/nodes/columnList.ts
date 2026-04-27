import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import ColumnListView from '@/blocks-tiptap/views/ColumnListView'

export const ColumnList = Node.create({
  name: 'column_list',

  group: 'block',

  content: 'column+',

  addAttributes() {
    return {
      column_count: {
        default: 2,
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-block-type="column_list"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes({ 'data-block-type': 'column_list' }, HTMLAttributes), 0]
  },

  addNodeView() {
    return ReactNodeViewRenderer(ColumnListView)
  },
})
