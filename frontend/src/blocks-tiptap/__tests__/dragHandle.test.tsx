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

// flow_panel carrying non-default content: targets, assignments, and tweaked
// volume params. Used to assert Duplicate deep-copies the whole content blob.
const populatedFlowPanelDoc = {
  type: 'doc',
  content: [
    {
      type: 'flow_panel',
      attrs: {
        source_panel_id: 'template-uuid-123',
        name: 'Populated Panel',
        instrument: { id: 'inst-1', name: 'BD FACSAria III' },
        targets: [
          {
            id: 'tgt-1',
            antibody_id: 'ab-1',
            antibody_name: 'CD3',
            antibody_target: 'CD3',
            staining_mode: 'direct',
            sort_order: 0,
          },
        ],
        assignments: [
          {
            id: 'asn-1',
            antibody_id: 'ab-1',
            fluorophore_id: 'af-488',
            fluorophore_name: 'Alexa Fluor 488',
            detector_id: 'det-1',
            detector_name: '530/30',
          },
        ],
        volume_params: {
          num_samples: 6,
          volume_per_sample_ul: 250,
          pipet_error_factor: 1.2,
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

  it('Duplicate deep-copies flow_panel content and assigns a fresh _rowId', async () => {
    const editorBox: { current: Editor | null } = { current: null }

    function CapturingWrapper() {
      const editor = useEditor({
        extensions: tiptapExtensions,
        content: populatedFlowPanelDoc,
      })
      if (editor) editorBox.current = editor
      if (!editor) return null
      const node = editor.state.doc.maybeChild(0)
      return (
        <BlockMenu editor={editor} currentNode={node} currentNodePos={0} />
      )
    }

    render(<CapturingWrapper />)
    await screen.findByTestId('drag-grip')

    await act(async () => {
      fireEvent.click(screen.getByTestId('block-menu-trigger'))
    })
    expect(screen.getByTestId('block-menu-dropdown')).toBeInTheDocument()

    await act(async () => {
      fireEvent.click(screen.getByTestId('block-menu-duplicate'))
    })

    // Both blocks exist, in document order, both flow_panel. (ProseMirror
    // auto-appends a trailing paragraph, so the doc has 3 children.)
    await waitFor(() => {
      let count = 0
      editorBox.current?.state.doc.forEach((n) => {
        if (n.type.name === 'flow_panel') count += 1
      })
      expect(count).toBe(2)
    })
    const doc = editorBox.current?.state.doc
    expect(doc?.child(0).type.name).toBe('flow_panel')
    expect(doc?.child(1).type.name).toBe('flow_panel')

    // Content attrs are deep-equal between original and duplicate.
    const original = { ...doc?.child(0).attrs }
    const copy = { ...doc?.child(1).attrs }
    const firstId = original._rowId
    const secondId = copy._rowId
    delete original._rowId
    delete copy._rowId
    expect(copy).toEqual(original)
    expect(copy.targets).toEqual([
      {
        id: 'tgt-1',
        antibody_id: 'ab-1',
        antibody_name: 'CD3',
        antibody_target: 'CD3',
        staining_mode: 'direct',
        sort_order: 0,
      },
    ])
    expect(copy.assignments).toHaveLength(1)
    expect(copy.volume_params).toEqual({
      num_samples: 6,
      volume_per_sample_ul: 250,
      pipet_error_factor: 1.2,
      dilution_source: 'flow',
    })

    // Each block has a distinct, non-empty _rowId.
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
