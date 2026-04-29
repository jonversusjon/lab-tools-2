import { Node, mergeAttributes } from '@tiptap/core'

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

  renderHTML({ HTMLAttributes, node }) {
    const widthPct: number | null = node.attrs.width_pct
    const widthStyle =
      widthPct == null
        ? 'flex: 1 1 0; min-width: 0;'
        : `flex: 0 0 ${widthPct}%; min-width: 0;`

    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-block-type': 'column',
        style: widthStyle,
      }),
      0,
    ]
  },
})
