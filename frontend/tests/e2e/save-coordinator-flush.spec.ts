/**
 * Category: save-coordinator flush-on-unmount (Fix-A1).
 *
 * Mirrors the A1c diagnostic case: an edit made within the 1500ms debounce
 * window must survive SPA navigation away from the ExperimentPage. The
 * unmount cleanup now flushes pending edits instead of silently dropping
 * them — beforeunload does not fire on React Router navigation.
 */
import { test, expect } from '@playwright/test'
import { CK009_ID, restoreCK009 } from './db'

test.beforeEach(() => {
  restoreCK009()
})

test.afterEach(() => {
  restoreCK009()
})

test('A1: edit survives SPA navigate-away within debounce window', async ({
  page,
}) => {
  await page.goto(`/experiments/${CK009_ID}`)
  await expect(page.locator('[data-testid="save-status"]')).toHaveText(
    'Saved',
    { timeout: 10000 }
  )

  // Make an edit.
  await page.locator('.ProseMirror').first().click()
  await page.keyboard.press('Control+End')
  await page.keyboard.type(' EDIT_MARKER_42')

  // SPA-navigate away immediately — within the 1500ms debounce window,
  // before the save indicator can reach "Saved". This is a real React
  // Router navigation (sidebar NavLink), not a full page load, so
  // beforeunload does not fire.
  await page.waitForTimeout(100)
  await page.click('a[href="/experiments"]')
  await expect(page).toHaveURL(/\/experiments$/)

  // Give the detached flush time to complete server-side.
  await page.waitForTimeout(2000)

  // Navigate back — ExperimentPage refetches fresh server data on mount.
  await page.goto(`/experiments/${CK009_ID}`)
  await expect(page.locator('[data-testid="save-status"]')).toHaveText(
    'Saved',
    { timeout: 10000 }
  )

  // The edit must have survived.
  await expect(page.locator('.ProseMirror').first()).toContainText(
    'EDIT_MARKER_42'
  )
})
