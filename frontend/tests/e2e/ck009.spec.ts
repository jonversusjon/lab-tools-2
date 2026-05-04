import { test, expect } from '@playwright/test'
import { CK009_ID, dbBlockCount, restoreCK009 } from './db'

test.beforeEach(() => {
  restoreCK009()
})

test.afterAll(() => {
  restoreCK009()
})

test('1.1 cK009 loads with block_count = 1', async ({ page }) => {
  await page.goto(`/experiments/${CK009_ID}`)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(2000)
  expect(dbBlockCount(CK009_ID)).toBe(1)
})

test('1.2 block_count stays 1 across 3 reloads', async ({ page }) => {
  await page.goto(`/experiments/${CK009_ID}`)
  for (let i = 0; i < 3; i++) {
    await page.reload()
    await expect(page.locator('[data-testid="save-status"]')).toHaveText(
      'Saved',
      { timeout: 10000 }
    )
    expect(dbBlockCount(CK009_ID)).toBe(1)
  }
})

test('1.3 page load fires no writes to blocks endpoint', async ({ page }) => {
  const writes: { method: string; url: string }[] = []
  page.on('request', (req) => {
    const url = req.url()
    const method = req.method()
    if (
      /\/api\/v1\/experiments\/.*\/blocks/.test(url) &&
      ['POST', 'PUT', 'DELETE'].includes(method)
    ) {
      writes.push({ method, url })
    }
  })

  await page.goto(`/experiments/${CK009_ID}`)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(2000)

  expect(writes).toEqual([])
})

test('1.4 typing one character fires exactly 1 POST and 0 PUTs', async ({
  page,
}) => {
  const writes: { method: string; url: string }[] = []
  page.on('request', (req) => {
    const url = req.url()
    const method = req.method()
    if (
      /\/api\/v1\/experiments\/.*\/blocks/.test(url) &&
      ['POST', 'PUT', 'DELETE'].includes(method)
    ) {
      writes.push({ method, url })
    }
  })

  await page.goto(`/experiments/${CK009_ID}`)
  await page.waitForLoadState('networkidle')
  // Wait for editor to settle before typing
  await expect(page.locator('[data-testid="save-status"]')).toHaveText(
    'Saved',
    { timeout: 10000 }
  )

  await page.locator('.ProseMirror').click()
  await page.keyboard.press('Control+End')
  await page.keyboard.type('x')

  // Wait for flush: indicator returns to "Saved"
  await expect(page.locator('[data-testid="save-status"]')).toHaveText(
    'Saved',
    { timeout: 10000 }
  )

  const posts = writes.filter((w) => w.method === 'POST')
  const puts = writes.filter((w) => w.method === 'PUT')
  expect(posts).toHaveLength(1)
  expect(puts).toHaveLength(0)
})
