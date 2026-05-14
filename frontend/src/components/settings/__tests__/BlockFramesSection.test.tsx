import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within, waitFor, fireEvent } from '@testing-library/react'
import BlockFramesSection from '@/components/settings/BlockFramesSection'
import { DEFAULT_BLOCK_FRAMES, type BlockFramesConfig, type FrameMode } from '@/types'
import { useBlockFramesConfig } from '@/hooks/useBlockFramesConfig'

vi.mock('@/hooks/useBlockFramesConfig', () => ({
  useBlockFramesConfig: vi.fn(),
}))

const mockedUseBlockFramesConfig = vi.mocked(useBlockFramesConfig)

function setupMock(overrides?: {
  config?: Partial<BlockFramesConfig>
  setConfig?: (key: keyof BlockFramesConfig, value: FrameMode) => Promise<void>
}) {
  const setConfig = overrides?.setConfig ?? vi.fn().mockResolvedValue(undefined)
  mockedUseBlockFramesConfig.mockReturnValue({
    config: { ...DEFAULT_BLOCK_FRAMES, ...(overrides?.config ?? {}) },
    setConfig,
    isLoading: false,
  })
  return { setConfig }
}

describe('BlockFramesSection', () => {
  beforeEach(() => {
    mockedUseBlockFramesConfig.mockReset()
  })

  it('renders 11 block-type rows', () => {
    setupMock()
    render(<BlockFramesSection />)
    const labels = [
      'Heading',
      'Paragraph',
      'Bulleted list',
      'Numbered list',
      'Divider',
      'Callout',
      'Column layout',
      'Column',
      'Flow panel',
      'IF panel',
      'Table',
    ]
    for (const label of labels) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
    expect(screen.queryByText('List item')).not.toBeInTheDocument()
    expect(screen.queryByText('Table row')).not.toBeInTheDocument()
  })

  it('highlights the active mode for each row via aria-pressed', () => {
    setupMock({ config: { heading: 'always' } })
    render(<BlockFramesSection />)
    const headingGroup = screen.getByRole('group', { name: 'Heading frame mode' })
    const alwaysBtn = within(headingGroup).getByRole('button', { name: 'Always' })
    const neverBtn = within(headingGroup).getByRole('button', { name: 'Never' })
    expect(alwaysBtn).toHaveAttribute('aria-pressed', 'true')
    expect(neverBtn).toHaveAttribute('aria-pressed', 'false')
    expect(alwaysBtn.className).toContain('bg-accent')
  })

  it('renders Clean button disabled with tooltip on every row', () => {
    setupMock()
    render(<BlockFramesSection />)
    const cleanButtons = screen.getAllByRole('button', { name: 'Clean' })
    expect(cleanButtons).toHaveLength(11)
    for (const btn of cleanButtons) {
      expect(btn).toBeDisabled()
      expect(btn).toHaveAttribute('title', 'Available in a future version')
      expect(btn.className).toContain('cursor-not-allowed')
    }
  })

  it('clicking Always calls setConfig with the correct args', async () => {
    const { setConfig } = setupMock()
    render(<BlockFramesSection />)
    const paragraphGroup = screen.getByRole('group', { name: 'Paragraph frame mode' })
    const alwaysBtn = within(paragraphGroup).getByRole('button', { name: 'Always' })
    fireEvent.click(alwaysBtn)
    await waitFor(() => {
      expect(setConfig).toHaveBeenCalledWith('paragraph', 'always')
    })
  })

  it('renders inline error in the affected row only on save failure', async () => {
    const setConfig = vi
      .fn()
      .mockRejectedValueOnce(new Error('Network down'))
      .mockResolvedValue(undefined)
    setupMock({ setConfig })
    render(<BlockFramesSection />)
    const calloutRow = screen.getByText('Callout').closest('tr') as HTMLElement
    const paragraphRow = screen.getByText('Paragraph').closest('tr') as HTMLElement
    const neverBtn = within(calloutRow).getByRole('button', { name: 'Never' })
    fireEvent.click(neverBtn)
    await waitFor(() => {
      expect(within(calloutRow).getByRole('alert')).toHaveTextContent('Network down')
    })
    expect(within(paragraphRow).queryByRole('alert')).not.toBeInTheDocument()
  })
})
