import type { QueryClient } from '@tanstack/react-query'
import { listPanels, getPanelSnapshotPreview } from '@/api/panels'
import type { Instrument, PaginatedResponse, PanelListItem } from '@/types'
import type { TemplateListItem, TemplateProvider } from './types'

const LIST_KEY = ['panels', { skip: 0, limit: 500 }] as const
const INSTRUMENTS_KEY = ['instruments', { skip: 0, limit: 500 }] as const

function targetCountLabel(count: number): string {
  return String(count) + ' target' + (count === 1 ? '' : 's')
}

export const flowProvider: TemplateProvider = {
  slashItemTitle: 'Flow panel',
  listQueryKey: LIST_KEY,

  async prefetchList(queryClient: QueryClient): Promise<void> {
    await queryClient.prefetchQuery({
      queryKey: LIST_KEY,
      queryFn: () => listPanels(0, 500),
    })
  },

  readList(queryClient: QueryClient): TemplateListItem[] {
    const data = queryClient.getQueryData<PaginatedResponse<PanelListItem>>(LIST_KEY)
    if (!data) return []

    // Instrument name is a best-effort subtitle: read from the instruments
    // cache if it happens to be populated, otherwise leave it blank.
    const instruments = queryClient.getQueryData<PaginatedResponse<Instrument>>(
      INSTRUMENTS_KEY,
    )
    const instrumentNames = new Map<string, string>()
    for (const inst of instruments?.items ?? []) {
      instrumentNames.set(inst.id, inst.name)
    }

    return data.items.map((p) => ({
      id: p.id,
      name: p.name,
      subtitle: p.instrument_id ? instrumentNames.get(p.instrument_id) : undefined,
      countLabel: targetCountLabel(p.target_count),
    }))
  },

  isListLoading(queryClient: QueryClient): boolean {
    const hasData = queryClient.getQueryData(LIST_KEY) != null
    if (hasData) return false
    const state = queryClient.getQueryState(LIST_KEY)
    return state == null || state.status === 'pending' || state.fetchStatus === 'fetching'
  },

  async buildNodeJSON(
    templateId: string,
    queryClient: QueryClient,
  ): Promise<Record<string, unknown>> {
    return queryClient.fetchQuery({
      queryKey: ['panels', templateId, 'snapshot-preview'],
      queryFn: () => getPanelSnapshotPreview(templateId),
    })
  },
}
