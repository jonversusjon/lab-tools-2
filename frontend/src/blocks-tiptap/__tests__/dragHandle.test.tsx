import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import { useEditor, type Editor } from '@tiptap/react'
import { tiptapExtensions } from '@/blocks-tiptap/extensions'
import BlockMenu from '@/blocks-tiptap/dragHandle/BlockMenu'
import { duplicateBlockAtPos } from '@/blocks-tiptap/dragHandle/duplicateBlock'
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

// Creates a real editor and exposes it via `editorBox`. EditorContent is NOT
// rendered — that keeps panel NodeViews (which need a QueryClient + many
// mocked hooks) from mounting. Keyboard shortcuts are still exercised by
// firing keydown on `editor.view.dom`, which is the real `.ProseMirror`
// element ProseMirror's keymap listens on.
function EditorOnly({
  docContent,
  editorBox,
}: {
  docContent: object
  editorBox: { current: Editor | null }
}) {
  const editor = useEditor({ extensions: tiptapExtensions, content: docContent })
  if (editor) editorBox.current = editor
  return null
}

function countNodesOfType(editor: Editor, typeName: string): number {
  let count = 0
  editor.state.doc.forEach((n) => {
    if (n.type.name === typeName) count += 1
  })
  return count
}

// Walks the whole document, collecting non-null `_rowId` values. When
// `typeName` is given, only nodes of that type are collected.
function collectRowIds(editor: Editor, typeName?: string): string[] {
  const ids: string[] = []
  editor.state.doc.descendants((node) => {
    if (typeName && node.type.name !== typeName) return
    const rid = node.attrs._rowId
    if (rid != null) ids.push(rid as string)
  })
  return ids
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

const headingLevel2Doc = {
  type: 'doc',
  content: [
    {
      type: 'heading',
      attrs: { level: 2 },
      content: [{ type: 'text', text: 'A heading' }],
    },
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

const bulletListDoc = {
  type: 'doc',
  content: [
    {
      type: 'bulletList',
      content: [
        {
          type: 'listItem',
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'Item one' }] },
          ],
        },
        {
          type: 'listItem',
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'Item two' }] },
          ],
        },
      ],
    },
  ],
}

const columnListDoc = {
  type: 'doc',
  content: [
    {
      type: 'column_list',
      attrs: { column_count: 2 },
      content: [
        {
          type: 'column',
          attrs: { width_pct: 50 },
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'Left' }] },
          ],
        },
        {
          type: 'column',
          attrs: { width_pct: 50 },
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'Right' }] },
          ],
        },
      ],
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

  it('Change-from submenu reveals current type and disables it', async () => {
    render(<EditorAndMenu docContent={headingLevel2Doc} />)
    await screen.findByTestId('drag-grip')

    await act(async () => {
      fireEvent.click(screen.getByTestId('block-menu-trigger'))
    })

    // Trigger label reveals the current block type.
    const convertTrigger = screen.getByTestId('block-menu-convert')
    expect(convertTrigger).toHaveTextContent('Heading 2')

    // Open the submenu.
    await act(async () => {
      fireEvent.click(convertTrigger)
    })

    // The current type (Heading 2) is present but disabled; other targets
    // remain enabled.
    const headingTwoOption = screen.getByTestId('block-menu-convert-heading-2')
    expect(headingTwoOption).toBeDisabled()
    expect(screen.getByTestId('block-menu-convert-heading-1')).toBeEnabled()
    expect(screen.getByTestId('block-menu-convert-paragraph')).toBeEnabled()
  })

  it('Mod-Shift-D duplicates the current heading block', async () => {
    const editorBox: { current: Editor | null } = { current: null }
    render(
      <EditorOnly docContent={headingLevel2Doc} editorBox={editorBox} />
    )
    await waitFor(() => expect(editorBox.current).not.toBeNull())
    const editor = editorBox.current as Editor

    act(() => {
      editor.commands.setTextSelection(2)
    })
    await act(async () => {
      fireEvent.keyDown(editor.view.dom, {
        key: 'd',
        code: 'KeyD',
        ctrlKey: true,
        shiftKey: true,
      })
    })

    await waitFor(() => {
      expect(countNodesOfType(editor, 'heading')).toBe(2)
    })
    expect(editor.state.doc.child(0).textContent).toBe('A heading')
    expect(editor.state.doc.child(1).textContent).toBe('A heading')
    const firstId = editor.state.doc.child(0).attrs._rowId
    const secondId = editor.state.doc.child(1).attrs._rowId
    expect(firstId).toBeTruthy()
    expect(secondId).toBeTruthy()
    expect(firstId).not.toBe(secondId)
  })

  it('Mod-Shift-D duplicates the current flow_panel block', async () => {
    const editorBox: { current: Editor | null } = { current: null }
    render(
      <EditorOnly docContent={populatedFlowPanelDoc} editorBox={editorBox} />
    )
    await waitFor(() => expect(editorBox.current).not.toBeNull())
    const editor = editorBox.current as Editor

    act(() => {
      editor.commands.setNodeSelection(0)
    })
    await act(async () => {
      fireEvent.keyDown(editor.view.dom, {
        key: 'd',
        code: 'KeyD',
        ctrlKey: true,
        shiftKey: true,
      })
    })

    await waitFor(() => {
      expect(countNodesOfType(editor, 'flow_panel')).toBe(2)
    })
    const original = { ...editor.state.doc.child(0).attrs }
    const copy = { ...editor.state.doc.child(1).attrs }
    const firstId = original._rowId
    const secondId = copy._rowId
    delete original._rowId
    delete copy._rowId
    expect(copy).toEqual(original)
    expect(copy.targets).toHaveLength(1)
    expect(copy.volume_params).toEqual({
      num_samples: 6,
      volume_per_sample_ul: 250,
      pipet_error_factor: 1.2,
      dilution_source: 'flow',
    })
    expect(firstId).not.toBe(secondId)
  })

  it('duplicate bulletList — every listItem _rowId is distinct', async () => {
    const editorBox: { current: Editor | null } = { current: null }
    render(<EditorOnly docContent={bulletListDoc} editorBox={editorBox} />)
    await waitFor(() => expect(editorBox.current).not.toBeNull())
    const editor = editorBox.current as Editor

    await act(async () => {
      duplicateBlockAtPos(editor, 0)
    })

    await waitFor(() => {
      expect(countNodesOfType(editor, 'bulletList')).toBe(2)
    })

    // 2 listItems per list × 2 lists = 4, all with distinct _rowIds.
    const listItemIds = collectRowIds(editor, 'listItem')
    expect(listItemIds).toHaveLength(4)
    for (const id of listItemIds) expect(id).toBeTruthy()
    expect(new Set(listItemIds).size).toBe(4)
  })

  it('duplicate column_list — descendant _rowIds are distinct', async () => {
    const editorBox: { current: Editor | null } = { current: null }
    render(<EditorOnly docContent={columnListDoc} editorBox={editorBox} />)
    await waitFor(() => expect(editorBox.current).not.toBeNull())
    const editor = editorBox.current as Editor

    await act(async () => {
      duplicateBlockAtPos(editor, 0)
    })

    await waitFor(() => {
      expect(countNodesOfType(editor, 'column_list')).toBe(2)
    })

    // Every _rowId-bearing node in the whole tree (column_lists, columns,
    // paragraphs) must be unique across the original and the duplicate.
    const allIds = collectRowIds(editor)
    expect(allIds.length).toBeGreaterThan(0)
    for (const id of allIds) expect(id).toBeTruthy()
    expect(new Set(allIds).size).toBe(allIds.length)
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
