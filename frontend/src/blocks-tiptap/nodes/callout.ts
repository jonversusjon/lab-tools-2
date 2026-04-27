import { Node, mergeAttributes } from '@tiptap/core'

export const Callout = Node.create({
  name: 'callout',

  group: 'block',

  atom: true,

  selectable: true,

  draggable: true,

  addAttributes() {
    return {
      icon: {
        default: '💡',
      },
      color: {
        default: 'gray',
      },
      text: {
        default: '',
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-block-type="callout"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes({ 'data-block-type': 'callout' }, HTMLAttributes)]
  },
})
