import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getPreferences, updatePreference } from '@/api/preferences'
import { SPECTRAL_RAIL_OPEN_PREFERENCE_KEY } from '@/types'

// Default the rail to open: when a panel is active the user almost always wants
// to see its spectra. They can collapse it and the choice sticks.
const DEFAULT_OPEN = true

/**
 * Persisted preference for whether the experiment-page spectral rail expands
 * (vs. stays a thin strip) when a panel block becomes active. Modeled on
 * useExperimentLastFullWidth — same `['preferences']` query + updatePreference.
 */
export function useSpectralRailOpen() {
  const qc = useQueryClient()

  const query = useQuery({
    queryKey: ['preferences'],
    queryFn: getPreferences,
    staleTime: 5 * 60 * 1000,
  })

  const isOpen = parseBool(query.data?.[SPECTRAL_RAIL_OPEN_PREFERENCE_KEY])

  // Optimistic: flip the cached preference synchronously so the rail's
  // collapse/expand animation fires on click. Persistence happens in the
  // background; a failed write reverts by refetching the real value.
  const setOpen = (value: boolean) => {
    const raw = value ? 'true' : 'false'
    qc.setQueryData(
      ['preferences'],
      (old: Record<string, string> | undefined) => ({
        ...(old ?? {}),
        [SPECTRAL_RAIL_OPEN_PREFERENCE_KEY]: raw,
      }),
    )
    updatePreference(SPECTRAL_RAIL_OPEN_PREFERENCE_KEY, raw).catch(() => {
      qc.invalidateQueries({ queryKey: ['preferences'] })
    })
  }

  return {
    isOpen,
    setOpen,
    isLoading: query.isLoading,
  }
}

function parseBool(raw: string | undefined): boolean {
  if (raw === 'true') return true
  if (raw === 'false') return false
  return DEFAULT_OPEN
}
