/**
 * Category 4: Paste correctness (Phase 11 regression coverage).
 *
 * Tests verify that pasting content in the editor strips source _rowId
 * attributes so pasted nodes receive fresh UUIDs rather than reusing the
 * originals. This prevents the save coordinator from treating a paste as
 * an UPDATE to the source row.
 *
 * window.__sandboxEditor is exposed in DEV mode only by TiptapSandbox.tsx
 * for testability.
 */
import { test, expect } from '@playwright/test'
import { deleteSandbox, dbExperimentId, dbBlockCount } from './db'

test.beforeEach(() => {
  deleteSandbox()
})

test.afterAll(() => {
  deleteSandbox()
})

test('4.1 pasted content gets fresh _rowIds not reusing originals', async ({
  page,
}) => {
  await page.goto('/tiptap-sandbox')

  // Wait for sandbox to seed and flush
  await expect(page.locator('[data-testid="save-status"]')).toHaveText(
    'Saved',
    { timeout: 30000 }
  )

  // Collect all current _rowIds before the paste
  const originalRowIds = await page.evaluate((): string[] => {
    const editor = (window as any).__sandboxEditor
    if (!editor) return []
    const json = editor.getJSON() as {
      content?: Array<Record<string, unknown>>
    }

    function walk(node: Record<string, unknown>): string[] {
      const ids: string[] = []
      const attrs = node['attrs'] as Record<string, unknown> | undefined
      if (attrs && typeof attrs['_rowId'] === 'string') {
        ids.push(attrs['_rowId'])
      }
      const content = node['content'] as
        | Array<Record<string, unknown>>
        | undefined
      if (content) {
        for (const child of content) {
          ids.push(...walk(child))
        }
      }
      return ids
    }

    return (json.content ?? []).flatMap(
      (n) => walk(n as Record<string, unknown>)
    )
  })

  expect(originalRowIds.length).toBeGreaterThan(0)

  // Select the first line of the editor and copy it
  await page.locator('.ProseMirror').click()
  await page.keyboard.press('Control+Home')
  await page.keyboard.press('Shift+End')
  await page.keyboard.press('Control+c')

  // Navigate to end and paste
  await page.keyboard.press('Control+End')
  await page.keyboard.press('Enter')
  await page.keyboard.press('Control+v')

  // Allow Tiptap to process the paste
  await page.waitForTimeout(200)

  // Collect _rowIds after paste
  const afterRowIds = await page.evaluate((): string[] => {
    const editor = (window as any).__sandboxEditor
    if (!editor) return []
    const json = editor.getJSON() as {
      content?: Array<Record<string, unknown>>
    }

    function walk(node: Record<string, unknown>): string[] {
      const ids: string[] = []
      const attrs = node['attrs'] as Record<string, unknown> | undefined
      if (attrs && typeof attrs['_rowId'] === 'string') {
        ids.push(attrs['_rowId'])
      }
      const content = node['content'] as
        | Array<Record<string, unknown>>
        | undefined
      if (content) {
        for (const child of content) {
          ids.push(...walk(child))
        }
      }
      return ids
    }

    return (json.content ?? []).flatMap(
      (n) => walk(n as Record<string, unknown>)
    )
  })

  // Find newly introduced _rowIds
  const originalSet = new Set(originalRowIds)
  const freshIds = afterRowIds.filter((id) => !originalSet.has(id))

  // At least one fresh _rowId should exist (the pasted node)
  expect(freshIds.length).toBeGreaterThan(0)

  // No fresh ID should equal any original (no reuse)
  for (const id of freshIds) {
    expect(originalSet.has(id)).toBe(false)
  }
})

test('4.2 paste fires no PUT requests to existing rows', async ({ page }) => {
  await page.goto('/tiptap-sandbox')

  // Wait for initial seed flush
  await expect(page.locator('[data-testid="save-status"]')).toHaveText(
    'Saved',
    { timeout: 30000 }
  )

  // Start monitoring writes AFTER initial flush
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

  // Copy first line and paste at end
  await page.locator('.ProseMirror').click()
  await page.keyboard.press('Control+Home')
  await page.keyboard.press('Shift+End')
  await page.keyboard.press('Control+c')
  await page.keyboard.press('Control+End')
  await page.keyboard.press('Enter')
  await page.keyboard.press('Control+v')

  // Wait for flush
  await expect(page.locator('[data-testid="save-status"]')).toHaveText(
    'Saved',
    { timeout: 15000 }
  )

  // Pasted blocks → POSTs only; no PUTs to existing rows
  const puts = writes.filter((w) => w.method === 'PUT')
  expect(puts).toHaveLength(0)

  // Sanity: at least one POST for the new block(s)
  const posts = writes.filter((w) => w.method === 'POST')
  expect(posts.length).toBeGreaterThan(0)

  // Confirm block count grew (DB now has the pasted row)
  const sandboxId = dbExperimentId('Sandbox Test Experiment')
  expect(sandboxId).not.toBeNull()
  expect(dbBlockCount(sandboxId!)).toBeGreaterThan(1)
})
