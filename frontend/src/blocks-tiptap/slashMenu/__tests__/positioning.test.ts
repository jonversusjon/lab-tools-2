import { describe, it, expect, beforeEach, vi } from 'vitest'
import { positionPopup } from '../positioning'

function makeMockPopup({ width, height }: { width: number; height: number }): HTMLElement {
  return {
    getBoundingClientRect: () => ({
      width, height,
      left: 0, top: 0, right: width, bottom: height,
      x: 0, y: 0,
      toJSON: () => ({}),
    } as DOMRect),
  } as unknown as HTMLElement
}

describe('positionPopup', () => {
  beforeEach(() => {
    vi.stubGlobal('innerWidth', 1280)
    vi.stubGlobal('innerHeight', 800)
    vi.stubGlobal('scrollX', 0)
    vi.stubGlobal('scrollY', 0)
  })

  it('positions below when there is room', () => {
    const refRect = { left: 100, top: 100, right: 200, bottom: 120, width: 100, height: 20 } as DOMRect
    const popup = makeMockPopup({ width: 200, height: 300 })
    const { placement, top } = positionPopup({ refRect, popup })
    expect(placement).toBe('below')
    expect(top).toBe(124) // bottom(120) + offset(4)
  })

  it('flips above when below would overflow viewport', () => {
    const refRect = { left: 100, top: 750, right: 200, bottom: 770, width: 100, height: 20 } as DOMRect
    const popup = makeMockPopup({ width: 200, height: 300 })
    const { placement, top } = positionPopup({ refRect, popup })
    expect(placement).toBe('above')
    expect(top).toBe(446) // top(750) - height(300) - offset(4)
  })

  it('shifts horizontally when popup would overflow right edge', () => {
    const refRect = { left: 1200, top: 100, right: 1250, bottom: 120, width: 50, height: 20 } as DOMRect
    const popup = makeMockPopup({ width: 200, height: 300 })
    const { left } = positionPopup({ refRect, popup })
    expect(left).toBe(1072) // 1280 - padding(8) - width(200)
  })
})
