/**
 * Categories 5 + 6: Sandbox auto-create idempotency and seed topology.
 *
 * Category 5 — Bug A regression: the module-level Promise cache in
 * TiptapSandbox.tsx prevents duplicate experiment creation under
 * React StrictMode and HMR double-mounts.
 *
 * Category 6 — Bug B regression: seed content topology matches the
 * expected structure (2 column_lists, 4 columns, flow_panel + if_panel
 * under the second column_list, no orphaned rows).
 */
import { test, expect } from '@playwright/test'
import {
  SANDBOX_NAME,
  deleteSandbox,
  dbExperimentCount,
  dbExperimentId,
  dbBlockTopology,
  dbBlockCount,
} from './db'

// Helpers ------------------------------------------------------------------

async function waitForSandboxSaved(page: import('@playwright/test').Page) {
  await page.goto('/tiptap-sandbox')
  await expect(page.locator('[data-testid="save-status"]')).toHaveText(
    'Saved',
    { timeout: 30000 }
  )
}

// Suite --------------------------------------------------------------------

test.describe.serial('sandbox auto-create idempotency', () => {
  test('5.1 first visit creates exactly one sandbox row', async ({ page }) => {
    deleteSandbox()
    await waitForSandboxSaved(page)
    expect(dbExperimentCount(SANDBOX_NAME)).toBe(1)
  })

  test('5.2 second visit does not create a duplicate', async ({ page }) => {
    // Sandbox already exists from 5.1 — do NOT delete before this test
    await waitForSandboxSaved(page)
    expect(dbExperimentCount(SANDBOX_NAME)).toBe(1)
  })

  test('5.3 re-creation after deletion works', async ({ page }) => {
    deleteSandbox()
    expect(dbExperimentCount(SANDBOX_NAME)).toBe(0)
    await waitForSandboxSaved(page)
    expect(dbExperimentCount(SANDBOX_NAME)).toBe(1)
  })
})

test.describe.serial('sandbox seed content topology', () => {
  test.beforeAll(() => {
    deleteSandbox()
  })

  test('6.1 seed content has correct block topology', async ({ page }) => {
    // beforeAll deletes the sandbox, so this is always a fresh creation.
    // The save coordinator initialises with an empty baseline, then the
    // editor fires its first transaction which transitions the status from
    // idle → dirty → saved. We must wait for that full cycle rather than
    // stopping at the initial idle="Saved" label.
    await page.goto('/tiptap-sandbox')
    await expect(page.locator('[data-testid="save-status"]')).not.toHaveText(
      'Saved',
      { timeout: 5000 }
    )
    await expect(page.locator('[data-testid="save-status"]')).toHaveText(
      'Saved',
      { timeout: 30000 }
    )

    const sandboxId = dbExperimentId(SANDBOX_NAME)
    expect(sandboxId).not.toBeNull()

    const blocks = dbBlockTopology(sandboxId!)

    // Must have at least some blocks
    expect(blocks.length).toBeGreaterThan(0)

    // Exactly 2 column_list rows
    const columnLists = blocks.filter((b) => b.block_type === 'column_list')
    expect(columnLists).toHaveLength(2)

    // Exactly 4 column rows (2 per column_list)
    const columns = blocks.filter((b) => b.block_type === 'column')
    expect(columns).toHaveLength(4)

    // Each column_list has exactly 2 column children
    for (const cl of columnLists) {
      const children = columns.filter((c) => c.parent_id === cl.id)
      expect(children).toHaveLength(2)
    }

    // flow_panel exists and its parent is a column
    const flowPanel = blocks.find((b) => b.block_type === 'flow_panel')
    expect(flowPanel).toBeDefined()
    const flowParent = blocks.find((b) => b.id === flowPanel!.parent_id)
    expect(flowParent?.block_type).toBe('column')

    // flow_panel's grandparent is a column_list
    const flowGrandparent = blocks.find(
      (b) => b.id === flowParent!.parent_id
    )
    expect(flowGrandparent?.block_type).toBe('column_list')

    // if_panel exists and its parent is a sibling column under the same column_list
    const ifPanel = blocks.find((b) => b.block_type === 'if_panel')
    expect(ifPanel).toBeDefined()
    const ifParent = blocks.find((b) => b.id === ifPanel!.parent_id)
    expect(ifParent?.block_type).toBe('column')
    expect(ifParent?.parent_id).toBe(flowGrandparent!.id)

    // flow_panel and if_panel are in sibling columns (different columns, same parent)
    expect(flowParent!.id).not.toBe(ifParent!.id)
    expect(flowParent!.parent_id).toBe(ifParent!.parent_id)

    // No orphaned rows: every non-null parent_id resolves to an existing block
    const blockIds = new Set(blocks.map((b) => b.id))
    for (const block of blocks) {
      if (block.parent_id !== null) {
        expect(blockIds.has(block.parent_id)).toBe(true)
      }
    }
  })

  test.afterAll(() => {
    deleteSandbox()
  })
})
