import { describe, it, expect } from 'vitest'
import { stableStringify } from './stableStringify'

describe('stableStringify', () => {
  it('serializes primitives identically to JSON.stringify', () => {
    expect(stableStringify(42)).toBe('42')
    expect(stableStringify('hello')).toBe('"hello"')
    expect(stableStringify(true)).toBe('true')
    expect(stableStringify(null)).toBe('null')
  })

  it('produces same output regardless of key insertion order', () => {
    const a = { foo: 1, bar: 2 }
    const b = { bar: 2, foo: 1 }
    expect(stableStringify(a)).toBe(stableStringify(b))
  })

  it('recurses into nested objects with stable ordering', () => {
    const a = { outer: { z: 1, a: 2 }, top: 'x' }
    const b = { top: 'x', outer: { a: 2, z: 1 } }
    expect(stableStringify(a)).toBe(stableStringify(b))
  })

  it('preserves array order (arrays are ordered)', () => {
    const arr1 = [3, 1, 2]
    const arr2 = [1, 2, 3]
    expect(stableStringify(arr1)).not.toBe(stableStringify(arr2))
  })

  it('handles flow_panel-shaped content with reordered keys identically', () => {
    const wireOrder = {
      source_panel_id: null,
      name: 'Demo',
      instrument: null,
      targets: [],
      assignments: [],
      volume_params: {
        num_samples: 1,
        volume_per_sample_ul: 100,
        pipet_error_factor: 1.1,
        dilution_source: 'flow',
      },
    }
    const tiptapOrder = {
      volume_params: {
        dilution_source: 'flow',
        pipet_error_factor: 1.1,
        volume_per_sample_ul: 100,
        num_samples: 1,
      },
      assignments: [],
      targets: [],
      instrument: null,
      name: 'Demo',
      source_panel_id: null,
    }
    expect(stableStringify(wireOrder)).toBe(stableStringify(tiptapOrder))
  })

  it('handles undefined gracefully (JSON.stringify returns undefined)', () => {
    expect(stableStringify(undefined)).toBe(undefined as unknown as string)
  })
})
