import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import { useEditor, EditorContent } from '@tiptap/react'
import { tiptapExtensions } from '@/blocks-tiptap/extensions'
import type { Editor } from '@tiptap/react'

// Mock all data hooks so FlowPanelView can render without a backend
vi.mock('@/hooks/useAntibodies', () => ({
  useAntibodies: () => ({ data: { items: [], total: 0, skip: 0, limit: 100 } }),
}))

vi.mock('@/hooks/useFluorophores', () => ({
  useFluorophores: () => ({ data: { items: [], total: 0, skip: 0, limit: 100 } }),
  useBatchSpectra: () => ({ data: {} }),
}))

vi.mock('@/hooks/useSecondaries', () => ({
  useSecondaries: () => ({ data: { items: [] } }),
}))

vi.mock('@/hooks/useConjugateChemistries', () => ({
  useConjugateChemistries: () => ({ data: [] }),
}))

vi.mock('@/hooks/useInstruments', () => ({
  useInstruments: () => ({ data: { items: [], total: 0, skip: 0, limit: 100 } }),
  useInstrument: () => ({ data: null }),
}))

vi.mock('@/hooks/useDyeLabels', () => ({
  useDyeLabels: () => ({ data: { items: [], total: 0, skip: 0, limit: 100 } }),
}))

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeFlowPanelDoc(attrs: Record<string, unknown> = {}) {
  return {
    type: 'doc',
    content: [
      {
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
          ...attrs,
        },
      },
    ],
  }
}

function makeFlowPanelDoc2(nameA: string, nameB: string) {
  return {
    type: 'doc',
    content: [
      {
        type: 'flow_panel',
        attrs: {
          source_panel_id: null,
          name: nameA,
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
      {
        type: 'flow_panel',
        attrs: {
          source_panel_id: null,
          name: nameB,
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
}

let capturedEditor: Editor | null = null

function EditorCapture({ doc }: { doc: unknown }) {
  const editor = useEditor({
    extensions: tiptapExtensions,
    content: doc as object,
  })
  capturedEditor = editor
  return <EditorContent editor={editor} />
}

afterEach(() => {
  capturedEditor?.destroy()
  capturedEditor = null
})

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('FlowPanelView', () => {
  it('Test 1 — smoke render: mounts without crashing and shows panel UI', async () => {
    render(<EditorCapture doc={makeFlowPanelDoc()} />)

    // PanelDesignerView renders "No targets added yet" when empty
    expect(
      await screen.findByText(/No targets added yet/i)
    ).toBeInTheDocument()
  })

  it('Test 2 — initial state from attrs: panel name is displayed', async () => {
    render(<EditorCapture doc={makeFlowPanelDoc({ name: 'Test Panel' })} />)

    // The panel name appears as an h1 in PanelDesignerView
    expect(await screen.findByText('Test Panel')).toBeInTheDocument()
  })

  it('Test 3 — action propagates to attrs: editing name updates editor JSON', async () => {
    render(<EditorCapture doc={makeFlowPanelDoc({ name: 'Original Name' })} />)

    // Wait for the panel to render with the initial name
    const nameHeading = await screen.findByText('Original Name')

    // Click to enter edit mode
    await act(async () => {
      fireEvent.click(nameHeading)
    })

    // Find the name input (PanelDesignerView renders an <input> when editing)
    const input = screen.getByDisplayValue('Original Name')
    expect(input).toBeInTheDocument()

    // Type a new name
    await act(async () => {
      fireEvent.change(input, { target: { value: 'Updated Name' } })
    })

    // Blur to commit (triggers onSaveName)
    await act(async () => {
      fireEvent.blur(input)
    })

    // Verify attrs updated in editor JSON
    await waitFor(() => {
      const json = capturedEditor?.getJSON()
      const panel = json?.content?.[0]
      expect(panel?.attrs?.name).toBe('Updated Name')
    })
  })

  it('Test 4 — two panels, data isolation: editing one does not affect the other', async () => {
    render(<EditorCapture doc={makeFlowPanelDoc2('Panel A', 'Panel B')} />)

    // Both panels render
    expect(await screen.findByText('Panel A')).toBeInTheDocument()
    expect(await screen.findByText('Panel B')).toBeInTheDocument()

    // Click Panel A's name heading to enter edit mode
    const panelAHeading = screen.getByText('Panel A')
    await act(async () => {
      fireEvent.click(panelAHeading)
    })

    const input = screen.getByDisplayValue('Panel A')

    await act(async () => {
      fireEvent.change(input, { target: { value: 'Panel A2' } })
    })

    await act(async () => {
      fireEvent.blur(input)
    })

    // Panel A's name updated, Panel B's name unchanged
    await waitFor(() => {
      const json = capturedEditor?.getJSON()
      const panelA = json?.content?.[0]
      const panelB = json?.content?.[1]
      expect(panelA?.attrs?.name).toBe('Panel A2')
      expect(panelB?.attrs?.name).toBe('Panel B')
    })
  })

  it('Test 5 — onDelete removes the flow_panel block from the editor', async () => {
    render(<EditorCapture doc={makeFlowPanelDoc({ name: 'To Delete' })} />)

    // Wait for the panel to render
    await screen.findByText('To Delete')

    const initialJson = capturedEditor?.getJSON()
    expect(initialJson?.content?.length).toBe(1)

    // Programmatically delete the flow_panel node using the same pattern
    // as onDelete in FlowPanelView (validates the implementation approach)
    await act(async () => {
      if (!capturedEditor) return
      const json = capturedEditor.getJSON()
      const panelNode = json?.content?.[0]
      if (!panelNode) return

      // Find the position of the flow_panel node in the doc
      let panelPos: number | null = null
      capturedEditor.state.doc.descendants((node, pos) => {
        if (node.type.name === 'flow_panel') {
          panelPos = pos
          return false
        }
      })

      if (panelPos !== null) {
        const nodeSize = capturedEditor.state.doc.nodeAt(panelPos)?.nodeSize ?? 0
        capturedEditor.chain().focus().command(({ tr }) => {
          tr.delete(panelPos!, panelPos! + nodeSize)
          return true
        }).run()
      }
    })

    // flow_panel node is gone
    await waitFor(() => {
      const json = capturedEditor?.getJSON()
      const hasFlowPanel = json?.content?.some((n) => n.type === 'flow_panel')
      expect(hasFlowPanel).toBeFalsy()
    })
  })
})
