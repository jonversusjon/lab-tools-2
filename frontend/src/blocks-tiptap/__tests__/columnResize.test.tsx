import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { useEditor, EditorContent } from '@tiptap/react'
import type { JSONContent } from '@tiptap/core'
import { tiptapExtensions } from '@/blocks-tiptap/extensions'
import { COLUMN_RESIZE_MIN_PCT } from '@/blocks-tiptap/views/ColumnListView'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeColumnListDoc(
  columns: Array<{ widthPct: number | null; text: string }>,
): object {
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

function EditorWrapper({ doc }: { doc: object }) {
  const editor = useEditor({ extensions: tiptapExtensions, content: doc })
  return <EditorContent editor={editor} />
}

function renderEditorWith(doc: object) {
  return render(<EditorWrapper doc={doc} />)
}

// ---------------------------------------------------------------------------
// 1. Resize handle renders between 2 columns — exactly 1 handle
// ---------------------------------------------------------------------------

describe('columnResize', () => {
  it('1. resize handle renders between 2 columns — exactly 1 handle', async () => {
    renderEditorWith(
      makeColumnListDoc([
        { widthPct: 50, text: 'left' },
        { widthPct: 50, text: 'right' },
      ]),
    )

    await screen.findByText('left')

    const handles = document.querySelectorAll('.column-resize-handle')
    expect(handles.length).toBe(1)
  })

  // ---------------------------------------------------------------------------
  // 2. Three columns have two resize handles
  // ---------------------------------------------------------------------------

  it('2. three columns have two resize handles', async () => {
    renderEditorWith(
      makeColumnListDoc([
        { widthPct: 33, text: 'A' },
        { widthPct: 34, text: 'B' },
        { widthPct: 33, text: 'C' },
      ]),
    )

    await screen.findByText('A')

    const handles = document.querySelectorAll('.column-resize-handle')
    expect(handles.length).toBe(2)
  })

  // ---------------------------------------------------------------------------
  // 3. width_pct applied as inline style on column container
  // ---------------------------------------------------------------------------

  it('3. width_pct applied as inline style on column container', async () => {
    renderEditorWith(
      makeColumnListDoc([
        { widthPct: 50, text: 'half' },
        { widthPct: 50, text: 'other' },
      ]),
    )

    await screen.findByText('half')

    const columns = Array.from(
      document.querySelectorAll<HTMLElement>('[data-block-type="column"]'),
    )
    expect(columns.length).toBeGreaterThanOrEqual(2)

    const colWithHalfWidth = columns.find((el) => el.style.width === '50%')
    expect(colWithHalfWidth).toBeDefined()
  })

  // ---------------------------------------------------------------------------
  // 4. Minimum width enforced during drag
  // ---------------------------------------------------------------------------

  it('4. minimum width enforced — drag far left clamps left column at 15%', async () => {
    // jsdom has no layout engine; mock offsetWidth so drag calculation runs
    vi.spyOn(HTMLDivElement.prototype, 'offsetWidth', 'get').mockReturnValue(1000)

    // Use a ref-box to avoid TypeScript's `never` narrowing of let+closure
    const editorBox = { current: null as ReturnType<typeof useEditor> | null }

    function EditorCapture({ doc }: { doc: object }) {
      const editor = useEditor({ extensions: tiptapExtensions, content: doc })
      editorBox.current = editor
      return <EditorContent editor={editor} />
    }

    render(
      <EditorCapture
        doc={makeColumnListDoc([
          { widthPct: 50, text: 'left' },
          { widthPct: 50, text: 'right' },
        ])}
      />,
    )

    await screen.findByText('left')

    const handle = document.querySelector('.column-resize-handle')
    expect(handle).not.toBeNull()

    // Drag far left: startX=500, endX=0 → deltaPct = -50 on a 1000px container
    // newLeft = max(15, min(85, 50-50)) = max(15, 0) = 15
    await act(async () => {
      fireEvent.mouseDown(handle!, { clientX: 500 })
      fireEvent.mouseMove(document, { clientX: 0 })
      fireEvent.mouseUp(document)
    })

    const json = editorBox.current?.getJSON() as JSONContent
    const columnList = json?.content?.[0]
    expect(columnList?.content?.[0]?.attrs?.width_pct).toBe(COLUMN_RESIZE_MIN_PCT)
    expect(columnList?.content?.[1]?.attrs?.width_pct).toBe(100 - COLUMN_RESIZE_MIN_PCT)

    vi.restoreAllMocks()
  })
})
