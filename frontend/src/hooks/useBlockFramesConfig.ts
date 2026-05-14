import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getPreferences, updatePreference } from '@/api/preferences'
import {
  BlockFramesConfig,
  DEFAULT_BLOCK_FRAMES,
  BLOCK_FRAMES_PREFERENCE_KEY,
  FrameMode,
} from '@/types'

export function useBlockFramesConfig() {
  const qc = useQueryClient()

  const query = useQuery({
    queryKey: ['preferences'],
    queryFn: getPreferences,
    staleTime: 5 * 60 * 1000,
  })

  const config: BlockFramesConfig = parseConfigOrDefault(
    query.data?.[BLOCK_FRAMES_PREFERENCE_KEY],
  )

  const setConfig = async (key: keyof BlockFramesConfig, value: FrameMode) => {
    const next: BlockFramesConfig = { ...config, [key]: value }
    await updatePreference(BLOCK_FRAMES_PREFERENCE_KEY, JSON.stringify(next))
    qc.invalidateQueries({ queryKey: ['preferences'] })
  }

  return {
    config,
    setConfig,
    isLoading: query.isLoading,
  }
}

function parseConfigOrDefault(raw: string | undefined): BlockFramesConfig {
  if (!raw) return DEFAULT_BLOCK_FRAMES
  try {
    const parsed = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return DEFAULT_BLOCK_FRAMES
    return { ...DEFAULT_BLOCK_FRAMES, ...parsed }
  } catch {
    return DEFAULT_BLOCK_FRAMES
  }
}
