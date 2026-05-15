import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getPreferences, updatePreference } from '@/api/preferences'
import { EXPERIMENT_LAST_FULL_WIDTH_PREFERENCE_KEY } from '@/types'

const DEFAULT_LAST_FULL_WIDTH = true

export function useExperimentLastFullWidth() {
  const qc = useQueryClient()

  const query = useQuery({
    queryKey: ['preferences'],
    queryFn: getPreferences,
    staleTime: 5 * 60 * 1000,
  })

  const lastFullWidth = parseBool(query.data?.[EXPERIMENT_LAST_FULL_WIDTH_PREFERENCE_KEY])

  const setLastFullWidth = async (value: boolean) => {
    await updatePreference(
      EXPERIMENT_LAST_FULL_WIDTH_PREFERENCE_KEY,
      value ? 'true' : 'false',
    )
    qc.invalidateQueries({ queryKey: ['preferences'] })
  }

  return {
    lastFullWidth,
    setLastFullWidth,
    isLoading: query.isLoading,
  }
}

function parseBool(raw: string | undefined): boolean {
  if (raw === 'true') return true
  if (raw === 'false') return false
  return DEFAULT_LAST_FULL_WIDTH
}
