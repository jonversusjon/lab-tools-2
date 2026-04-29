import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { useEditor, EditorContent } from '@tiptap/react'
import { Editor, type JSONContent } from '@tiptap/core'
import { tiptapExtensions } from '@/blocks-tiptap/extensions'
import {
  clearColumn,
  deleteColumn,
  insertColumnAdjacent,
  setColumnsCount,
  redistributeAfterRemoval,
} from '@/blocks-tiptap/views/columnCommands'
import {
  rowsToTiptapDoc,
  tiptapDocToRows,
} from '@/blocks-tiptap/adapter'
import type { ExperimentBlock } from '@/types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeHeadlessEditor(content: object): Editor {
  return new Editor({ extensions: tiptapExtensions, content })
}

function EditorWrapper({ doc }: { doc: object }) {
  const editor = useEditor({ extensions: tiptapExtensions, content: doc })
  return <EditorContent editor={editor} />
}

function renderEditorWith(doc: object) {
  return render(<EditorWrapper doc={doc} />)
}

function findNodePositions(editor: Editor, typeName: string): number[] {
  const positions: number[] = []
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === typeName) {
      positions.push(pos)
    }
  })
  return positions
}

function makeColumnListDoc(columns: Array<{ widthPct: number | null; text: string }>) {
  return {
    type: 'doc',
    content: [
      {
        type: 'column_list',
        attrs: { column_count: columns.length },
        content: columns.map((col) => ({
          type: 'column',
          attrs: { width_pct: col.widthPct },
          content: [
            {
              type: 'paragraph',
              content: col.text ? [{ type: 'text', text: col.text }] : [],
            },
          ],
        })),
      },
    ],
  }
}

// ---------------------------------------------------------------------------
// 1-3. NodeView rendering tests
// ---------------------------------------------------------------------------

