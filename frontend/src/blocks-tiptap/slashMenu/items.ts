import type { Editor, Range } from '@tiptap/core'

export interface SlashMenuItem {
  title: string
  keywords: string[]
  command: (editor: Editor, range: Range) => void
}

function makeColumnLayout(n: number) {
  const widthPct = 100 / n
  return {
    type: 'column_list',
    attrs: { column_count: n },
    content: Array.from({ length: n }, () => ({
      type: 'column',
      attrs: { width_pct: widthPct },
      content: [{ type: 'paragraph' }],
    })),
  }
}

export const SLASH_MENU_ITEMS: SlashMenuItem[] = [
  {
    title: 'Heading 1',
    keywords: ['h1', 'header', 'title'],
    command: (editor, range) => {
      editor.chain().focus().deleteRange(range).setNode('heading', { level: 1 }).run()
    },
  },
  {
    title: 'Heading 2',
    keywords: ['h2', 'header', 'subtitle'],
    command: (editor, range) => {
      editor.chain().focus().deleteRange(range).setNode('heading', { level: 2 }).run()
    },
  },
  {
    title: 'Heading 3',
    keywords: ['h3', 'header', 'section'],
    command: (editor, range) => {
      editor.chain().focus().deleteRange(range).setNode('heading', { level: 3 }).run()
    },
  },
  {
    title: 'Bulleted list',
    keywords: ['bullet', 'list', 'ul'],
    command: (editor, range) => {
      editor.chain().focus().deleteRange(range).toggleBulletList().run()
    },
  },
  {
    title: 'Numbered list',
    keywords: ['numbered', 'list', 'ol'],
    command: (editor, range) => {
      editor.chain().focus().deleteRange(range).toggleOrderedList().run()
    },
  },
  {
    title: 'Divider',
    keywords: ['divider', 'hr', 'line'],
    command: (editor, range) => {
      editor.chain().focus().deleteRange(range).setHorizontalRule().run()
    },
  },
  {
    title: 'Callout',
    keywords: ['callout', 'note', 'info'],
    command: (editor, range) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertContent({ type: 'callout', attrs: { icon: '💡', color: 'gray', text: '' } })
        .run()
    },
  },
  {
    title: 'Table',
    keywords: ['table', 'grid'],
    command: (editor, range) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
        .run()
    },
  },
  {
    title: '2-column layout',
    keywords: ['columns', 'layout', '2col'],
    command: (editor, range) => {
      editor.chain().focus().deleteRange(range).insertContent(makeColumnLayout(2)).run()
    },
  },
  {
    title: '3-column layout',
    keywords: ['columns', 'layout', '3col'],
    command: (editor, range) => {
      editor.chain().focus().deleteRange(range).insertContent(makeColumnLayout(3)).run()
    },
  },
  {
    title: '4-column layout',
    keywords: ['columns', 'layout', '4col'],
    command: (editor, range) => {
      editor.chain().focus().deleteRange(range).insertContent(makeColumnLayout(4)).run()
    },
  },
  {
    title: 'Flow panel',
    keywords: ['flow', 'panel', 'cytometry'],
    command: (editor, range) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertContent({
          type: 'flow_panel',
          attrs: {
            source_panel_id: null,
            name: '',
            instrument: null,
            targets: [],
            assignments: [],
            volume_params: {
              num_samples: 1,
              volume_per_sample_ul: 100,
              pipet_error_factor: 1.1,
              dilution_source: 'flow',
            },
          },
        })
        .run()
    },
  },
  {
    title: 'IF panel',
    keywords: ['if', 'panel', 'immunofluorescence'],
    command: (editor, range) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertContent({
          type: 'if_panel',
          attrs: {
            source_panel_id: null,
            name: '',
            panel_type: 'IF',
            microscope: null,
            view_mode: 'simple',
            targets: [],
            assignments: [],
            volume_params: {
              num_samples: 1,
              volume_per_sample_ul: 200,
              pipet_error_factor: 1.1,
              dilution_source: 'icc_if',
            },
          },
        })
        .run()
    },
  },
]

export function filterItems(query: string): SlashMenuItem[] {
  if (!query) return SLASH_MENU_ITEMS
  const q = query.toLowerCase()
  return SLASH_MENU_ITEMS.filter((item) => {
    const haystack = [item.title, ...item.keywords].join(' ').toLowerCase()
    return haystack.includes(q)
  })
}
