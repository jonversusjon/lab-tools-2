import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import { useEditor, EditorContent } from '@tiptap/react'
import { tiptapExtensions } from '@/blocks-tiptap/extensions'

// Wrapper component that mounts a Tiptap editor with given initial JSON
function EditorWrapper({ doc }: { doc: unknown }) {
  const editor = useEditor({
    extensions: tiptapExtensions,
    content: doc as object,
  })
  return <EditorContent editor={editor} />
}

function renderEditor(doc: unknown) {
  const result = render(<EditorWrapper doc={doc} />)
  return result
}

function makeCalloutDoc(icon = '💡', color = 'gray', text = 'Test callout text') {
  return {
    type: 'doc',
    content: [
      { type: 'callout', attrs: { icon, color, text } },
    ],
  }
}

describe('CalloutView', () => {
  it('smoke render — renders icon, text, and color class', async () => {
    renderEditor(makeCalloutDoc('💡', 'blue', 'Hello from the sandbox'))

    expect(await screen.findByText('💡')).toBeInTheDocument()
    expect(await screen.findByText('Hello from the sandbox')).toBeInTheDocument()

    // The container should have the blue color class
    const container = screen.getByText('💡').closest('div')
    expect(container?.className).toMatch(/bg-blue/)
  })

  it('color fallback — unknown color token renders with gray class without crashing', async () => {
    renderEditor(makeCalloutDoc('🧪', 'mauve', 'Some note'))

    expect(await screen.findByText('🧪')).toBeInTheDocument()
    expect(await screen.findByText('Some note')).toBeInTheDocument()

    const container = screen.getByText('🧪').closest('div')
    expect(container?.className).toMatch(/bg-gray/)
  })

  it('edit cycle — click text, change value, blur commits via updateAttributes', async () => {
    let editorRef: ReturnType<typeof useEditor> | null = null

    function EditorCapture({ doc }: { doc: unknown }) {
      const editor = useEditor({
        extensions: tiptapExtensions,
        content: doc as object,
      })
      editorRef = editor
      return <EditorContent editor={editor} />
    }

    render(<EditorCapture doc={makeCalloutDoc('💡', 'gray', 'Original text')} />)

    // Wait for NodeView to mount
    const displayButton = await screen.findByText('Original text')

    // Click to enter edit mode
    await act(async () => {
      fireEvent.click(displayButton)
    })

    // Find the input that appeared (use placeholder to avoid matching ProseMirror's role=textbox)
    const input = screen.getByPlaceholderText('Write a note…')
    expect(input).toBeInTheDocument()

    // Change the value
    await act(async () => {
      fireEvent.change(input, { target: { value: 'Updated text' } })
    })

    // Blur to commit
    await act(async () => {
      fireEvent.blur(input)
    })

    // Editor JSON should show updated text
    await waitFor(() => {
      const json = editorRef?.getJSON()
      const callout = json?.content?.[0]
      expect(callout?.attrs?.text).toBe('Updated text')
    })
  })

  it('Escape discards — edit mode then Escape leaves text unchanged', async () => {
    let editorRef: ReturnType<typeof useEditor> | null = null

    function EditorCapture({ doc }: { doc: unknown }) {
      const editor = useEditor({
        extensions: tiptapExtensions,
        content: doc as object,
      })
      editorRef = editor
      return <EditorContent editor={editor} />
    }

    render(<EditorCapture doc={makeCalloutDoc('🔒', 'gray', 'Keep this text')} />)

    const displayButton = await screen.findByText('Keep this text')

    await act(async () => {
      fireEvent.click(displayButton)
    })

    const input = screen.getByPlaceholderText('Write a note…')

    await act(async () => {
      fireEvent.change(input, { target: { value: 'Discarded change' } })
    })

    await act(async () => {
      fireEvent.keyDown(input, { key: 'Escape' })
    })

    // After Escape, editor JSON should still show original text
    await waitFor(() => {
      const json = editorRef?.getJSON()
      const callout = json?.content?.[0]
      expect(callout?.attrs?.text).toBe('Keep this text')
    })

    // The input should be gone
    expect(screen.queryByPlaceholderText('Write a note…')).toBeNull()
  })
})
