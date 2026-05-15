import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getPreferences, updatePreference } from '@/api/preferences'
import { LAYOUT_FULL_WIDTH_PREFERENCE_KEY } from '@/types'

export function useLayoutWidth() {
  const qc = useQueryClient()

  const query = useQuery({
    queryKey: ['preferences'],
    queryFn: getPreferences,
    staleTime: 5 * 60 * 1000,
  })

  const fullWidth = parseFullWidth(query.data?.[LAYOUT_FULL_WIDTH_PREFERENCE_KEY])

  const setFullWidth = async (value: boolean) => {
    await updatePreference(LAYOUT_FULL_WIDTH_PREFERENCE_KEY, value ? 'true' : 'false')
    qc.invalidateQueries({ queryKey: ['preferences'] })
  }

  return {
    fullWidth,
    setFullWidth,
    isLoading: query.isLoading,
  }
}

function parseFullWidth(raw: string | undefined): boolean {
  if (raw === 'true') return true
  return false
}
