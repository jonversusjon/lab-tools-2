import { useState, useRef, useEffect } from 'react'
import type { Editor } from '@tiptap/react'
import type { Node as PMNode } from '@tiptap/pm/model'

export interface BlockMenuProps {
  editor: Editor
  currentNode: PMNode | null
  currentNodePos: number
  onMenuOpenChange?: (open: boolean) => void
}

const PANEL_TYPES = new Set(['flow_panel', 'if_panel'])
const TEXT_CONVERTIBLE = new Set(['paragraph', 'heading'])

type ConvertTarget = {
  label: string
  command: (editor: Editor, pos: number) => void
}

const CONVERT_TARGETS: ConvertTarget[] = [
  {
    label: 'Paragraph',
    command: (editor, pos) =>
      editor.chain().focus().setTextSelection(pos + 1).setParagraph().run(),
  },
  {
    label: 'Heading 1',
    command: (editor, pos) =>
      editor.chain().focus().setTextSelection(pos + 1).setHeading({ level: 1 }).run(),
  },
  {
    label: 'Heading 2',
    command: (editor, pos) =>
      editor.chain().focus().setTextSelection(pos + 1).setHeading({ level: 2 }).run(),
  },
  {
    label: 'Heading 3',
    command: (editor, pos) =>
      editor.chain().focus().setTextSelection(pos + 1).setHeading({ level: 3 }).run(),
  },
]

