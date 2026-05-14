import { Extension } from '@tiptap/core'
import { NodeSelection } from '@tiptap/pm/state'
import { duplicateBlockAtPos } from './duplicateBlock'

// Global keyboard shortcut (Mod-Shift-D) that duplicates the top-level block
// containing the current selection. Mirrors the BlockMenu "Duplicate" item;
// both call `duplicateBlockAtPos`.
export const DuplicateShortcut = Extension.create({
  name: 'duplicateShortcut',
  addKeyboardShortcuts() {
    return {
      'Mod-Shift-d': () => {
        const { editor } = this
        const { selection } = editor.state
        let blockPos: number
        if (selection instanceof NodeSelection) {
          // A selected atom block (flow_panel, if_panel, divider): `from`
          // is already the position of the block.
          blockPos = selection.from
        } else {
          const $pos = editor.state.doc.resolve(selection.from)
          if ($pos.depth === 0) return false
          // Walk up to the top-level block ancestor.
          blockPos = $pos.before(1)
        }
        duplicateBlockAtPos(editor, blockPos)
        return true
      },
    }
  },
})
