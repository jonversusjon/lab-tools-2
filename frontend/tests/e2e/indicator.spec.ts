/**
 * Category 2: Save indicator state transitions.
 *
 * Status labels rendered by ExperimentPage:
 *   idle    → "Saved"
 *   saved   → "Saved"
 *   dirty   → "Unsaved changes"
 *   saving  → "Saving..."
 *   error   → "Save error"
 */
import { test, expect } from '@playwright/test'
import { CK009_ID, restoreCK009 } from './db'

test.beforeEach(() => {
  restoreCK009()
})

test.afterEach(() => {
  restoreCK009()
})

test('2.1 clean load shows Saved', async ({ page }) => {
  await page.goto(`/experiments/${CK009_ID}`)
  await expect(page.locator('[data-testid="save-status"]')).toHaveText(
    'Saved',
    { timeout: 10000 }
  )
})

test('2.2 typing shows Unsaved changes', async ({ page }) => {
  await page.goto(`/experiments/${CK009_ID}`)
  await expect(page.locator('[data-testid="save-status"]')).toHaveText(
    'Saved',
    { timeout: 10000 }
  )

  await page.locator('.ProseMirror').click()
  await page.keyboard.press('Control+End')
  await page.keyboard.type('x')

  await expect(page.locator('[data-testid="save-status"]')).toHaveText(
    'Unsaved changes',
    { timeout: 5000 }
  )
})

test('2.3 after debounce and flush indicator returns to Saved', async ({
  page,
}) => {
  await page.goto(`/experiments/${CK009_ID}`)
  await expect(page.locator('[data-testid="save-status"]')).toHaveText(
    'Saved',
    { timeout: 10000 }
  )

  await page.locator('.ProseMirror').click()
  await page.keyboard.press('Control+End')
  await page.keyboard.type('x')

  await expect(page.locator('[data-testid="save-status"]')).toHaveText(
    'Unsaved changes',
    { timeout: 5000 }
  )

  // Wait for full debounce + flush
  await expect(page.locator('[data-testid="save-status"]')).toHaveText(
    'Saved',
    { timeout: 10000 }
  )
})

test('2.4 undo returns to Saved without waiting full debounce', async ({
  page,
}) => {
  await page.goto(`/experiments/${CK009_ID}`)
  await expect(page.locator('[data-testid="save-status"]')).toHaveText(
    'Saved',
    { timeout: 10000 }
  )

  await page.locator('.ProseMirror').click()
  await page.keyboard.press('Control+End')
  await page.keyboard.type('x')

  await expect(page.locator('[data-testid="save-status"]')).toHaveText(
    'Unsaved changes',
    { timeout: 5000 }
  )

  // Undo — doc reverts to baseline; debounce should be cancelled immediately
  await page.keyboard.press('Control+z')

  // Wait well under the 1500ms debounce window — should already be Saved
  await page.waitForTimeout(500)
  await expect(page.locator('[data-testid="save-status"]')).toHaveText(
    'Saved',
    { timeout: 2000 }
  )
})