export default function BlockMenu({
  editor,
  currentNode,
  currentNodePos,
  onMenuOpenChange,
}: BlockMenuProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [convertMenuOpen, setConvertMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  // Stable ref so onMenuOpenChange can be called inside effects without
  // causing stale-closure issues even when the prop reference changes.
  const onMenuOpenChangeRef = useRef(onMenuOpenChange)
  useEffect(() => {
    onMenuOpenChangeRef.current = onMenuOpenChange
  })

  const nodeType = currentNode?.type.name ?? null
  const isPanel = nodeType !== null && PANEL_TYPES.has(nodeType)
  const canConvert = nodeType !== null && TEXT_CONVERTIBLE.has(nodeType)
  const isColumn = nodeType === 'column'
  const currentHeadingLevel =
    nodeType === 'heading' ? (currentNode?.attrs?.level as number | undefined) : undefined

  function openMenu() {
    setMenuOpen(true)
    setConvertMenuOpen(false)
    onMenuOpenChangeRef.current?.(true)
  }

  function closeMenu() {
    setMenuOpen(false)
    setConvertMenuOpen(false)
    onMenuOpenChangeRef.current?.(false)
  }

  useEffect(() => {
    if (!menuOpen) return
    function handleOutsideClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
        setConvertMenuOpen(false)
        onMenuOpenChangeRef.current?.(false)
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setMenuOpen(false)
        setConvertMenuOpen(false)
        onMenuOpenChangeRef.current?.(false)
      }
    }
    document.addEventListener('mousedown', handleOutsideClick)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [menuOpen])

  function handleDelete() {
    if (currentNode === null) return
    if (isPanel) {
      if (!window.confirm('Delete this panel instance? Volume calculations will be lost.')) {
        return
      }
    }
    editor.chain().focus().setNodeSelection(currentNodePos).deleteSelection().run()
    closeMenu()
  }

  function handleDuplicate() {
    if (currentNode === null) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nodeJSON: any = currentNode.toJSON()
    // Clear _rowId so RowIdExtension mints a fresh UUID for the copy
    if (nodeJSON.attrs) {
      delete nodeJSON.attrs._rowId
    }
    const insertPos = currentNodePos + currentNode.nodeSize
    editor.chain().focus().insertContentAt(insertPos, nodeJSON).run()
    closeMenu()
  }

  function handleConvert(target: ConvertTarget) {
    if (currentNode === null) return
    target.command(editor, currentNodePos)
    closeMenu()
  }

  function handleInsertColumnLeft() {
    if (currentNode === null) return
    editor
      .chain()
      .focus()
      .insertContentAt(currentNodePos, {
        type: 'column',
        attrs: { width_pct: null },
        content: [{ type: 'paragraph' }],
      })
      .run()
    closeMenu()
  }

  function handleInsertColumnRight() {
    if (currentNode === null) return
    const insertPos = currentNodePos + currentNode.nodeSize
    editor
      .chain()
      .focus()
      .insertContentAt(insertPos, {
        type: 'column',
        attrs: { width_pct: null },
        content: [{ type: 'paragraph' }],
      })
      .run()
    closeMenu()
  }

  function handleClearColumn() {
    if (currentNode === null) return
    const from = currentNodePos + 1
    const to = currentNodePos + currentNode.nodeSize - 1
    if (from >= to) return
    editor
      .chain()
      .focus()
      .deleteRange({ from, to })
      .insertContentAt(from, { type: 'paragraph' })
      .run()
    closeMenu()
  }

  const filteredConvertTargets = CONVERT_TARGETS.filter((t) => {
    if (nodeType === 'paragraph' && t.label === 'Paragraph') return false
    if (nodeType === 'heading') {
      if (t.label === 'Heading 1' && currentHeadingLevel === 1) return false
      if (t.label === 'Heading 2' && currentHeadingLevel === 2) return false
      if (t.label === 'Heading 3' && currentHeadingLevel === 3) return false
    }
    return true
  })

  return (
    <div className="flex items-center gap-0.5 relative" ref={menuRef}>
      <span
        className="text-foreground-subtle text-sm select-none cursor-grab"
        title="Drag to reorder"
        data-testid="drag-grip"
      >
        ⠿
      </span>

      <button
        type="button"
        title="Block options"
        data-testid="block-menu-trigger"
        className="flex items-center justify-center w-5 h-5 text-foreground-subtle hover:text-foreground hover:bg-hover rounded text-xs"
        onClick={(e) => {
          e.stopPropagation()
          if (menuOpen) closeMenu()
          else openMenu()
        }}
      >
        ···
      </button>

      {menuOpen && currentNode !== null && (
        <div
          className="absolute left-0 top-full mt-1 z-50 bg-elevated border border-border rounded-lg shadow-lg py-1 min-w-[160px]"
          data-testid="block-menu-dropdown"
        >
          <button
            type="button"
            onClick={handleDuplicate}
            className="w-full px-3 py-2 flex items-center gap-2 hover:bg-hover cursor-pointer text-sm text-foreground rounded"
            data-testid="block-menu-duplicate"
          >
            Duplicate
          </button>

          {canConvert && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setConvertMenuOpen((prev) => !prev)}
                className="w-full px-3 py-2 flex items-center justify-between hover:bg-hover cursor-pointer text-sm text-foreground rounded"
                data-testid="block-menu-convert"
              >
                <span>Convert to</span>
                <span className="text-xs text-foreground-subtle">▶</span>
              </button>
              {convertMenuOpen && (
                <div className="absolute left-full top-0 ml-0.5 z-50 bg-elevated border border-border rounded-lg shadow-lg py-1 min-w-[140px]">
                  {filteredConvertTargets.map((target) => (
                    <button
                      key={target.label}
                      type="button"
                      onClick={() => handleConvert(target)}
                      className="w-full px-3 py-2 flex items-center gap-2 hover:bg-hover cursor-pointer text-sm text-foreground rounded"
                      data-testid={'block-menu-convert-' + target.label.toLowerCase().replace(/\s+/g, '-')}
                    >
                      {target.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {isColumn && (
            <>
              <button
                type="button"
                onClick={handleInsertColumnLeft}
                className="w-full px-3 py-2 flex items-center gap-2 hover:bg-hover cursor-pointer text-sm text-foreground rounded"
                data-testid="block-menu-insert-left"
              >
                Insert column left
              </button>
              <button
                type="button"
                onClick={handleInsertColumnRight}
                className="w-full px-3 py-2 flex items-center gap-2 hover:bg-hover cursor-pointer text-sm text-foreground rounded"
                data-testid="block-menu-insert-right"
              >
                Insert column right
              </button>
              <button
                type="button"
                onClick={handleClearColumn}
                className="w-full px-3 py-2 flex items-center gap-2 hover:bg-hover cursor-pointer text-sm text-foreground rounded"
                data-testid="block-menu-clear-column"
              >
                Clear column
              </button>
            </>
          )}

          <div className="border-t border-border my-1" />

          <button
            type="button"
            onClick={handleDelete}
            className="w-full px-3 py-2 flex items-center gap-2 hover:bg-red-50 dark:hover:bg-red-900/20 cursor-pointer text-sm text-red-600 dark:text-red-400 rounded"
            data-testid="block-menu-delete"
          >
            Delete
          </button>
        </div>
      )}
    </div>
  )
}
