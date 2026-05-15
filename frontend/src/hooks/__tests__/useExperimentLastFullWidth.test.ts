import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { createElement } from 'react'
import { useExperimentLastFullWidth } from '@/hooks/useExperimentLastFullWidth'
import { EXPERIMENT_LAST_FULL_WIDTH_PREFERENCE_KEY } from '@/types'
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

describe('useExperimentLastFullWidth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedUpdatePreference.mockResolvedValue({
      key: EXPERIMENT_LAST_FULL_WIDTH_PREFERENCE_KEY,
      value: '',
    } as any)
  })

  it('defaults to true when preference is absent (matches pre-Phase-1 visual behavior)', async () => {
    mockedGetPreferences.mockResolvedValue({})
    const { result } = renderHook(() => useExperimentLastFullWidth(), {
      wrapper: makeWrapper(),
    })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.lastFullWidth).toBe(true)
  })

  it('parses "true" as true', async () => {
    mockedGetPreferences.mockResolvedValue({
      [EXPERIMENT_LAST_FULL_WIDTH_PREFERENCE_KEY]: 'true',
    })
    const { result } = renderHook(() => useExperimentLastFullWidth(), {
      wrapper: makeWrapper(),
    })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.lastFullWidth).toBe(true)
  })

  it('parses "false" as false', async () => {
    mockedGetPreferences.mockResolvedValue({
      [EXPERIMENT_LAST_FULL_WIDTH_PREFERENCE_KEY]: 'false',
    })
    const { result } = renderHook(() => useExperimentLastFullWidth(), {
      wrapper: makeWrapper(),
    })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.lastFullWidth).toBe(false)
  })

  it('falls back to default for malformed values', async () => {
    mockedGetPreferences.mockResolvedValue({
      [EXPERIMENT_LAST_FULL_WIDTH_PREFERENCE_KEY]: 'maybe',
    })
    const { result } = renderHook(() => useExperimentLastFullWidth(), {
      wrapper: makeWrapper(),
    })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.lastFullWidth).toBe(true)
  })

  it('setLastFullWidth writes "true" / "false" via updatePreference', async () => {
    mockedGetPreferences.mockResolvedValue({})
    const { result } = renderHook(() => useExperimentLastFullWidth(), {
      wrapper: makeWrapper(),
    })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    await act(async () => {
      await result.current.setLastFullWidth(false)
    })
    expect(mockedUpdatePreference).toHaveBeenCalledWith(
      EXPERIMENT_LAST_FULL_WIDTH_PREFERENCE_KEY,
      'false',
    )
    await act(async () => {
      await result.current.setLastFullWidth(true)
    })
    expect(mockedUpdatePreference).toHaveBeenCalledWith(
      EXPERIMENT_LAST_FULL_WIDTH_PREFERENCE_KEY,
      'true',
    )
  })
})
