/**
 * Category 3: beforeunload guard.
 *
 * Tests 3.1 and 3.2 use page.evaluate to synthesize a BeforeUnloadEvent
 * and verify defaultPrevented. This exercises the JavaScript-level
 * correctness of the guard without triggering the actual browser dialog
 * (which Playwright cannot reliably intercept in all headless environments).
 */
import { test, expect } from '@playwright/test'
import { CK009_ID, restoreCK009 } from './db'

test.beforeEach(() => {
  restoreCK009()
})

test.afterEach(() => {
  restoreCK009()
})

test('3.1 beforeunload is prevented when changes are pending', async ({
  page,
}) => {
  await page.goto(`/experiments/${CK009_ID}`)
  await expect(page.locator('[data-testid="save-status"]')).toHaveText(
    'Saved',
    { timeout: 10000 }
  )

  // Type to put the editor in dirty state
  await page.locator('.ProseMirror').click()
  await page.keyboard.press('Control+End')
  await page.keyboard.type('x')

  // Give React a tick to process the state change (don't wait full debounce)
  await page.waitForTimeout(100)

  const wasPrevented = await page.evaluate(() => {
    const event = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(event)
    return event.defaultPrevented
  })

  expect(wasPrevented).toBe(true)
})

test('3.2 beforeunload is not prevented after save completes', async ({
  page,
}) => {
  await page.goto(`/experiments/${CK009_ID}`)
  await expect(page.locator('[data-testid="save-status"]')).toHaveText(
    'Saved',
    { timeout: 10000 }
  )
  await page.waitForTimeout(1000)

  // On clean load with no pending changes, the guard should not fire
  const wasPrevented = await page.evaluate(() => {
    const event = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(event)
    return event.defaultPrevented
  })

  expect(wasPrevented).toBe(false)
})

test('3.3 beforeunload releases after flush completes', async ({ page }) => {
  await page.goto(`/experiments/${CK009_ID}`)
  await expect(page.locator('[data-testid="save-status"]')).toHaveText(
    'Saved',
    { timeout: 10000 }
  )

  // Type to make dirty
  await page.locator('.ProseMirror').click()
  await page.keyboard.press('Control+End')
  await page.keyboard.type('x')

  // Wait for the full flush to complete
  await expect(page.locator('[data-testid="save-status"]')).toHaveText(
    'Saved',
    { timeout: 10000 }
  )

  // Guard should now release
  const wasPrevented = await page.evaluate(() => {
    const event = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(event)
    return event.defaultPrevented
  })

  expect(wasPrevented).toBe(false)
})
