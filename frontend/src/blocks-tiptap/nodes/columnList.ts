import { Node, mergeAttributes } from '@tiptap/core'

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
})
