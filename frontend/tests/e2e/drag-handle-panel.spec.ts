/**
 * Phase 9b-fix-2 diagnostic: drag handle must not crash on flow_panel /
 * if_panel node views.
 *
 * Reproduces the regression where loading an experiment page containing
 * a panel block throws `Cannot read properties of null (reading
 * 'getBoundingClientRect')`.
 */
import { test, expect } from '@playwright/test'
import { CK009_ID } from './db'

const FDA1_ID = '36989faa-6d22-4601-8896-6b18fa65c560'
const SANDBOX_ID = '2459272d-4f71-403b-82bf-39659a93a31a'

function attachListeners(page: import('@playwright/test').Page): string[] {
  const errors: string[] = []
  page.on('pageerror', (err) => {
    errors.push('pageerror: ' + err.message + (err.stack ? '\n' + err.stack : ''))
  })
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      errors.push('console.error: ' + msg.text())
    }
  })
  // Patch window.onerror inside the page too
  page.addInitScript(() => {
    const origErr = window.console.error
    ;(window as unknown as { __caughtErrors: string[] }).__caughtErrors = []
    window.addEventListener('error', (e) => {
      ;(window as unknown as { __caughtErrors: string[] }).__caughtErrors.push(
        'window.error: ' + (e.error?.message ?? e.message) + '\n' + (e.error?.stack ?? '')
      )
    })
    window.addEventListener('unhandledrejection', (e) => {
      ;(window as unknown as { __caughtErrors: string[] }).__caughtErrors.push(
        'unhandledrejection: ' + String(e.reason)
      )
    })
    window.console.error = (...args: unknown[]) => {
      ;(window as unknown as { __caughtErrors: string[] }).__caughtErrors.push(
        'console.error: ' + args.map((a) => (a instanceof Error ? a.stack ?? a.message : String(a))).join(' ')
      )
      origErr(...(args as []))
    }
  })
  return errors
}

async function getAllErrors(
  page: import('@playwright/test').Page,
  listenerErrors: string[]
): Promise<string[]> {
  const inPage = await page.evaluate(
    () => (window as unknown as { __caughtErrors?: string[] }).__caughtErrors ?? []
  )
  return [...listenerErrors, ...inPage]
}

test.describe('drag handle on panel blocks', () => {
  test('FDA1 (3 if_panel) — capture any getBoundingClientRect errors', async ({
    page,
  }) => {
    const listenerErrors = attachListeners(page)
    await page.goto('/experiments/' + FDA1_ID)
    await expect(page.locator('[data-testid="save-status"]')).toBeVisible({
      timeout: 30000,
    })
    await page.waitForTimeout(4000)

    // Hover over the first panel
    const editor = page.locator('.ProseMirror').first()
    const box = await editor.boundingBox()
    if (box) {
      for (const yFrac of [0.1, 0.3, 0.5, 0.7, 0.9]) {
        await page.mouse.move(box.x + 100, box.y + box.height * yFrac, { steps: 10 })
        await page.waitForTimeout(200)
      }
    }
    // Reload to simulate the "load with panel" scenario
    await page.reload()
    await expect(page.locator('[data-testid="save-status"]')).toBeVisible({
      timeout: 30000,
    })
    await page.waitForTimeout(4000)

    const errors = await getAllErrors(page, listenerErrors)
    const crashErrors = errors.filter((e) =>
      e.includes('getBoundingClientRect')
    )
    if (crashErrors.length > 0) {
      console.log('\n=== CRASH DETAIL ===')
      for (const e of crashErrors) console.log(e)
      console.log('=== END ===\n')
    }
    if (errors.length > 0 && crashErrors.length === 0) {
      console.log('\n=== NON-CRASH ERRORS (for context) ===')
      for (const e of errors.slice(0, 5)) console.log(e.substring(0, 500))
      console.log('=== END ===\n')
    }
    expect(crashErrors).toEqual([])
  })

  test('Sandbox (panels in columns) — capture any errors', async ({ page }) => {
    const listenerErrors = attachListeners(page)
    await page.goto('/experiments/' + SANDBOX_ID)
    await expect(page.locator('[data-testid="save-status"]')).toBeVisible({
      timeout: 30000,
    })
    await page.waitForTimeout(4000)
    await page.reload()
    await expect(page.locator('[data-testid="save-status"]')).toBeVisible({
      timeout: 30000,
    })
    await page.waitForTimeout(4000)

    const errors = await getAllErrors(page, listenerErrors)
    const crashErrors = errors.filter((e) =>
      e.includes('getBoundingClientRect')
    )
    if (crashErrors.length > 0) {
      console.log('\n=== CRASH DETAIL ===')
      for (const e of crashErrors) console.log(e)
      console.log('=== END ===\n')
    }
    expect(crashErrors).toEqual([])
  })

  test('cK009 (single flow_panel) — capture any errors', async ({ page }) => {
    const listenerErrors = attachListeners(page)
    await page.goto('/experiments/' + CK009_ID)
    await expect(page.locator('[data-testid="save-status"]')).toBeVisible({
      timeout: 30000,
    })
    await page.waitForTimeout(4000)

    const errors = await getAllErrors(page, listenerErrors)
    const crashErrors = errors.filter((e) =>
      e.includes('getBoundingClientRect')
    )
    if (crashErrors.length > 0) {
      console.log('\n=== CRASH DETAIL ===')
      for (const e of crashErrors) console.log(e)
      console.log('=== END ===\n')
    }
    expect(crashErrors).toEqual([])
  })
})
