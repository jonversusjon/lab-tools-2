import { useState } from 'react'

// 24×18 viewBox — extra width gives room for outward arrows
const FOLD = 4
// Document: x=5..20, y=1..16
const DL = 5   // doc left
const DR = 20  // doc right
const DW = DR - DL       // 15
const DH = 15
const DT = 1   // doc top
const CY = DT + DH / 2  // vertical center = 8.5

const BODY_PATH = `M ${DL} ${DT} h ${DW - FOLD} l ${FOLD} ${FOLD} v ${DH - FOLD} H ${DL} Z`
const FOLD_PATH = `M ${DR - FOLD} ${DT} l ${FOLD} ${FOLD} h ${-FOLD} Z`

const AH = 2.8  // arrow half-height
const AW = 2.2  // arrow depth

// Expand arrows (point outward ◄  ►)
// Left ◄ : peak at (DL-3, CY), opening toward doc
const EXPAND_L = `M ${DL - 1} ${CY - AH} L ${DL - 1 - AW} ${CY} L ${DL - 1} ${CY + AH}`
// Right ► : peak at (DR+3, CY)
const EXPAND_R = `M ${DR + 1} ${CY - AH} L ${DR + 1 + AW} ${CY} L ${DR + 1} ${CY + AH}`

// Shrink arrows (point inward ► ◄ — toward each other)
const SHRINK_L = `M ${DL - 1 - AW} ${CY - AH} L ${DL - 1} ${CY} L ${DL - 1 - AW} ${CY + AH}`
const SHRINK_R = `M ${DR + 1 + AW} ${CY - AH} L ${DR + 1} ${CY} L ${DR + 1 + AW} ${CY + AH}`

const SPRING   = 'cubic-bezier(0.34, 2.2, 0.64, 1)'
const EASE_OUT = 'cubic-bezier(0.4, 0, 0.2, 1)'

interface PageWidthToggleProps {
  isFullWidth: boolean
  onToggle: () => void
}

export function PageWidthToggle({ isFullWidth, onToggle }: PageWidthToggleProps) {
  const [hovered, setHovered] = useState(false)

  const tip   = isFullWidth ? 'Shrink to page width' : 'Expand to full width'
  // Label shows the TARGET state (what clicking will switch to)
  const label = isFullWidth ? 'PAGE' : 'FULL'

  // ── Document body ───────────────────────────────────────────────────────
  // Page idle: scaleX(1), Full idle: scaleX(1.22)
  // Hover expand: spring to 1.22 (overshoots to ~1.45 naturally)
  // Hover shrink: spring to 1.0  (undershoots to ~0.78 naturally)
  const docTransform  = hovered
    ? (isFullWidth ? 'scaleX(1.0)'  : 'scaleX(1.22)')
    : (isFullWidth ? 'scaleX(1.22)' : 'scaleX(1.0)')
  const docTransition = `transform 420ms ${hovered ? SPRING : EASE_OUT}`

  // ── Arrow visibility ────────────────────────────────────────────────────
  const arrowOpacity    = hovered ? 0.75 : 0
  const arrowTransition = `opacity 180ms ease, transform 400ms ${hovered ? SPRING : EASE_OUT}`

  // Expand: arrows fly outward on hover
  const lExpandT = hovered ? 'translateX(-3px)' : 'translateX(0)'
  const rExpandT = hovered ? 'translateX(3px)'  : 'translateX(0)'
  // Shrink: arrows fly inward on hover (start outside, land at edge)
  const lShrinkT = hovered ? 'translateX(0)'    : 'translateX(-3px)'
  const rShrinkT = hovered ? 'translateX(0)'    : 'translateX(3px)'

  const leftArrowTransform  = isFullWidth ? lShrinkT : lExpandT
  const rightArrowTransform = isFullWidth ? rShrinkT : rExpandT

  const leftArrowPath  = isFullWidth ? SHRINK_L : EXPAND_L
  const rightArrowPath = isFullWidth ? SHRINK_R : EXPAND_R

  const arrowStyle = (tx: string): React.CSSProperties => ({
    opacity: arrowOpacity,
    transform: tx,
    transition: arrowTransition,
  })

  return (
    <button
      type="button"
      onClick={onToggle}
      title={tip}
      aria-label={tip}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: '0.25rem',
        padding: '0.25rem',
        background: hovered ? 'var(--color-hover, rgba(128,128,128,0.15))' : 'transparent',
        border: 'none',
        cursor: 'pointer',
        color: 'var(--color-foreground-muted, currentColor)',
        opacity: hovered ? 1 : 0.65,
        transition: 'background 120ms ease, opacity 120ms ease',
      }}
    >
      <svg
        width={28}
        height={21}
        viewBox="0 0 24 18"
        fill="none"
        aria-hidden="true"
        style={{ display: 'block', overflow: 'visible' }}
      >
        <defs>
          {/*
            Label cutout mask — applied to the OUTER group so it lives in
            fixed viewport coordinates and doesn't distort when the inner
            document group animates with scaleX.
            White = visible, Black = transparent (punches the hole).
            Cutout covers the FULL/PAGE label area + 2px padding on all sides.
            Coords are in viewBox units (24×18 space, scale = 24/28 px/unit).
          */}
          <mask id="pwt-label-mask" maskUnits="userSpaceOnUse">
            <rect x="-10" y="-10" width="50" height="50" fill="white" />
            <rect x="7" y="11" width="17" height="8" rx="1" fill="black" />
          </mask>
        </defs>

        {/* Outer group carries the mask in fixed viewport space */}
        <g mask="url(#pwt-label-mask)">
          {/* ── Animated document body ── */}
          <g style={{
            transformBox: 'fill-box',
            transformOrigin: 'center center',
            transform: docTransform,
            transition: docTransition,
          }}>
            <path
              d={BODY_PATH}
              fill="currentColor"
              fillOpacity={0.18}
              stroke="currentColor"
              strokeWidth={1.4}
              strokeLinejoin="round"
            />
            <line x1={DL+2}   y1={7}    x2={DR-2}   y2={7}    stroke="currentColor" strokeWidth={1.1} strokeLinecap="round" />
            <line x1={DL+2}   y1={10}   x2={DR-2}   y2={10}   stroke="currentColor" strokeWidth={1.1} strokeLinecap="round" />
            <line x1={DL+2}   y1={13}   x2={DR-4.5} y2={13}   stroke="currentColor" strokeWidth={1.1} strokeLinecap="round" />
          </g>

          {/* ── Corner fold (not animated) ── */}
          <path
            d={FOLD_PATH}
            fill="currentColor"
            fillOpacity={0.35}
            stroke="currentColor"
            strokeWidth={1.4}
            strokeLinejoin="round"
          />
        </g>

        {/* ── Arrows (hover only, outside mask) ── */}
        <path d={leftArrowPath}  stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" style={arrowStyle(leftArrowTransform)} />
        <path d={rightArrowPath} stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" style={arrowStyle(rightArrowTransform)} />
      </svg>

      {/* ── FULL / PAGE label (HTML so font-size is reliable) ── */}
      {!hovered && (
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            bottom: 2,
            right: 3,
            fontSize: 7.5,
            fontWeight: 800,
            lineHeight: 1,
            letterSpacing: '0.03em',
            fontFamily: 'system-ui, ui-sans-serif, sans-serif',
            color: 'currentColor',
            opacity: 1,
            userSelect: 'none',
            pointerEvents: 'none',
          }}
        >
          {label}
        </span>
      )}
    </button>
  )
}
