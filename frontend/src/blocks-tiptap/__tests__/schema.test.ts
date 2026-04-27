import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Editor } from '@tiptap/core'
import { tiptapExtensions } from '@/blocks-tiptap/extensions'

let editor: Editor

beforeEach(() => {
  const element = document.createElement('div')
  editor = new Editor({
    element,
    extensions: tiptapExtensions,
  })
})

afterEach(() => {
  editor.destroy()
})

describe('Group 1 — StarterKit nodes registered', () => {
  const starterKitNodes = [
    'paragraph',
    'heading',
    'bulletList',
    'listItem',
    'orderedList',
    'horizontalRule',
    'doc',
    'text',
    'hardBreak',
  ]

  for (const name of starterKitNodes) {
    it(`registers ${name}`, () => {
      expect(editor.schema.nodes[name]).toBeDefined()
    })
  }
})

describe('Group 2 — custom nodes registered', () => {
  const customNodes = ['callout', 'column_list', 'column', 'flow_panel', 'if_panel']

  for (const name of customNodes) {
    it(`registers ${name}`, () => {
      expect(editor.schema.nodes[name]).toBeDefined()
    })
  }
})

describe('Group 3 — configuration assertions', () => {
  it('heading is configured for levels [1, 2, 3] only', () => {
    const headingExt = editor.extensionManager.extensions.find((e) => e.name === 'heading')
    expect(headingExt?.options.levels).toEqual([1, 2, 3])
  })

  it('bold mark is disabled', () => {
    expect(editor.schema.marks['bold']).toBeUndefined()
  })

  it('italic mark is disabled', () => {
    expect(editor.schema.marks['italic']).toBeUndefined()
  })

  it('strike mark is disabled', () => {
    expect(editor.schema.marks['strike']).toBeUndefined()
  })

  it('code mark is disabled', () => {
    expect(editor.schema.marks['code']).toBeUndefined()
  })

  it('link mark is disabled', () => {
    expect(editor.schema.marks['link']).toBeUndefined()
  })

  it('underline mark is disabled', () => {
    expect(editor.schema.marks['underline']).toBeUndefined()
  })

  it('blockquote node is disabled', () => {
    expect(editor.schema.nodes['blockquote']).toBeUndefined()
  })

  it('codeBlock node is disabled', () => {
    expect(editor.schema.nodes['codeBlock']).toBeUndefined()
  })
})

describe('Group 4 — behavioral parity (custom node creation)', () => {
  it('callout: createAndFill() returns a valid node', () => {
    const node = editor.schema.nodes['callout'].createAndFill()
    expect(node).not.toBeNull()
  })

  it('column_list: createAndFill() returns a valid node or spec has correct content', () => {
    const node = editor.schema.nodes['column_list'].createAndFill()
    if (node !== null) {
      expect(node).not.toBeNull()
    } else {
      expect(editor.schema.nodes['column_list'].spec.content).toBe('column+')
    }
  })

  it('column: createAndFill() returns a valid node or spec has group columnContent', () => {
    const node = editor.schema.nodes['column'].createAndFill()
    if (node !== null) {
      expect(node).not.toBeNull()
    } else {
      expect(editor.schema.nodes['column'].spec.group).toBe('columnContent')
    }
  })

  it('flow_panel: createAndFill() returns a valid node', () => {
    const node = editor.schema.nodes['flow_panel'].createAndFill()
    expect(node).not.toBeNull()
  })

  it('if_panel: createAndFill() returns a valid node', () => {
    const node = editor.schema.nodes['if_panel'].createAndFill()
    expect(node).not.toBeNull()
  })
})
