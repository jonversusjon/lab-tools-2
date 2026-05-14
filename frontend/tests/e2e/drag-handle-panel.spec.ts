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

const API_BASE = 'http://localhost:8000/api/v1'

const FLOW_PANEL_CONTENT = {
  source_panel_id: null,
  name: 'Sandbox demo panel',
  instrument: null,
  targets: [],
  assignments: [],
  volume_params: {
    num_samples: 1,
    volume_per_sample_ul: 100,
    pipet_error_factor: 1.1,
    dilution_source: 'flow',
  },
}

const IF_PANEL_CONTENT = {
  source_panel_id: null,
  name: 'Sandbox IF demo panel',
  panel_type: 'IF',
  microscope: null,
  view_mode: 'simple',
  targets: [],
  assignments: [],
  volume_params: {
    num_samples: 1,
    volume_per_sample_ul: 200,
    pipet_error_factor: 1.1,
    dilution_source: 'icc_if',
  },
}

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
  // Set by the Sandbox test, which auto-creates its own experiment rather
  // than depending on a hardcoded ID being present in the local DB.
  let sandboxPanelExperimentId: string | null = null

  test.afterEach(async ({ request }) => {
    if (sandboxPanelExperimentId) {
      await request.delete(API_BASE + '/experiments/' + sandboxPanelExperimentId)
      sandboxPanelExperimentId = null
    }
  })

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

  test('Sandbox (panels in columns) — capture any errors', async ({
    page,
    request,
  }) => {
    // Auto-create an experiment with a flow_panel and an if_panel nested in
    // sibling columns, mirroring the Tiptap sandbox seed topology.
    const expRes = await request.post(API_BASE + '/experiments', {
      data: {
        name: 'Drag Handle Panel Test',
        description: 'auto-created by e2e',
      },
    })
    expect(expRes.ok()).toBeTruthy()
    const experiment = await expRes.json()
    sandboxPanelExperimentId = experiment.id

    const clRes = await request.post(
      API_BASE + '/experiments/' + experiment.id + '/blocks',
      {
        data: {
          block_type: 'column_list',
          content: { column_count: 2 },
          sort_order: 0,
          parent_id: null,
        },
      }
    )
    expect(clRes.ok()).toBeTruthy()
    const columnList = await clRes.json()

    const columnIds: string[] = []
    for (let i = 0; i < 2; i++) {
      const colRes = await request.post(
        API_BASE + '/experiments/' + experiment.id + '/blocks',
        {
          data: {
            block_type: 'column',
            content: { width_pct: 50 },
            sort_order: i,
            parent_id: columnList.id,
          },
        }
      )
      expect(colRes.ok()).toBeTruthy()
      columnIds.push((await colRes.json()).id)
    }

    const flowRes = await request.post(
      API_BASE + '/experiments/' + experiment.id + '/blocks',
      {
        data: {
          block_type: 'flow_panel',
          content: FLOW_PANEL_CONTENT,
          sort_order: 0,
          parent_id: columnIds[0],
        },
      }
    )
    expect(flowRes.ok()).toBeTruthy()

    const ifRes = await request.post(
      API_BASE + '/experiments/' + experiment.id + '/blocks',
      {
        data: {
          block_type: 'if_panel',
          content: IF_PANEL_CONTENT,
          sort_order: 0,
          parent_id: columnIds[1],
        },
      }
    )
    expect(ifRes.ok()).toBeTruthy()

    const listenerErrors = attachListeners(page)
    await page.goto('/experiments/' + experiment.id)
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
