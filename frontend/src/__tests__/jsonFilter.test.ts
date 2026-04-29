import { describe, it, expect } from 'vitest'
import { filterJsonTree } from '@/utils/jsonFilter'

describe('filterJsonTree', () => {
  it('returns the input unchanged when filter is empty', () => {
    const input = { a: { b: 'hello' } }
    expect(filterJsonTree(input, '')).toStrictEqual(input)
  })

  it('retains matching path on substring match, returns null when no match', () => {
    const input = { a: { b: { c: 'hello' } } }
    expect(filterJsonTree(input, 'hello')).toStrictEqual({ a: { b: { c: 'hello' } } })
    expect(filterJsonTree(input, 'xyz')).toBeNull()
  })

  it('retains entire subtree when key matches', () => {
    const input = {
      column_list: { content: ['item1', 'item2'] },
      other: { value: 'nope' },
    }
    const result = filterJsonTree(input, 'column_list')
    expect(result).toStrictEqual({ column_list: { content: ['item1', 'item2'] } })
  })
})
