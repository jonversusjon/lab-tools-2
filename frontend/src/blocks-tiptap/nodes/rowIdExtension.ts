import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'

// Node types that participate in the _rowId attribute. Some are "synthetic"
// (the adapter never emits a DB row for them) but they still carry the
// attribute so global parsing/serialization round-trips cleanly.
const ROW_BACKED_TYPES = [
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
] as const

// Synthetic types: the adapter (tiptapToDb) does NOT emit DB rows for these;
// they exist purely as schema groupers. The plugin must NOT mint UUIDs for
// them — doing so would create stable ids on nodes that have no server row,
// inflating diff churn.
const SYNTHETIC_TYPES = new Set<string>([
  'bulletList',
  'orderedList',
  'tableRow',
  'tableHeader',
  'tableCell',
])

const NEEDS_ROW_ID = new Set<string>(
  ROW_BACKED_TYPES.filter((t) => !SYNTHETIC_TYPES.has(t))
)

// Adds a `_rowId` attribute to every block-level node in our schema and
// auto-populates it with a fresh UUID for any newly-created node that lacks
// one. The save coordinator (Phase 10b) reads this to correlate Tiptap nodes
// with their database rows across transactions. Underscore-prefixed and
// `rendered: false` to mark it as internal: never serialized to HTML, never
// persisted into row.content, and not parsed back from pasted HTML.
export const RowIdExtension = Extension.create({
  name: 'rowId',
  addGlobalAttributes() {
    return [
      {
        types: [...ROW_BACKED_TYPES],
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
  addProseMirrorPlugins() {
    const key = new PluginKey('rowIdAutoPopulate')
    return [
      new Plugin({
        key,
        appendTransaction: (_transactions, _oldState, newState) => {
          const tr = newState.tr
          let mutated = false
          newState.doc.descendants((node, pos) => {
            if (!NEEDS_ROW_ID.has(node.type.name)) return
            if (node.attrs._rowId != null) return
            tr.setNodeAttribute(pos, '_rowId', crypto.randomUUID())
            mutated = true
          })
          return mutated ? tr : null
        },
      }),
    ]
  },
})
