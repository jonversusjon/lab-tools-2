import { describe, it, expect } from 'vitest'
import { Schema, Fragment, Slice } from '@tiptap/pm/model'
import { stripRowIdsFromSlice } from './transformPasted'

// Minimal schema with _rowId attribute — just enough to validate strip logic.
const testSchema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: {
      group: 'block',
      content: 'text*',
      attrs: { _rowId: { default: null } },
      toDOM: () => ['p', 0] as const,
    },
    column: {
      group: 'block',
      content: 'block+',
      attrs: {
        _rowId: { default: null },
        width_pct: { default: 50 },
      },
      toDOM: () => ['div', 0] as const,
    },
    text: { group: 'inline' },
  },
})

function makeSliceWithRowIds(): Slice {
  // column[_rowId='col-1', width_pct=50] > paragraph[_rowId='p-1'] > text 'hello'
  const text = testSchema.text('hello')
  const para = testSchema.nodes.paragraph.create(
    { _rowId: 'p-1' },
    Fragment.from(text)
  )
  const column = testSchema.nodes.column.create(
    { _rowId: 'col-1', width_pct: 50 },
    Fragment.from(para)
  )
  return new Slice(Fragment.from(column), 0, 0)
}

describe('stripRowIdsFromSlice', () => {
  it('strips _rowId from a single top-level node', () => {
    const para = testSchema.nodes.paragraph.create({ _rowId: 'abc' })
    const slice = new Slice(Fragment.from(para), 0, 0)
    const stripped = stripRowIdsFromSlice(slice)
    const node = stripped.content.firstChild!
    // ProseMirror fills in the attr default (null) when _rowId is removed
    expect(node.attrs._rowId).toBe(null)
  })

  it('strips _rowId from nested children recursively', () => {
    const slice = makeSliceWithRowIds()
    const stripped = stripRowIdsFromSlice(slice)
    const column = stripped.content.firstChild!
    const para = column.content.firstChild!
    expect(column.attrs._rowId).toBe(null)
    expect(para.attrs._rowId).toBe(null)
  })

  it('preserves other attrs (width_pct, etc.)', () => {
    const slice = makeSliceWithRowIds()
    const stripped = stripRowIdsFromSlice(slice)
    const column = stripped.content.firstChild!
    expect(column.attrs.width_pct).toBe(50)
  })

  it('preserves text content', () => {
    const slice = makeSliceWithRowIds()
    const stripped = stripRowIdsFromSlice(slice)
    const text = stripped.content.firstChild!.content.firstChild!.content.firstChild!
    expect(text.text).toBe('hello')
  })

  it('handles a slice with no _rowId attrs gracefully', () => {
    const para = testSchema.nodes.paragraph.create({})
    const slice = new Slice(Fragment.from(para), 0, 0)
    const stripped = stripRowIdsFromSlice(slice)
    expect(() => stripped.content.firstChild).not.toThrow()
  })

  it('preserves slice openStart and openEnd', () => {
    const para = testSchema.nodes.paragraph.create({ _rowId: 'abc' })
    const slice = new Slice(Fragment.from(para), 1, 2)
    const stripped = stripRowIdsFromSlice(slice)
    expect(stripped.openStart).toBe(1)
    expect(stripped.openEnd).toBe(2)
  })
})
