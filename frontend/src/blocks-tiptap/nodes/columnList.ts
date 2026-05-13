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

  addNodeView() {
    return ReactNodeViewRenderer(ColumnListView)
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-block-type': 'column_list',
        style: 'display: flex; width: 100%; gap: 1rem; margin-top: 0.75rem; margin-bottom: 0.75rem;',
      }),
      0,
    ]
  },
})
