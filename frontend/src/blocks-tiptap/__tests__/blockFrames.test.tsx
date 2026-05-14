import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { useEditor, EditorContent } from '@tiptap/react'
import { tiptapExtensions } from '@/blocks-tiptap/extensions'
import { BlockFramesProvider } from '@/blocks-tiptap/blockFramesProvider'
import { DEFAULT_BLOCK_FRAMES } from '@/types'
import type { BlockFramesConfig } from '@/types'

// The provider reads the config through this hook; swap it per-test.
let mockConfig: BlockFramesConfig = { ...DEFAULT_BLOCK_FRAMES }

vi.mock('@/hooks/useBlockFramesConfig', () => ({
  useBlockFramesConfig: () => ({
    config: mockConfig,
    setConfig: vi.fn(),
    isLoading: false,
  }),
}))

beforeEach(() => {
  mockConfig = { ...DEFAULT_BLOCK_FRAMES }
})

afterEach(() => {
  vi.clearAllMocks()
})

function EditorHarness({ doc }: { doc: unknown }) {
  const editor = useEditor({
    extensions: tiptapExtensions,
    content: doc as object,
  })
  return (
    <BlockFramesProvider>
      <EditorContent editor={editor} />
    </BlockFramesProvider>
  )
}

// The provider updates the module-level config ref on mount, but the editor's
// onCreate (which registers the rebuild listener) fires asynchronously. Poll
// by re-dispatching the config-changed event on each retry until the rebuilt
// data-frame attribute appears — this mirrors how a real config change nudges
// an already-mounted editor.
async function expectFrame(
  container: HTMLElement,
  selector: string,
  expected: string,
): Promise<void> {
  await waitFor(() => {
    window.dispatchEvent(new CustomEvent('block-frames-config-changed'))
    const el = container.querySelector(selector)
    expect(el?.getAttribute('data-frame')).toBe(expected)
  })
}

const paragraphDoc = {
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hello' }] }],
}

const headingDoc = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Title' }] },
  ],
}

const calloutDoc = {
  type: 'doc',
  content: [{ type: 'callout', attrs: { icon: '💡', color: 'gray', text: 'note' } }],
}

describe('blockFrames data-frame decorations', () => {
  it('applies data-frame to paragraph nodes from config', async () => {
    mockConfig = { ...DEFAULT_BLOCK_FRAMES, paragraph: 'always' }
    const { container } = render(<EditorHarness doc={paragraphDoc} />)
    await expectFrame(container, '.ProseMirror > p', 'always')
  })

  it('collapses empty mode to always for atom nodes', async () => {
    // callout is an atom — content-emptiness does not apply, so 'empty'
    // must be written to the DOM as 'always'.
    mockConfig = { ...DEFAULT_BLOCK_FRAMES, callout: 'empty' }
    const { container } = render(<EditorHarness doc={calloutDoc} />)
    await expectFrame(container, '.ProseMirror > [data-frame]', 'always')
  })

  it('rebuilds data-frame on config change without remount', async () => {
    mockConfig = { ...DEFAULT_BLOCK_FRAMES, paragraph: 'never' }
    const { container, rerender } = render(<EditorHarness doc={paragraphDoc} />)
    await expectFrame(container, '.ProseMirror > p', 'never')

    mockConfig = { ...DEFAULT_BLOCK_FRAMES, paragraph: 'always' }
    rerender(<EditorHarness doc={paragraphDoc} />)
    await expectFrame(container, '.ProseMirror > p', 'always')
  })

  it('treats clean mode as empty in this phase', async () => {
    mockConfig = { ...DEFAULT_BLOCK_FRAMES, heading: 'clean' }
    const { container } = render(<EditorHarness doc={headingDoc} />)
    await expectFrame(container, '.ProseMirror > h1', 'empty')
  })
})
