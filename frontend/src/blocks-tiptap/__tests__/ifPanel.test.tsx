import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import { useEditor, EditorContent } from '@tiptap/react'
import { tiptapExtensions } from '@/blocks-tiptap/extensions'
import type { Editor } from '@tiptap/react'

// Mock all data hooks so IfPanelView can render without a backend
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

vi.mock('@/hooks/useMicroscopes', () => ({
  useMicroscopes: () => ({ data: { items: [], total: 0, skip: 0, limit: 100 } }),
  useMicroscope: () => ({ data: null }),
  useMicroscopeFluorophoreCompatibility: () => ({ data: null }),
}))

vi.mock('@/hooks/useDyeLabels', () => ({
  useDyeLabels: () => ({ data: { items: [], total: 0, skip: 0, limit: 100 } }),
}))

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeIfPanelDoc(attrs: Record<string, unknown> = {}) {
  return {
    type: 'doc',
    content: [
      {
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
          ...attrs,
        },
      },
    ],
  }
}

function makeIfPanelDoc2(nameA: string, nameB: string) {
  return {
    type: 'doc',
    content: [
      {
        type: 'if_panel',
        attrs: {
          source_panel_id: null,
          name: nameA,
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
      },
      {
        type: 'if_panel',
        attrs: {
          source_panel_id: null,
          name: nameB,
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

describe('IfPanelView', () => {
  it('Test 1 — smoke render: mounts without crashing and shows panel UI', async () => {
    render(<EditorCapture doc={makeIfPanelDoc()} />)

    // IFPanelDesignerView renders "No targets added yet" when empty
    expect(
      await screen.findByText(/No targets added yet/i)
    ).toBeInTheDocument()
  })

  it('Test 2 — initial state from attrs: panel name is displayed', async () => {
    render(<EditorCapture doc={makeIfPanelDoc({ name: 'Test IF Panel' })} />)

    expect(await screen.findByText('Test IF Panel')).toBeInTheDocument()
  })

  it('Test 3 — action propagates to attrs: editing name updates editor JSON', async () => {
    render(<EditorCapture doc={makeIfPanelDoc({ name: 'Original IF Name' })} />)

    const nameHeading = await screen.findByText('Original IF Name')

    await act(async () => {
      fireEvent.click(nameHeading)
    })

    const input = screen.getByDisplayValue('Original IF Name')
    expect(input).toBeInTheDocument()

    await act(async () => {
      fireEvent.change(input, { target: { value: 'Updated IF Name' } })
    })

    await act(async () => {
      fireEvent.blur(input)
    })

    await waitFor(() => {
      const json = capturedEditor?.getJSON()
      const panel = json?.content?.[0]
      expect(panel?.attrs?.name).toBe('Updated IF Name')
    })
  })

  it('Test 4 — two panels, data isolation: editing one does not affect the other', async () => {
    render(<EditorCapture doc={makeIfPanelDoc2('IF Panel A', 'IF Panel B')} />)

    expect(await screen.findByText('IF Panel A')).toBeInTheDocument()
    expect(await screen.findByText('IF Panel B')).toBeInTheDocument()

    const panelAHeading = screen.getByText('IF Panel A')
    await act(async () => {
      fireEvent.click(panelAHeading)
    })

    const input = screen.getByDisplayValue('IF Panel A')

    await act(async () => {
      fireEvent.change(input, { target: { value: 'IF Panel A2' } })
    })

    await act(async () => {
      fireEvent.blur(input)
    })

    await waitFor(() => {
      const json = capturedEditor?.getJSON()
      const panelA = json?.content?.[0]
      const panelB = json?.content?.[1]
      expect(panelA?.attrs?.name).toBe('IF Panel A2')
      expect(panelB?.attrs?.name).toBe('IF Panel B')
    })
  })

  it('Test 5 — onDelete removes the if_panel block from the editor', async () => {
    render(<EditorCapture doc={makeIfPanelDoc({ name: 'IF To Delete' })} />)

    await screen.findByText('IF To Delete')

    const initialJson = capturedEditor?.getJSON()
    expect(initialJson?.content?.length).toBe(1)

    await act(async () => {
      if (!capturedEditor) return

      let panelPos: number | null = null
      capturedEditor.state.doc.descendants((node, pos) => {
        if (node.type.name === 'if_panel') {
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

    await waitFor(() => {
      const json = capturedEditor?.getJSON()
      const hasIfPanel = json?.content?.some((n) => n.type === 'if_panel')
      expect(hasIfPanel).toBeFalsy()
    })
  })

  it('Test 6 — empty name renders a clickable "Untitled panel" placeholder that is editable', async () => {
    // Blank-inserted panels (via the plain slash item) have name: ''. The
    // header must still show a visible, clickable affordance — an empty <h1>
    // collapses to zero size, leaving no way to see or edit the name.
    render(<EditorCapture doc={makeIfPanelDoc({ name: '' })} />)

    const placeholder = await screen.findByText('Untitled panel')
    expect(placeholder).toBeInTheDocument()

    await act(async () => {
      fireEvent.click(placeholder)
    })

    const input = screen.getByDisplayValue('')
    await act(async () => {
      fireEvent.change(input, { target: { value: 'Named IF Panel' } })
    })
    await act(async () => {
      fireEvent.blur(input)
    })

    await waitFor(() => {
      const json = capturedEditor?.getJSON()
      expect(json?.content?.[0]?.attrs?.name).toBe('Named IF Panel')
    })
  })
})
