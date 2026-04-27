import { Node, mergeAttributes } from '@tiptap/core'

export const Column = Node.create({
  name: 'column',

  group: 'columnContent',

  content: 'block+',

  addAttributes() {
    return {
      column_index: {
        default: 0,
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-block-type="column"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes({ 'data-block-type': 'column' }, HTMLAttributes), 0]
  },
})
