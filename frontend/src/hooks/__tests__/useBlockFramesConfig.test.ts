import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { createElement } from 'react'
import { useBlockFramesConfig } from '@/hooks/useBlockFramesConfig'
import {
  DEFAULT_BLOCK_FRAMES,
  BLOCK_FRAMES_PREFERENCE_KEY,
} from '@/types'
import { getPreferences, updatePreference } from '@/api/preferences'

vi.mock('@/api/preferences', () => ({
  getPreferences: vi.fn(),
  updatePreference: vi.fn(),
}))

const mockedGetPreferences = vi.mocked(getPreferences)
const mockedUpdatePreference = vi.mocked(updatePreference)

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children)
}

describe('useBlockFramesConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedUpdatePreference.mockResolvedValue({
      key: BLOCK_FRAMES_PREFERENCE_KEY,
      value: '',
    } as any)
  })

  it('returns DEFAULT_BLOCK_FRAMES when preference is absent', async () => {
    mockedGetPreferences.mockResolvedValue({})
    const { result } = renderHook(() => useBlockFramesConfig(), {
      wrapper: makeWrapper(),
    })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.config).toEqual(DEFAULT_BLOCK_FRAMES)
  })

  it('parses valid JSON correctly and merges with defaults', async () => {
    mockedGetPreferences.mockResolvedValue({
      [BLOCK_FRAMES_PREFERENCE_KEY]: '{"heading":"always"}',
    })
    const { result } = renderHook(() => useBlockFramesConfig(), {
      wrapper: makeWrapper(),
    })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.config.heading).toBe('always')
    expect(result.current.config.paragraph).toBe(DEFAULT_BLOCK_FRAMES.paragraph)
    expect(result.current.config.flow_panel).toBe(DEFAULT_BLOCK_FRAMES.flow_panel)
  })

  it('returns DEFAULT_BLOCK_FRAMES on malformed JSON', async () => {
    mockedGetPreferences.mockResolvedValue({
      [BLOCK_FRAMES_PREFERENCE_KEY]: 'not valid json',
    })
    const { result } = renderHook(() => useBlockFramesConfig(), {
      wrapper: makeWrapper(),
    })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.config).toEqual(DEFAULT_BLOCK_FRAMES)
  })

  it('setConfig calls updatePreference with correctly merged JSON', async () => {
    mockedGetPreferences.mockResolvedValue({
      [BLOCK_FRAMES_PREFERENCE_KEY]: '{"heading":"always"}',
    })
    const { result } = renderHook(() => useBlockFramesConfig(), {
      wrapper: makeWrapper(),
    })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await act(async () => {
      await result.current.setConfig('paragraph', 'never')
    })

    expect(mockedUpdatePreference).toHaveBeenCalledTimes(1)
    const [calledKey, calledValue] = mockedUpdatePreference.mock.calls[0]
    expect(calledKey).toBe(BLOCK_FRAMES_PREFERENCE_KEY)
    const parsed = JSON.parse(calledValue)
    expect(parsed.paragraph).toBe('never')
    expect(parsed.heading).toBe('always')
    expect(parsed.flow_panel).toBe(DEFAULT_BLOCK_FRAMES.flow_panel)
    expect(parsed.table).toBe(DEFAULT_BLOCK_FRAMES.table)
  })
})
