import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import { useEditor, type Editor } from '@tiptap/react'
import { tiptapExtensions } from '@/blocks-tiptap/extensions'
import BlockMenu from '@/blocks-tiptap/dragHandle/BlockMenu'
import type { Node as PMNode } from '@tiptap/pm/model'

// ────────────────────────────────────────────────────────────────────────────────
// Test-local editor wrapper — renders BlockMenu wired to a real Tiptap editor,
// extracting the node at nodeIndex from the loaded document.
// ────────────────────────────────────────────────────────────────────────────────

interface WrapperProps {
  docContent: object
  nodeIndex?: number
}

function EditorAndMenu({ docContent, nodeIndex = 0 }: WrapperProps) {
  const editor = useEditor({ extensions: tiptapExtensions, content: docContent })
  if (!editor) return null

  const node: PMNode | null = editor.state.doc.maybeChild(nodeIndex)
  let pos = 0
  for (let i = 0; i < nodeIndex; i++) {
    pos += editor.state.doc.child(i).nodeSize
  }

  return (
    <BlockMenu
      editor={editor}
      currentNode={node}
      currentNodePos={pos}
    />
  )
}

// ────────────────────────────────────────────────────────────────────────────────
// Minimal document fixtures
// ────────────────────────────────────────────────────────────────────────────────

const paragraphDoc = {
  type: 'doc',
  content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'Hello world' }] },
  ],
}

const twoParagraphDoc = {
  type: 'doc',
  content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'First paragraph' }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'Second paragraph' }] },
  ],
}

const flowPanelDoc = {
  type: 'doc',
  content: [
    {
      type: 'flow_panel',
      attrs: {
        source_panel_id: null,
        name: 'Test Panel',
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
    },
  ],
}

// ────────────────────────────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────────────────────────────────────

describe('BlockMenu', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('renders grip icon for a paragraph node', async () => {
    render(<EditorAndMenu docContent={paragraphDoc} />)
    expect(await screen.findByTestId('drag-grip')).toBeInTheDocument()
  })

  it('Delete fires without confirmation for a non-panel block', async () => {
    const mockConfirm = vi.spyOn(window, 'confirm')

    // Use a ref-box to capture the editor without triggering TS narrowing issues
    const editorBox: { current: Editor | null } = { current: null }

    function CapturingWrapper() {
      const editor = useEditor({ extensions: tiptapExtensions, content: twoParagraphDoc })
      if (editor) editorBox.current = editor
      if (!editor) return null
      const node = editor.state.doc.maybeChild(0)
      return (
        <BlockMenu
          editor={editor}
          currentNode={node}
          currentNodePos={0}
        />
      )
    }

    render(<CapturingWrapper />)
    await screen.findByTestId('drag-grip')

    // Open the menu
    await act(async () => {
      fireEvent.click(screen.getByTestId('block-menu-trigger'))
    })

    expect(screen.getByTestId('block-menu-dropdown')).toBeInTheDocument()

    // Click Delete
    await act(async () => {
      fireEvent.click(screen.getByTestId('block-menu-delete'))
    })

    // No confirmation dialog for non-panel blocks
    expect(mockConfirm).not.toHaveBeenCalled()

    // Document should now have only one paragraph remaining
    await waitFor(() => {
      expect(editorBox.current?.state.doc.childCount).toBe(1)
    })
  })

  it('Duplicate inserts a copy after the current node', async () => {
    const editorBox: { current: Editor | null } = { current: null }

    function CapturingWrapper() {
      const editor = useEditor({ extensions: tiptapExtensions, content: paragraphDoc })
      if (editor) editorBox.current = editor
      if (!editor) return null
      const node = editor.state.doc.maybeChild(0)
      return (
        <BlockMenu
          editor={editor}
          currentNode={node}
          currentNodePos={0}
        />
      )
    }

    render(<CapturingWrapper />)
    await screen.findByTestId('drag-grip')

    // Open the menu
    await act(async () => {
      fireEvent.click(screen.getByTestId('block-menu-trigger'))
    })

    expect(screen.getByTestId('block-menu-dropdown')).toBeInTheDocument()

    // Click Duplicate
    await act(async () => {
      fireEvent.click(screen.getByTestId('block-menu-duplicate'))
    })

    // Document should now have 2 paragraphs
    await waitFor(() => {
      expect(editorBox.current?.state.doc.childCount).toBe(2)
    })

    // Both paragraphs have the same text
    const doc = editorBox.current?.state.doc
    expect(doc?.child(0).textContent).toBe('Hello world')
    expect(doc?.child(1).textContent).toBe('Hello world')

    // The two copies have different _rowId attrs (RowIdExtension auto-populates)
    const firstId = doc?.child(0).attrs._rowId
    const secondId = doc?.child(1).attrs._rowId
    expect(firstId).toBeTruthy()
    expect(secondId).toBeTruthy()
    expect(firstId).not.toBe(secondId)
  })

  it('Convert-to is absent for flow_panel blocks', async () => {
    render(<EditorAndMenu docContent={flowPanelDoc} />)
    await screen.findByTestId('drag-grip')

    // Open the menu
    await act(async () => {
      fireEvent.click(screen.getByTestId('block-menu-trigger'))
    })

    expect(screen.getByTestId('block-menu-dropdown')).toBeInTheDocument()
    expect(screen.queryByTestId('block-menu-convert')).toBeNull()
  })

  it('Convert-to paragraph→heading_2 changes the node type', async () => {
    const editorBox: { current: Editor | null } = { current: null }

    function CapturingWrapper() {
      const editor = useEditor({ extensions: tiptapExtensions, content: paragraphDoc })
      if (editor) editorBox.current = editor
      if (!editor) return null
      const node = editor.state.doc.maybeChild(0)
      return (
        <BlockMenu
          editor={editor}
          currentNode={node}
          currentNodePos={0}
        />
      )
    }

    render(<CapturingWrapper />)
    await screen.findByTestId('drag-grip')

    // Open the menu
    await act(async () => {
      fireEvent.click(screen.getByTestId('block-menu-trigger'))
    })

    expect(screen.getByTestId('block-menu-convert')).toBeInTheDocument()

    // Open the Convert-to submenu
    await act(async () => {
      fireEvent.click(screen.getByTestId('block-menu-convert'))
    })

    // Click Heading 2
    await act(async () => {
      fireEvent.click(screen.getByTestId('block-menu-convert-heading-2'))
    })

    // First node should now be a heading at level 2
    await waitFor(() => {
      const firstNode = editorBox.current?.state.doc.firstChild
      expect(firstNode?.type.name).toBe('heading')
      expect(firstNode?.attrs.level).toBe(2)
    })
  })
})
