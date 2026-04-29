import { Extension } from '@tiptap/core'

// Adds a `_rowId` attribute to every block-level node in our schema.
// The save coordinator (Phase 10b) reads this to correlate Tiptap nodes
// with their database rows across transactions. Underscore-prefixed and
// `rendered: false` to mark it as internal: never serialized to HTML,
// never persisted into row.content, and not parsed back from pasted HTML.
export const RowIdExtension = Extension.create({
  name: 'rowId',
  addGlobalAttributes() {
    return [
      {
        types: [
          'paragraph',
          'heading',
          'bulletList',
          'orderedList',
          'listItem',
          'horizontalRule',
          'callout',
          'column_list',
          'column',
          'flow_panel',
          'if_panel',
          'table',
          'tableRow',
          'tableHeader',
          'tableCell',
        ],
        attributes: {
          _rowId: {
            default: null,
            rendered: false,
            parseHTML: () => null,
            keepOnSplit: false,
          },
        },
      },
    ]
  },
})
