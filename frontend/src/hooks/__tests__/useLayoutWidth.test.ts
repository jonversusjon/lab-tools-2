import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { createElement } from 'react'
import { useLayoutWidth } from '@/hooks/useLayoutWidth'
import { LAYOUT_FULL_WIDTH_PREFERENCE_KEY } from '@/types'
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

describe('useLayoutWidth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedUpdatePreference.mockResolvedValue({
      key: LAYOUT_FULL_WIDTH_PREFERENCE_KEY,
      value: '',
    } as any)
  })

  it('defaults to false when preference is absent', async () => {
    mockedGetPreferences.mockResolvedValue({})
    const { result } = renderHook(() => useLayoutWidth(), {
      wrapper: makeWrapper(),
    })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.fullWidth).toBe(false)
  })

  it('parses "true" as true', async () => {
    mockedGetPreferences.mockResolvedValue({
      [LAYOUT_FULL_WIDTH_PREFERENCE_KEY]: 'true',
    })
    const { result } = renderHook(() => useLayoutWidth(), {
      wrapper: makeWrapper(),
    })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.fullWidth).toBe(true)
  })

  it('parses non-"true" values as false (string discipline)', async () => {
    mockedGetPreferences.mockResolvedValue({
      [LAYOUT_FULL_WIDTH_PREFERENCE_KEY]: 'false',
    })
    const { result } = renderHook(() => useLayoutWidth(), {
      wrapper: makeWrapper(),
    })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.fullWidth).toBe(false)
  })

  it('setFullWidth(true) writes "true" via updatePreference', async () => {
    mockedGetPreferences.mockResolvedValue({})
    const { result } = renderHook(() => useLayoutWidth(), {
      wrapper: makeWrapper(),
    })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    await act(async () => {
      await result.current.setFullWidth(true)
    })
    expect(mockedUpdatePreference).toHaveBeenCalledWith(
      LAYOUT_FULL_WIDTH_PREFERENCE_KEY,
      'true',
    )
  })

  it('setFullWidth(false) writes "false"', async () => {
    mockedGetPreferences.mockResolvedValue({
      [LAYOUT_FULL_WIDTH_PREFERENCE_KEY]: 'true',
    })
    const { result } = renderHook(() => useLayoutWidth(), {
      wrapper: makeWrapper(),
    })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    await act(async () => {
      await result.current.setFullWidth(false)
    })
    expect(mockedUpdatePreference).toHaveBeenCalledWith(
      LAYOUT_FULL_WIDTH_PREFERENCE_KEY,
      'false',
    )
  })
})
