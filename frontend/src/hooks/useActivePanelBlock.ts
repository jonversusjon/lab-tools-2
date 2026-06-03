import { useEffect, useState } from 'react'
import type { Editor } from '@tiptap/react'
import { NodeSelection } from '@tiptap/pm/state'
import type { Node as PMNode } from '@tiptap/pm/model'

export type PanelBlockType = 'flow_panel' | 'if_panel'

export interface ActivePanelBlock {
  rowId: string
  blockType: PanelBlockType
  attrs: Record<string, unknown>
}

const PANEL_TYPES = new Set<string>(['flow_panel', 'if_panel'])

function findPanelNodeByRowId(editor: Editor, rowId: string): PMNode | null {
  let found: PMNode | null = null
  editor.state.doc.descendants((node) => {
    if (found) return false
    if (PANEL_TYPES.has(node.type.name) && node.attrs._rowId === rowId) {
      found = node
      return false
    }
    return true
  })
  return found
}

function toActive(node: PMNode): ActivePanelBlock | null {
  const rowId = node.attrs._rowId
  if (typeof rowId !== 'string') return null
  return {
    rowId,
    blockType: node.type.name as PanelBlockType,
    attrs: node.attrs,
  }
}

/**
 * Tracks which flow/IF panel block is currently "active" on the experiment
 * page, so the spectral rail can follow the user's focus.
 *
 * Activation is DOM-driven: panels are atom node-views with their own
 * interactive UI, so clicking an internal control does not reliably move the
 * ProseMirror selection onto the node. We therefore listen (capture phase) for
 * pointer/focus events inside the editor and resolve the nearest ancestor
 * carrying `data-panel-block` (set by the panel node views). A NodeSelection on
 * a panel (keyboard nav / drag handle) is an additional activation path.
 *
 * Clicking a non-panel block inside the editor clears the active panel (the
 * rail auto-hides). Clicking outside the editor entirely — e.g. the rail
 * itself — leaves the active panel intact.
 */
export function useActivePanelBlock(editor: Editor | null): ActivePanelBlock | null {
  const [active, setActive] = useState<ActivePanelBlock | null>(null)

  useEffect(() => {
    if (!editor) {
      setActive(null)
      return
    }

    const resolveRowId = (target: EventTarget | null): string | null => {
      if (!(target instanceof HTMLElement)) return null
      const panelEl = target.closest('[data-panel-block]')
      return panelEl?.getAttribute('data-panel-row-id') ?? null
    }

    const activateFromRowId = (rowId: string | null) => {
      if (!rowId) {
        setActive(null)
        return
      }
      const node = findPanelNodeByRowId(editor, rowId)
      setActive(node ? toActive(node) : null)
    }

    // Primary: any pointer/focus inside the editor. A panel ancestor activates
    // it; anything else inside the editor clears it.
    const onPointerDown = (e: Event) => activateFromRowId(resolveRowId(e.target))
    const onFocusIn = (e: Event) => {
      const rowId = resolveRowId(e.target)
      if (rowId) activateFromRowId(rowId)
    }

    // The editor object can exist before its ProseMirror view is mounted
    // (`editor.view` is a proxy that THROWS until then). Defer touching
    // `view.dom` until the `create` event fires; attach immediately if the
    // view is already up.
    let dom: HTMLElement | null = null
    const attachDomListeners = () => {
      dom = editor.view.dom
      dom.addEventListener('pointerdown', onPointerDown, true)
      dom.addEventListener('focusin', onFocusIn, true)
    }
    if (editor.isInitialized) {
      attachDomListeners()
    } else {
      // `on` (not `once`) so the cleanup's `off(...)` can remove it by
      // reference if we unmount before the view mounts. `create` fires at
      // most once per editor, so there is no risk of double attachment.
      editor.on('create', attachDomListeners)
    }

    // Secondary: keyboard/drag-handle NodeSelection onto a panel.
    const onSelectionUpdate = () => {
      const sel = editor.state.selection
      if (sel instanceof NodeSelection && PANEL_TYPES.has(sel.node.type.name)) {
        setActive(toActive(sel.node))
      }
    }

    // Keep the active panel's attrs fresh as its content changes; drop it if
    // the block is deleted.
    const onTransaction = ({ transaction }: { transaction: { docChanged: boolean } }) => {
      if (!transaction.docChanged) return
      setActive((prev) => {
        if (!prev) return prev
        const node = findPanelNodeByRowId(editor, prev.rowId)
        if (!node) return null
        // Identity-stable: ProseMirror keeps the same attrs object when this
        // node was untouched (e.g. an edit elsewhere in the doc) — avoid a
        // needless rail re-render in that case.
        if (node.attrs === prev.attrs) return prev
        return toActive(node)
      })
    }

    editor.on('selectionUpdate', onSelectionUpdate)
    editor.on('transaction', onTransaction)

    return () => {
      editor.off('create', attachDomListeners)
      if (dom) {
        dom.removeEventListener('pointerdown', onPointerDown, true)
        dom.removeEventListener('focusin', onFocusIn, true)
      }
      editor.off('selectionUpdate', onSelectionUpdate)
      editor.off('transaction', onTransaction)
    }
  }, [editor])

  return active
}
