import { describe, it, expect } from 'vitest'
import { inspectTransaction } from './transactionInspector'
import type { ExperimentBlock } from '@/types'

function row(overrides: Partial<ExperimentBlock> = {}): ExperimentBlock {
  return {
    id: overrides.id ?? 'row-1',
    experiment_id: 'exp-1',
    block_type: 'paragraph',
    content: { text: '' },
    sort_order: 0,
    parent_id: null,
    created_at: null,
    updated_at: null,
    ...overrides,
  }
}

describe('inspectTransaction', () => {
  it('empty before, empty after → all buckets empty', () => {
    const diff = inspectTransaction([], [])
    expect(diff.created).toEqual([])
    expect(diff.deleted).toEqual([])
    expect(diff.contentChanged).toEqual([])
    expect(diff.topologyChanged).toEqual([])
  })

  it('identical before/after → all buckets empty', () => {
    const r = row({ id: 'a', content: { text: 'hi' } })
    const diff = inspectTransaction([r], [{ ...r }])
    expect(diff.created).toEqual([])
    expect(diff.deleted).toEqual([])
    expect(diff.contentChanged).toEqual([])
    expect(diff.topologyChanged).toEqual([])
  })

  it('one row created → created has 1, others empty', () => {
    const r = row({ id: 'a' })
    const diff = inspectTransaction([], [r])
    expect(diff.created).toEqual([r])
    expect(diff.deleted).toEqual([])
    expect(diff.contentChanged).toEqual([])
    expect(diff.topologyChanged).toEqual([])
  })

  it('one row deleted → deleted has 1, others empty', () => {
    const r = row({ id: 'a' })
    const diff = inspectTransaction([r], [])
    expect(diff.deleted).toEqual([r])
    expect(diff.created).toEqual([])
    expect(diff.contentChanged).toEqual([])
    expect(diff.topologyChanged).toEqual([])
  })

  it('one row content edited → contentChanged has 1', () => {
    const before = row({ id: 'a', content: { text: 'old' } })
    const after = row({ id: 'a', content: { text: 'new' } })
    const diff = inspectTransaction([before], [after])
    expect(diff.contentChanged).toEqual([after])
    expect(diff.created).toEqual([])
    expect(diff.deleted).toEqual([])
    expect(diff.topologyChanged).toEqual([])
  })

  it('one row reordered (sort_order changed) → topologyChanged has 1', () => {
    const before = row({ id: 'a', sort_order: 0 })
    const after = row({ id: 'a', sort_order: 5 })
    const diff = inspectTransaction([before], [after])
    expect(diff.topologyChanged).toEqual([after])
    expect(diff.contentChanged).toEqual([])
    expect(diff.created).toEqual([])
    expect(diff.deleted).toEqual([])
  })

  it('one row parent changed → topologyChanged has 1', () => {
    const before = row({ id: 'a', parent_id: null })
    const after = row({ id: 'a', parent_id: 'p1' })
    const diff = inspectTransaction([before], [after])
    expect(diff.topologyChanged).toEqual([after])
    expect(diff.contentChanged).toEqual([])
  })

  it('combined: 4 different changes → all buckets populated, no overlap', () => {
    const beforeRows: ExperimentBlock[] = [
      row({ id: 'unchanged', content: { text: 'same' } }),
      row({ id: 'to-delete' }),
      row({ id: 'edit-me', content: { text: 'old' } }),
      row({ id: 'move-me', sort_order: 1 }),
    ]
    const afterRows: ExperimentBlock[] = [
      row({ id: 'unchanged', content: { text: 'same' } }),
      row({ id: 'edit-me', content: { text: 'new' } }),
      row({ id: 'move-me', sort_order: 9 }),
      row({ id: 'newcomer' }),
    ]
    const diff = inspectTransaction(beforeRows, afterRows)
    expect(diff.created.map((r) => r.id)).toEqual(['newcomer'])
    expect(diff.deleted.map((r) => r.id)).toEqual(['to-delete'])
    expect(diff.contentChanged.map((r) => r.id)).toEqual(['edit-me'])
    expect(diff.topologyChanged.map((r) => r.id)).toEqual(['move-me'])
  })

  it('row with content AND sort_order changes → in BOTH contentChanged and topologyChanged', () => {
    const before = row({ id: 'a', content: { text: 'old' }, sort_order: 0 })
    const after = row({ id: 'a', content: { text: 'new' }, sort_order: 3 })
    const diff = inspectTransaction([before], [after])
    expect(diff.contentChanged).toEqual([after])
    expect(diff.topologyChanged).toEqual([after])
  })

  it('block_type change is treated as contentChanged', () => {
    const before = row({ id: 'a', block_type: 'paragraph' })
    const after = row({ id: 'a', block_type: 'heading_2' })
    const diff = inspectTransaction([before], [after])
    expect(diff.contentChanged).toEqual([after])
    expect(diff.topologyChanged).toEqual([])
  })

  it('reports zero changes when baseline content has different key order than current', () => {
    // Baseline simulates server wire order; current simulates tiptapDocToRows
    // output order (driven by addAttributes declaration order). Logical content
    // is identical — only key order differs.
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
    const before = row({ id: 'a', block_type: 'flow_panel', content: wireOrder })
    const after = row({ id: 'a', block_type: 'flow_panel', content: tiptapOrder })
    const diff = inspectTransaction([before], [after])
    expect(diff.contentChanged).toEqual([])
    expect(diff.topologyChanged).toEqual([])
  })
})
