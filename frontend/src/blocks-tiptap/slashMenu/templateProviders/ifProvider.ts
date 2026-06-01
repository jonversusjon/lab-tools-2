import type { QueryClient } from '@tanstack/react-query'
import { listIFPanels, getIFPanelSnapshotPreview } from '@/api/if_panels'
import type { IFPanelListItem, PaginatedResponse } from '@/types'
import type { TemplateListItem, TemplateProvider } from './types'

const LIST_KEY = ['if-panels', { skip: 0, limit: 500 }] as const

function targetCountLabel(count: number): string {
  return String(count) + ' target' + (count === 1 ? '' : 's')
}

export const ifProvider: TemplateProvider = {
  slashItemTitle: 'IF panel',
  listQueryKey: LIST_KEY,

  async prefetchList(queryClient: QueryClient): Promise<void> {
    await queryClient.prefetchQuery({
      queryKey: LIST_KEY,
      queryFn: () => listIFPanels(0, 500),
    })
  },

  readList(queryClient: QueryClient): TemplateListItem[] {
    const data = queryClient.getQueryData<PaginatedResponse<IFPanelListItem>>(LIST_KEY)
    if (!data) return []
    return data.items.map((p) => ({
      id: p.id,
      name: p.name,
      // panel_type ("IF" | "IHC") is the secondary line for IF templates.
      subtitle: p.panel_type,
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
      queryKey: ['if-panels', templateId, 'snapshot-preview'],
      queryFn: () => getIFPanelSnapshotPreview(templateId),
    })
  },
}