describe('ColumnView — NodeView rendering', () => {
  it('1. even distribution (width_pct = null) renders with auto-flex (no explicit percentage)', async () => {
    renderEditorWith(makeColumnListDoc([
      { widthPct: null, text: 'col-left' },
      { widthPct: null, text: 'col-right' },
    ]))

    expect(await screen.findByText('col-left')).toBeInTheDocument()
    expect(await screen.findByText('col-right')).toBeInTheDocument()

    // Native renderHTML emits [data-block-type="column"] divs with inline style.
    const columns = Array.from(
      document.querySelectorAll<HTMLElement>('[data-block-type="column"]')
    )
    expect(columns.length).toBeGreaterThanOrEqual(2)

    // For null width_pct, column uses 'flex: 1 1 0' — no explicit percentage.
    const hasExplicitPct = columns.some((el) =>
      /[1-9]\d*(\.\d+)?%/.test(el.getAttribute('style') ?? '')
    )
    expect(hasExplicitPct).toBe(false)
  })

  it('2. explicit widths (30/70) renders with correct flex-basis', async () => {
    renderEditorWith(makeColumnListDoc([
      { widthPct: 30, text: 'narrow' },
      { widthPct: 70, text: 'wide' },
    ]))

    await screen.findByText('narrow')
    await screen.findByText('wide')

    // Native renderHTML emits [data-block-type="column"] with inline flex shorthand.
    const columns = Array.from(
      document.querySelectorAll<HTMLElement>('[data-block-type="column"]')
    )
    const col30 = columns.find((el) => (el.getAttribute('style') ?? '').includes('30%'))
    const col70 = columns.find((el) => (el.getAttribute('style') ?? '').includes('70%'))
    expect(col30).toBeDefined()
    expect(col70).toBeDefined()
  })

  it('3. NodeView renders child content', async () => {
    renderEditorWith({
      type: 'doc',
      content: [
        {
          type: 'column_list',
          attrs: { column_count: 1 },
          content: [
            {
              type: 'column',
              attrs: { width_pct: null },
              content: [
                { type: 'paragraph', content: [{ type: 'text', text: 'hello' }] },
              ],
            },
          ],
        },
      ],
    })

    expect(await screen.findByText('hello')).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// 4-8. Command tests (headless editor — no React mounting needed)
// ---------------------------------------------------------------------------

describe('columnCommands', () => {
  it('4. clearColumn replaces content with empty paragraph', () => {
    const editor = makeHeadlessEditor({
      type: 'doc',
      content: [
        {
          type: 'column_list',
          attrs: { column_count: 1 },
          content: [
            {
              type: 'column',
              attrs: { width_pct: null },
              content: [
                { type: 'paragraph', content: [{ type: 'text', text: 'abc' }] },
                { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'def' }] },
              ],
            },
          ],
        },
      ],
    })

    const colPositions = findNodePositions(editor, 'column')
    clearColumn(editor, colPositions[0])

    const json = editor.getJSON() as JSONContent
    const column = json.content?.[0]?.content?.[0]
    expect(column?.type).toBe('column')
    expect(column?.content).toHaveLength(1)
    expect(column?.content?.[0]?.type).toBe('paragraph')
    // Empty paragraph has no inline content
    const paraContent = column?.content?.[0]?.content
    expect(!paraContent || paraContent.length === 0).toBe(true)

    editor.destroy()
  })

  it('5. deleteColumn (mid-list) redistributes widths proportionally', () => {
    const editor = makeHeadlessEditor(
      makeColumnListDoc([
        { widthPct: 30, text: 'col0' },
        { widthPct: 30, text: 'col1' },
        { widthPct: 40, text: 'col2' },
      ])
    )

    const colPositions = findNodePositions(editor, 'column')
    // Delete index 1 (the middle column, width 30)
    deleteColumn(editor, colPositions[1])

    const json = editor.getJSON() as JSONContent
    const columnList = json.content?.[0]
    expect(columnList?.type).toBe('column_list')
    expect(columnList?.content).toHaveLength(2)

    // Surviving widths: [30, 40] → redistribute → [30/70*100, 40/70*100]
    const col0 = columnList?.content?.[0]
    const col1 = columnList?.content?.[1]
    expect(col0?.attrs?.width_pct).toBeCloseTo(42.857, 2)
    expect(col1?.attrs?.width_pct).toBeCloseTo(57.143, 2)

    editor.destroy()
  })

  it('6. deleteColumn (last column) removes column_list', () => {
    const editor = makeHeadlessEditor({
      type: 'doc',
      content: [
        {
          type: 'column_list',
          attrs: { column_count: 1 },
          content: [
            {
              type: 'column',
              attrs: { width_pct: null },
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'only' }] }],
            },
          ],
        },
      ],
    })

    const colPositions = findNodePositions(editor, 'column')
    deleteColumn(editor, colPositions[0])

    const json = editor.getJSON() as JSONContent
    const hasColumnList = (json.content ?? []).some((n) => n.type === 'column_list')
    expect(hasColumnList).toBe(false)

    editor.destroy()
  })

  it('7. insertColumnAdjacent (right) scales existing columns and inserts new', () => {
    const editor = makeHeadlessEditor(
      makeColumnListDoc([
        { widthPct: 60, text: 'col0' },
        { widthPct: 40, text: 'col1' },
      ])
    )

    const colPositions = findNodePositions(editor, 'column')
    // Insert to the right of column 0
    insertColumnAdjacent(editor, colPositions[0], 'right')

    const json = editor.getJSON() as JSONContent
    const columnList = json.content?.[0]
    expect(columnList?.content).toHaveLength(3)

    // N=2, new N=3, new column width = 100/3 ≈ 33.33
    // col0: 60 * 2/3 = 40
    // new:  100/3 ≈ 33.33
    // col1: 40 * 2/3 ≈ 26.67
    const col0 = columnList?.content?.[0]
    const newCol = columnList?.content?.[1]
    const col1 = columnList?.content?.[2]
    expect(col0?.attrs?.width_pct).toBeCloseTo(40, 2)
    expect(newCol?.attrs?.width_pct).toBeCloseTo(33.33, 2)
    expect(col1?.attrs?.width_pct).toBeCloseTo(26.67, 2)

    editor.destroy()
  })

  it('8. setColumnsCount (grow from 2 to 4) creates evenly distributed columns', () => {
    const editor = makeHeadlessEditor(
      makeColumnListDoc([
        { widthPct: 60, text: 'col0' },
        { widthPct: 40, text: 'col1' },
      ])
    )

    const colListPositions = findNodePositions(editor, 'column_list')
    setColumnsCount(editor, colListPositions[0], 4)

    const json = editor.getJSON() as JSONContent
    const columnList = json.content?.[0]
    expect(columnList?.content).toHaveLength(4)
    for (const col of columnList?.content ?? []) {
      expect(col.attrs?.width_pct).toBeCloseTo(25, 2)
    }

    editor.destroy()
  })
})

