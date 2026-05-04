import { describe, it, expect } from 'vitest'
import { Editor } from '@tiptap/core'
import type { JSONContent } from '@tiptap/core'
import { filterItems, SLASH_MENU_ITEMS } from '@/blocks-tiptap/slashMenu/items'
import { tiptapExtensions } from '@/blocks-tiptap/extensions'

function makeEditor(): Editor {
  return new Editor({
    extensions: tiptapExtensions,
    content: { type: 'doc', content: [{ type: 'paragraph' }] },
  })
}

describe('slash menu — filter', () => {
  it('1. empty query returns all 13 items', () => {
    const result = filterItems('')
    expect(result).toHaveLength(13)
    expect(result).toBe(SLASH_MENU_ITEMS)
  })

  it('2. partial title match — "head" returns exactly 3 heading items', () => {
    const result = filterItems('head')
    expect(result).toHaveLength(3)
    expect(result.map((i) => i.title)).toEqual(['Heading 1', 'Heading 2', 'Heading 3'])
  })

  it('3. keyword match — "cyto" returns exactly the Flow panel item', () => {
    const result = filterItems('cyto')
    expect(result).toHaveLength(1)
    expect(result[0].title).toBe('Flow panel')
  })

  it('4. no match returns empty array', () => {
    const result = filterItems('xyzzy')
    expect(result).toHaveLength(0)
  })
})

describe('slash menu — command dispatch', () => {
  it('5. Callout command inserts a callout node', () => {
    const editor = makeEditor()
    const calloutItem = SLASH_MENU_ITEMS.find((item) => item.title === 'Callout')
    expect(calloutItem).toBeDefined()

    // range covers position 1 (inside the empty paragraph)
    calloutItem!.command(editor, { from: 1, to: 1 })

    const json = editor.getJSON() as JSONContent
    const hasCallout = (json.content ?? []).some((node) => node.type === 'callout')
    expect(hasCallout).toBe(true)

    editor.destroy()
  })
})
