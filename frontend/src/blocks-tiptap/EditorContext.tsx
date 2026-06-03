import { createContext, useContext } from 'react'
import type { ReactNode } from 'react'
import type { Editor } from '@tiptap/react'

/**
 * Exposes the experiment page's live Tiptap editor instance to sibling UI
 * (the spectral rail today; the calculations rail later). The rail must read
 * the live doc/selection rather than the TanStack cache, which lags behind the
 * save debounce. Kept intentionally thin.
 */
const EditorContext = createContext<Editor | null>(null)

export function EditorProvider({
  editor,
  children,
}: {
  editor: Editor | null
  children: ReactNode
}) {
  return <EditorContext.Provider value={editor}>{children}</EditorContext.Provider>
}

export function useEditorInstance(): Editor | null {
  return useContext(EditorContext)
}