// ---------------------------------------------------------------------------
// 9. Adapter test — fixture 17 round-trip (non-even widths)
// ---------------------------------------------------------------------------

describe('adapter — non-even column widths round-trip (fixture 17)', () => {
  it('9. DB rows with width_pct 30/70 round-trip correctly', () => {
    const inputRows: ExperimentBlock[] = [
      {
        id: 'CL',
        experiment_id: 'exp',
        block_type: 'column_list',
        content: { column_count: 2 },
        sort_order: 0,
        parent_id: null,
        created_at: null,
        updated_at: null,
      },
      {
        id: 'CA',
        experiment_id: 'exp',
        block_type: 'column',
        content: { width_pct: 30 },
        sort_order: 0,
        parent_id: 'CL',
        created_at: null,
        updated_at: null,
      },
      {
        id: 'CB',
        experiment_id: 'exp',
        block_type: 'column',
        content: { width_pct: 70 },
        sort_order: 1,
        parent_id: 'CL',
        created_at: null,
        updated_at: null,
      },
      {
        id: 'PA',
        experiment_id: 'exp',
        block_type: 'paragraph',
        content: { text: 'narrow' },
        sort_order: 0,
        parent_id: 'CA',
        created_at: null,
        updated_at: null,
      },
      {
        id: 'PB',
        experiment_id: 'exp',
        block_type: 'paragraph',
        content: { text: 'wide' },
        sort_order: 0,
        parent_id: 'CB',
        created_at: null,
        updated_at: null,
      },
    ]

    const doc = rowsToTiptapDoc(inputRows)

    // Verify DB→Tiptap
    const colList = doc.content?.[0]
    expect(colList?.type).toBe('column_list')
    expect(colList?.content?.[0]?.attrs?.width_pct).toBe(30)
    expect(colList?.content?.[1]?.attrs?.width_pct).toBe(70)

    // Verify Tiptap→DB round-trip
    const rebuilt = tiptapDocToRows(doc, 'exp')
    const columnRows = rebuilt.filter((r) => r.block_type === 'column')
    expect(columnRows).toHaveLength(2)

    const sorted = [...columnRows].sort((a, b) => a.sort_order - b.sort_order)
    expect((sorted[0].content as Record<string, unknown>)['width_pct']).toBe(30)
    expect((sorted[1].content as Record<string, unknown>)['width_pct']).toBe(70)
  })
})

// ---------------------------------------------------------------------------
// 10. redistributeAfterRemoval helper unit tests
// ---------------------------------------------------------------------------

describe('redistributeAfterRemoval', () => {
  it('10a. proportional redistribution: [30, 40] → [42.857, 57.143]', () => {
    const result = redistributeAfterRemoval([30, 40])
    expect(result[0]).toBeCloseTo(42.857, 2)
    expect(result[1]).toBeCloseTo(57.143, 2)
  })

  it('10b. all-zero edge case distributes evenly: [0, 0] → [50, 50]', () => {
    const result = redistributeAfterRemoval([0, 0])
    expect(result[0]).toBeCloseTo(50, 2)
    expect(result[1]).toBeCloseTo(50, 2)
  })
})
