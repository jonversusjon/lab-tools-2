/**
 * Position a popup element near a reference rect, handling viewport
 * overflow with vertical flip and horizontal shift. No external deps.
 *
 * Returns { left, top } in document coordinates (including window.scrollX/Y),
 * suitable for absolute positioning on document.body.
 */

export interface PositionOptions {
  refRect: DOMRect
  popup: HTMLElement
  offset?: number          // default 4 — px between reference and popup
  viewportPadding?: number // default 8 — px between popup and viewport edge
}

export interface PositionResult {
  left: number
  top: number
  placement: 'below' | 'above'
}

export function positionPopup({
  refRect,
  popup,
  offset = 4,
  viewportPadding = 8,
}: PositionOptions): PositionResult {
  const popupRect = popup.getBoundingClientRect()
  const popupWidth = popupRect.width
  const popupHeight = popupRect.height

  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight

  // Vertical: prefer below, flip above if it would overflow
  const spaceBelow = viewportHeight - refRect.bottom
  const spaceAbove = refRect.top
  const wantsBelow = spaceBelow >= popupHeight + offset + viewportPadding
  const wantsAbove = spaceAbove >= popupHeight + offset + viewportPadding

  let topInViewport: number
  let placement: 'below' | 'above'
  if (wantsBelow || !wantsAbove) {
    topInViewport = refRect.bottom + offset
    placement = 'below'
  } else {
    topInViewport = refRect.top - popupHeight - offset
    placement = 'above'
  }

  // Horizontal: align left edge with reference, shift left if overflow right
  let leftInViewport = refRect.left
  const rightOverflow = (leftInViewport + popupWidth) - (viewportWidth - viewportPadding)
  if (rightOverflow > 0) {
    leftInViewport -= rightOverflow
  }
  if (leftInViewport < viewportPadding) {
    leftInViewport = viewportPadding
  }

  return {
    left: leftInViewport + window.scrollX,
    top: topInViewport + window.scrollY,
    placement,
  }
}
