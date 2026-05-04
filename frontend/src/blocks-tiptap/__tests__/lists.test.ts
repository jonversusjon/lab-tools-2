import { describe, it, expect } from 'vitest'
import { Editor, type JSONContent } from '@tiptap/core'
import { tiptapExtensions } from '@/blocks-tiptap/extensions'

function makeEditor(content: object): Editor {
  return new Editor({
    extensions: tiptapExtensions,
    content,
  })
}

describe('lists — regression tests', () => {
  it('1. Enter creates new list item in bulletList', () => {
    const editor = makeEditor({
      type: 'doc',
      content: [
        {
          type: 'bulletList',
          content: [
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'first' }] }] },
          ],
        },
      ],
    })

    // Place cursor at end of "first"
    editor.commands.focus('end')
    editor.commands.splitListItem('listItem')

    const json = editor.getJSON() as JSONContent
    const list = json.content?.[0]
    expect(list?.type).toBe('bulletList')
    expect(list?.content).toHaveLength(2)
    // Second item exists (may be empty paragraph)
    expect(list?.content?.[1]?.type).toBe('listItem')

    editor.destroy()
  })

  it('2. Backspace at empty list item lifts it to paragraph', () => {
    const editor = makeEditor({
      type: 'doc',
      content: [
        {
          type: 'bulletList',
          content: [
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'first' }] }] },
            { type: 'listItem', content: [{ type: 'paragraph' }] },
          ],
        },
      ],
    })

    // Select inside the second (empty) listItem paragraph
    const { doc } = editor.state
    // Find position of the empty paragraph in the second listItem
    let emptyParaPos = -1
    doc.descendants((node, pos) => {
      if (node.type.name === 'paragraph' && node.content.size === 0 && emptyParaPos === -1) {
        // Ensure it's inside a listItem (second occurrence)
        emptyParaPos = pos
      }
    })

    editor.commands.setTextSelection(emptyParaPos + 1)
    editor.commands.liftEmptyBlock()

    const json = editor.getJSON() as JSONContent
    // After lifting, we should have a bulletList (with "first") and a top-level paragraph
    const list = json.content?.find((n) => n.type === 'bulletList')
    const lifted = json.content?.find((n) => n.type === 'paragraph')
    expect(list).toBeDefined()
    expect(list?.content).toHaveLength(1)
    expect(lifted).toBeDefined()

    editor.destroy()
  })

  it('3. Tab nests second list item under first', () => {
    const editor = makeEditor({
      type: 'doc',
      content: [
        {
          type: 'bulletList',
          content: [
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'parent' }] }] },
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'child' }] }] },
          ],
        },
      ],
    })

    // Place cursor in second listItem
    editor.commands.focus('end')
    // Move to start of "child" text
    const { doc } = editor.state
    let childPos = -1
    doc.descendants((node, pos) => {
      if (node.type.name === 'text' && node.text === 'child') {
        childPos = pos
      }
    })
    editor.commands.setTextSelection(childPos)
    editor.commands.sinkListItem('listItem')

    const json = editor.getJSON() as JSONContent
    const list = json.content?.[0]
    expect(list?.type).toBe('bulletList')
    // Should still have one top-level listItem
    expect(list?.content).toHaveLength(1)
    // The parent listItem should contain a nested bulletList
    const parentItem = list?.content?.[0]
    const nestedList = parentItem?.content?.find((n) => n.type === 'bulletList')
    expect(nestedList).toBeDefined()
    expect(nestedList?.content).toHaveLength(1)

    editor.destroy()
  })

  it('4. Shift-Tab un-nests a nested list item', () => {
    const editor = makeEditor({
      type: 'doc',
      content: [
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [
                { type: 'paragraph', content: [{ type: 'text', text: 'parent' }] },
                {
                  type: 'bulletList',
                  content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'child' }] }] },
                  ],
                },
              ],
            },
          ],
        },
      ],
    })

    // Cursor in the nested child
    const { doc } = editor.state
    let childPos = -1
    doc.descendants((node, pos) => {
      if (node.type.name === 'text' && node.text === 'child') {
        childPos = pos
      }
    })
    editor.commands.setTextSelection(childPos)
    editor.commands.liftListItem('listItem')

    const json = editor.getJSON() as JSONContent
    const list = json.content?.[0]
    expect(list?.type).toBe('bulletList')
    // After lifting, should have 2 top-level listItems
    expect(list?.content).toHaveLength(2)

    editor.destroy()
  })

  it('5. Enter creates new item in orderedList', () => {
    const editor = makeEditor({
      type: 'doc',
      content: [
        {
          type: 'orderedList',
          content: [
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'step one' }] }] },
          ],
        },
      ],
    })

    editor.commands.focus('end')
    editor.commands.splitListItem('listItem')

    const json = editor.getJSON() as JSONContent
    const list = json.content?.[0]
    expect(list?.type).toBe('orderedList')
    expect(list?.content).toHaveLength(2)
    expect(list?.content?.[1]?.type).toBe('listItem')

    editor.destroy()
  })
})
