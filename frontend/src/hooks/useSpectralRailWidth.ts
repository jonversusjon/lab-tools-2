import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getPreferences, updatePreference } from '@/api/preferences'
import { SPECTRAL_RAIL_WIDTH_PREFERENCE_KEY } from '@/types'

// First-use width matches the original fixed `w-[360px]` rail so existing users
// see no change until they drag.
export const DEFAULT_SPECTRAL_RAIL_WIDTH = 360

// Clamp range: narrow enough to stay a useful sidebar, wide enough to read the
// spillover matrix comfortably without swallowing the page.
export const MIN_SPECTRAL_RAIL_WIDTH = 260
export const MAX_SPECTRAL_RAIL_WIDTH = 720

export function clampSpectralRailWidth(value: number): number {
  if (Number.isNaN(value)) return DEFAULT_SPECTRAL_RAIL_WIDTH
  return Math.min(MAX_SPECTRAL_RAIL_WIDTH, Math.max(MIN_SPECTRAL_RAIL_WIDTH, Math.round(value)))
}

/**
 * Persisted width of the experiment-page spectral rail when expanded. Modeled on
 * useSpectralRailOpen — same `['preferences']` query + updatePreference, with an
 * optimistic cache write so the rail tracks the drag live and the choice sticks.
 */
export function useSpectralRailWidth() {
  const qc = useQueryClient()

  const query = useQuery({
    queryKey: ['preferences'],
    queryFn: getPreferences,
    staleTime: 5 * 60 * 1000,
  })

  const width = parseWidth(query.data?.[SPECTRAL_RAIL_WIDTH_PREFERENCE_KEY])

  // Optimistic: flip the cached preference synchronously so drag feedback is
  // instant. Persistence happens in the background; a failed write reverts by
  // refetching the real value.
  const setWidth = (value: number) => {
    const clamped = clampSpectralRailWidth(value)
    const raw = String(clamped)
    qc.setQueryData(
      ['preferences'],
      (old: Record<string, string> | undefined) => ({
        ...(old ?? {}),
        [SPECTRAL_RAIL_WIDTH_PREFERENCE_KEY]: raw,
      }),
    )
    updatePreference(SPECTRAL_RAIL_WIDTH_PREFERENCE_KEY, raw).catch(() => {
      qc.invalidateQueries({ queryKey: ['preferences'] })
    })
  }

  return {
    width,
    setWidth,
    isLoading: query.isLoading,
  }
}

function parseWidth(raw: string | undefined): number {
  if (raw == null) return DEFAULT_SPECTRAL_RAIL_WIDTH
  return clampSpectralRailWidth(Number(raw))
}
