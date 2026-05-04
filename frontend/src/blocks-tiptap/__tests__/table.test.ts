import { describe, it, expect } from 'vitest'
import { Editor, type JSONContent } from '@tiptap/core'
import { tiptapExtensions } from '@/blocks-tiptap/extensions'

function makeEditor(content?: object): Editor {
  return new Editor({
    extensions: tiptapExtensions,
    content: content ?? { type: 'doc', content: [{ type: 'paragraph' }] },
  })
}

describe('table — editor integration', () => {
  it('1. seeded table renders correct structure', () => {
    const editor = makeEditor({
      type: 'doc',
      content: [
        {
          type: 'table',
          content: [
            {
              type: 'tableRow',
              content: [
                { type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Name' }] }] },
                { type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Age' }] }] },
              ],
            },
            {
              type: 'tableRow',
              content: [
                { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Alice' }] }] },
                { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: '30' }] }] },
              ],
            },
          ],
        },
      ],
    })

    const json = editor.getJSON() as JSONContent
    const table = json.content?.[0]
    expect(table?.type).toBe('table')
    expect(table?.content).toHaveLength(2)
    // First row: header cells
    const firstRow = table?.content?.[0]
    expect(firstRow?.type).toBe('tableRow')
    expect(firstRow?.content?.[0]?.type).toBe('tableHeader')
    expect(firstRow?.content?.[1]?.type).toBe('tableHeader')
    // Second row: data cells
    const secondRow = table?.content?.[1]
    expect(secondRow?.content?.[0]?.type).toBe('tableCell')
    expect(secondRow?.content?.[1]?.type).toBe('tableCell')

    editor.destroy()
  })

  it('2. insertTable command inserts correct structure', () => {
    const editor = makeEditor()
    editor.commands.insertTable({ rows: 2, cols: 3, withHeaderRow: true })

    const json = editor.getJSON() as JSONContent
    const table = json.content?.find((n) => n.type === 'table')
    expect(table).toBeDefined()
    expect(table?.content).toHaveLength(2)

    const headerRow = table?.content?.[0]
    expect(headerRow?.type).toBe('tableRow')
    expect(headerRow?.content).toHaveLength(3)
    expect(headerRow?.content?.every((c: JSONContent) => c.type === 'tableHeader')).toBe(true)

    const dataRow = table?.content?.[1]
    expect(dataRow?.content).toHaveLength(3)
    expect(dataRow?.content?.every((c: JSONContent) => c.type === 'tableCell')).toBe(true)

    editor.destroy()
  })
})
