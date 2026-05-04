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
