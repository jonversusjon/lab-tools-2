import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { Editor, Node } from '@tiptap/core'
import Document from '@tiptap/extension-document'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import { useActivePanelBlock } from '@/hooks/useActivePanelBlock'

// Lightweight stand-in for the flow_panel node — same name/atom shape, but no
// heavy React node view. The hook inspects the doc model + selection, so this
// is sufficient and avoids mounting the real panel designer.
const StubFlowPanel = Node.create({
  name: 'flow_panel',
  group: 'block',
  atom: true,
  selectable: true,
  addAttributes() {
    return {
      _rowId: { default: null },
      name: { default: '' },
      targets: { default: [] },
      assignments: { default: [] },
      instrument: { default: null },
    }
  },
  parseHTML() {
    return [{ tag: 'div[data-block-type="flow_panel"]' }]
  },
  renderHTML() {
    return ['div', { 'data-block-type': 'flow_panel' }]
  },
})

const extensions = [Document, Paragraph, Text, StubFlowPanel]

let editor: Editor

function panelPos(): number {
  let pos = -1
  editor.state.doc.descendants((node, p) => {
    if (node.type.name === 'flow_panel') {
      pos = p
      return false
    }
    return undefined
  })
  return pos
}

beforeEach(() => {
  const element = document.createElement('div')
  editor = new Editor({
    element,
    extensions,
    content: {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'intro' }] },
        { type: 'flow_panel', attrs: { _rowId: 'fp1', name: 'Panel A' } },
      ],
    },
  })
})

afterEach(() => {
  editor.destroy()
})

describe('useActivePanelBlock', () => {
  it('starts with no active panel', () => {
    const { result } = renderHook(() => useActivePanelBlock(editor))
    expect(result.current).toBeNull()
  })

  it('activates the panel on a NodeSelection', () => {
    const { result } = renderHook(() => useActivePanelBlock(editor))
    act(() => {
      editor.commands.setNodeSelection(panelPos())
    })
    expect(result.current?.rowId).toBe('fp1')
    expect(result.current?.blockType).toBe('flow_panel')
    expect(result.current?.attrs.name).toBe('Panel A')
  })

  it('refreshes attrs when the active panel content changes', () => {
    const { result } = renderHook(() => useActivePanelBlock(editor))
    act(() => {
      editor.commands.setNodeSelection(panelPos())
    })
    act(() => {
      editor.commands.updateAttributes('flow_panel', { name: 'Renamed' })
    })
    expect(result.current?.attrs.name).toBe('Renamed')
  })

  it('clears the active panel when it is deleted', () => {
    const { result } = renderHook(() => useActivePanelBlock(editor))
    act(() => {
      editor.commands.setNodeSelection(panelPos())
    })
    expect(result.current?.rowId).toBe('fp1')
    act(() => {
      editor.chain().focus().deleteSelection().run()
    })
    expect(result.current).toBeNull()
  })

  it('returns null when given a null editor', () => {
    const { result } = renderHook(() => useActivePanelBlock(null))
    expect(result.current).toBeNull()
  })

  // Regression: in Tiptap v3 the editor object can exist before its
  // ProseMirror view is mounted, and `editor.view` is a proxy that THROWS
  // until then. The hook must not touch `view.dom` while uninitialized — it
  // must wait for the `create` event. (Previously this crashed ExperimentRail.)
  it('does not access the view before the editor is initialized', () => {
    const listeners: Record<string, Array<(...a: unknown[]) => void>> = {}
    let domAttached = false
    const fakeView = {
      dom: {
        addEventListener: () => {
          domAttached = true
        },
        removeEventListener: () => {},
      },
    }
    let mountedView: typeof fakeView | null = null
    const pendingEditor = {
      isInitialized: false,
      get view() {
        if (!mountedView) throw new Error('view not available')
        return mountedView
      },
      on(event: string, fn: (...a: unknown[]) => void) {
        ;(listeners[event] ??= []).push(fn)
      },
      off(event: string, fn: (...a: unknown[]) => void) {
        listeners[event] = (listeners[event] ?? []).filter((f) => f !== fn)
      },
    }

    // Mounting must not throw even though `view` is unavailable.
    const { unmount } = renderHook(() =>
      useActivePanelBlock(pendingEditor as unknown as Editor)
    )
    expect(domAttached).toBe(false)
    expect(listeners.create?.length).toBe(1)

    // Once the view mounts, the create handler wires up the DOM listeners.
    act(() => {
      mountedView = fakeView
      pendingEditor.isInitialized = true
      listeners.create.forEach((fn) => fn())
    })
    expect(domAttached).toBe(true)

    // Cleanup detaches the create handler by reference.
    unmount()
    expect(listeners.create.length).toBe(0)
  })
})
