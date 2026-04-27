import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import ColumnView from '@/blocks-tiptap/views/ColumnView'

export const Column = Node.create({
  name: 'column',

  group: 'columnContent',

  content: 'block+',

  addAttributes() {
    return {
      width_pct: {
        default: null,
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-block-type="column"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes({ 'data-block-type': 'column' }, HTMLAttributes), 0]
  },

  addNodeView() {
    return ReactNodeViewRenderer(ColumnView)
  },
})
