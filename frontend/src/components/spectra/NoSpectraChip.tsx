import { useRef, useState, useCallback } from 'react'
import type { CSSProperties } from 'react'
import { useModal } from '@/components/layout/ModalContext'

interface NoSpectraChipProps {
  fluorophoreId: string
  /**
   * Optional class for the chip glyph itself. Defaults to a small
   * dashed-border pill suitable for table cells.
   */
  className?: string
  style?: CSSProperties
}

const SHOW_DELAY_MS = 150
const HIDE_DELAY_MS = 200

/**
 * Visual affordance for a fluorophore that lacks the spectra needed to
 * compute efficiency. Hover reveals an interactive tooltip with an
 * "Upload now" link that opens the FPbase fetch dialog pre-targeted at
 * the missing fluorophore.
 *
 * The chip itself is intentionally NOT the click target — the link
 * inside the tooltip is. This avoids accidental dispatches when users
 * brush over the cell.
 */
export default function NoSpectraChip({ fluorophoreId, className, style }: NoSpectraChipProps) {
  const { open } = useModal()
  const [visible, setVisible] = useState(false)
  const showTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearTimers = useCallback(() => {
    if (showTimer.current) {
      clearTimeout(showTimer.current)
      showTimer.current = null
    }
    if (hideTimer.current) {
      clearTimeout(hideTimer.current)
      hideTimer.current = null
    }
  }, [])

  const handleEnter = useCallback(() => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current)
      hideTimer.current = null
    }
    if (visible) return
    showTimer.current = setTimeout(() => setVisible(true), SHOW_DELAY_MS)
  }, [visible])

  const handleLeave = useCallback(() => {
    if (showTimer.current) {
      clearTimeout(showTimer.current)
      showTimer.current = null
    }
    hideTimer.current = setTimeout(() => setVisible(false), HIDE_DELAY_MS)
  }, [])

  const handleUpload = useCallback(() => {
    clearTimers()
    setVisible(false)
    open({ kind: 'fpbase_fetch', fluorophoreId })
  }, [clearTimers, fluorophoreId, open])

  return (
    <span
      className="relative inline-block"
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
    >
      <span
        data-testid="no-spectra-chip"
        aria-label="No spectra available"
        className={
          className ??
          'inline-flex h-5 w-7 items-center justify-center rounded border border-dashed border-border-strong bg-surface text-[10px] font-medium text-foreground-subtle'
        }
        style={style}
      >
        ?
      </span>
      {visible && (
        <span
          role="tooltip"
          data-testid="no-spectra-tooltip"
          onMouseEnter={handleEnter}
          onMouseLeave={handleLeave}
          className="absolute left-1/2 z-50 mt-1 w-56 -translate-x-1/2 rounded border border-border bg-elevated px-3 py-2 text-xs text-foreground shadow-lg"
        >
          Efficiency can&rsquo;t be calculated until spectral data is provided.{' '}
          <button
            type="button"
            onClick={handleUpload}
            className="text-accent underline hover:no-underline"
          >
            Upload now
          </button>
        </span>
      )}
    </span>
  )
}
