import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Editor } from '@tiptap/core'
import { tiptapExtensions } from '@/blocks-tiptap/extensions'

let editor: Editor

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

beforeEach(() => {
  const element = document.createElement('div')
  editor = new Editor({
    element,
    extensions: tiptapExtensions,
    content: { type: 'doc', content: [{ type: 'paragraph' }] },
  })
})

afterEach(() => {
  editor.destroy()
})

function findNode(predicate: (type: string) => boolean): {
  node: any
  pos: number
} | null {
  let result: { node: any; pos: number } | null = null
  editor.state.doc.descendants((node, pos) => {
    if (result) return false
    if (predicate(node.type.name)) {
      result = { node, pos }
      return false
    }
    return undefined
  })
  return result
}

describe('RowIdExtension auto-populate plugin', () => {
  it('populates _rowId on a newly inserted paragraph', () => {
    editor.commands.insertContent({
      type: 'paragraph',
      content: [{ type: 'text', text: 'fresh' }],
    })

    const allParas: any[] = []
    editor.state.doc.descendants((node) => {
      if (node.type.name === 'paragraph') allParas.push(node)
    })
    expect(allParas.length).toBeGreaterThan(0)
    for (const p of allParas) {
      expect(typeof p.attrs._rowId).toBe('string')
      expect(p.attrs._rowId).toMatch(UUID_RE)
    }
  })

  it('does not populate _rowId on synthetic wrappers (bulletList) but does on listItem children', () => {
    editor.commands.setContent({
      type: 'doc',
      content: [
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [
                { type: 'paragraph', content: [{ type: 'text', text: 'a' }] },
              ],
            },
            {
              type: 'listItem',
              content: [
                { type: 'paragraph', content: [{ type: 'text', text: 'b' }] },
              ],
            },
          ],
        },
      ],
    })

    let bulletListNode: any = null
    const listItems: any[] = []
    editor.state.doc.descendants((node) => {
      if (node.type.name === 'bulletList') bulletListNode = node
      if (node.type.name === 'listItem') listItems.push(node)
    })

    expect(bulletListNode).not.toBeNull()
    expect(bulletListNode.attrs._rowId).toBeNull()
    expect(listItems.length).toBe(2)
    for (const item of listItems) {
      expect(typeof item.attrs._rowId).toBe('string')
      expect(item.attrs._rowId).toMatch(UUID_RE)
    }
  })

  it('preserves an existing _rowId across transactions', () => {
    const presetId = 'preset-id-' + crypto.randomUUID()
    editor.commands.setContent({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          attrs: { _rowId: presetId },
          content: [{ type: 'text', text: 'kept' }],
        },
      ],
    })

    const before = findNode((t) => t === 'paragraph')
    expect(before?.node.attrs._rowId).toBe(presetId)

    // Dispatch any transaction (cursor move) and confirm the id is preserved.
    editor.commands.focus('end')
    editor.commands.insertContent(' more text')

    const found: any[] = []
    editor.state.doc.descendants((node) => {
      if (node.type.name === 'paragraph') found.push(node)
    })
    expect(found.some((n) => n.attrs._rowId === presetId)).toBe(true)
  })
})
