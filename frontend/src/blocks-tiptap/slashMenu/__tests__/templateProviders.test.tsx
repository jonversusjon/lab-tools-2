import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import { flowProvider } from '../templateProviders/flowProvider'
import { ifProvider } from '../templateProviders/ifProvider'
import { getProviderForItem } from '../templateProviders'

describe('getProviderForItem', () => {
  it('resolves Flow panel and IF panel, but not plain blocks', () => {
    expect(getProviderForItem('Flow panel')).toBe(flowProvider)
    expect(getProviderForItem('IF panel')).toBe(ifProvider)
    expect(getProviderForItem('Heading 1')).toBeUndefined()
  })
})

describe('prefetchList', () => {
  it('flowProvider prefetches the panels list key', async () => {
    const qc = { prefetchQuery: vi.fn().mockResolvedValue(undefined) }
    await flowProvider.prefetchList(qc as unknown as QueryClient)
    expect(qc.prefetchQuery).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['panels', { skip: 0, limit: 500 }] }),
    )
  })

  it('ifProvider prefetches the if-panels list key', async () => {
    const qc = { prefetchQuery: vi.fn().mockResolvedValue(undefined) }
    await ifProvider.prefetchList(qc as unknown as QueryClient)
    expect(qc.prefetchQuery).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['if-panels', { skip: 0, limit: 500 }] }),
    )
  })
})

describe('buildNodeJSON', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.mockReset()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('flowProvider builds the flow_panel node from the preview endpoint', async () => {
    const preview = {
      type: 'flow_panel',
      attrs: {
        source_panel_id: 'panel-1',
        name: 'T Cell Panel',
        instrument: { id: 'inst-1', name: 'Aria', lasers: [] },
        targets: [],
        assignments: [],
        volume_params: {
          num_samples: 1,
          volume_per_sample_ul: 100,
          pipet_error_factor: 1.1,
          dilution_source: 'flow',
        },
      },
    }
    fetchMock.mockResolvedValue({ ok: true, json: async () => preview })

    const qc = new QueryClient()
    const node = await flowProvider.buildNodeJSON('panel-1', qc)

    expect(fetchMock).toHaveBeenCalledWith('/api/v1/panels/panel-1/snapshot-preview')
    expect(node).toEqual(preview)
    expect(node.type).toBe('flow_panel')
  })

  it('ifProvider builds the if_panel node from the preview endpoint', async () => {
    const preview = {
      type: 'if_panel',
      attrs: {
        source_panel_id: 'if-1',
        name: 'Neuronal IF',
        panel_type: 'IF',
        microscope: { id: 'm-1', name: 'SP8', lasers: [] },
        view_mode: 'simple',
        targets: [],
        assignments: [],
        volume_params: {
          num_samples: 1,
          volume_per_sample_ul: 200,
          pipet_error_factor: 1.1,
          dilution_source: 'icc_if',
        },
      },
    }
    fetchMock.mockResolvedValue({ ok: true, json: async () => preview })

    const qc = new QueryClient()
    const node = await ifProvider.buildNodeJSON('if-1', qc)

    expect(fetchMock).toHaveBeenCalledWith('/api/v1/if-panels/if-1/snapshot-preview')
    expect(node).toEqual(preview)
    expect(node.type).toBe('if_panel')
  })
})
