import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Editor } from '@tiptap/core'
import React from 'react'
import { tiptapExtensions } from '@/blocks-tiptap/extensions'
import { tiptapDocToRows } from '@/blocks-tiptap/adapter/tiptapToDb'
import { useSaveCoordinator } from './saveCoordinator'

// ---------------------------------------------------------------------------
// Module-level mock state. Reset in beforeEach.
// ---------------------------------------------------------------------------

interface Deferred<T> {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (err: Error) => void
}

function makeDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (err: Error) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

let createCalls: any[] = []
let updateCalls: any[] = []
let deleteCalls: any[] = []
let reorderCalls: any[] = []
let createCounter = 0
let createMode: 'auto' | 'manual' = 'auto'
const createDeferreds: Deferred<any>[] = []
let createShouldThrow = false

function autoCreateResult(input: any) {
  return {
    id: 'srv-' + String(++createCounter),
    experiment_id: input.experimentId,
    block_type: input.data.block_type,
    content: input.data.content,
    sort_order: input.data.sort_order,
    parent_id: input.data.parent_id ?? null,
    created_at: null,
    updated_at: null,
  }
}

vi.mock('@/hooks/useExperimentBlocks', () => ({
  useCreateBlock: () => ({
    mutateAsync: async (input: any, _opts: any) => {
      createCalls.push(input)
      if (createShouldThrow) {
        throw new Error('mock create failure')
      }
      if (createMode === 'manual') {
        const d = makeDeferred<any>()
        createDeferreds.push(d)
        return d.promise
      }
      return autoCreateResult(input)
    },
  }),
  useUpdateBlock: () => ({
    mutateAsync: async (input: any, _opts: any) => {
      updateCalls.push(input)
      return { id: input.blockId, ...input.data }
    },
  }),
  useDeleteBlock: () => ({
    mutateAsync: async (input: any, _opts: any) => {
      deleteCalls.push(input)
      return undefined
    },
  }),
  useReorderBlocks: () => ({
    mutateAsync: async (input: any, _opts: any) => {
      reorderCalls.push(input)
      return undefined
    },
  }),
  useSnapshotPanel: () => ({ mutateAsync: async () => undefined }),
}))

// ---------------------------------------------------------------------------
// Test harness.
// ---------------------------------------------------------------------------

const EXP_ID = 'exp-1'

function createEditor(content?: any): Editor {
  const element = document.createElement('div')
  return new Editor({
    element,
    extensions: tiptapExtensions,
    content: content ?? { type: 'doc', content: [{ type: 'paragraph' }] },
  })
}

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )
  }
}

async function waitMs(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

async function setup(initialContent?: any) {
  const editor = createEditor(initialContent)
  // Force the _rowId-populate plugin to run by dispatching a no-op tx.
  // After this dispatches, the editor doc's _rowIds are settled.
  editor.view.dispatch(editor.state.tr)
  await waitMs(5)
  const initialBlocks = tiptapDocToRows(editor.getJSON(), EXP_ID)
  const Wrapper = makeWrapper()
  const hook = renderHook(
    () =>
      useSaveCoordinator({
        editor,
        experimentId: EXP_ID,
        initialBlocks,
        debounceMs: 20,
      }),
    { wrapper: Wrapper }
  )
  return { editor, initialBlocks, ...hook }
}

beforeEach(() => {
  createCalls = []
  updateCalls = []
  deleteCalls = []
  reorderCalls = []
  createCounter = 0
  createMode = 'auto'
  createDeferreds.length = 0
  createShouldThrow = false
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useSaveCoordinator', () => {
  it('1. idle on mount with no edits', async () => {
    const { editor, result } = await setup()
    await waitMs(50)
    expect(result.current.status).toBe('idle')
    expect(result.current.pendingCount).toBe(0)
    editor.destroy()
  })

  it('2. dirty after one transaction', async () => {
    const { editor, result } = await setup()
    await act(async () => {
      editor.commands.focus()
      editor.commands.insertContent('hi')
    })
    // Don't wait long enough for debounce to fire.
    await waitMs(2)
    expect(result.current.status).toBe('dirty')
    expect(result.current.pendingCount).toBeGreaterThan(0)
    editor.destroy()
  })

  it('3. saving after debounce fires', async () => {
    createMode = 'manual'
    const { editor, result } = await setup()
    await act(async () => {
      editor.commands.focus()
      editor.commands.insertContent({
        type: 'paragraph',
        content: [{ type: 'text', text: 'block' }],
      })
    })
    // Wait past debounce; flush starts; CREATE pending.
    await waitMs(40)
    await waitFor(() => expect(result.current.status).toBe('saving'))
    expect(createCalls.length).toBeGreaterThanOrEqual(1)
    // Resolve the deferred to allow flush to finish (clean teardown).
    for (const d of createDeferreds) {
      d.resolve({
        id: 'cleanup-' + String(crypto.randomUUID()),
        experiment_id: EXP_ID,
        block_type: 'paragraph',
        content: {},
        sort_order: 0,
        parent_id: null,
        created_at: null,
        updated_at: null,
      })
    }
    await waitMs(40)
    editor.destroy()
  })

  it('4. saved after save success', async () => {
    const { editor, result } = await setup()
    await act(async () => {
      editor.commands.focus()
      editor.commands.insertContent({
        type: 'paragraph',
        content: [{ type: 'text', text: 'block' }],
      })
    })
    await waitFor(() => expect(result.current.status).toBe('saved'), {
      timeout: 1000,
    })
    expect(createCalls.length).toBeGreaterThanOrEqual(1)
    editor.destroy()
  })

  it('5. error after mocked save failure', async () => {
    createShouldThrow = true
    const { editor, result } = await setup()
    await act(async () => {
      editor.commands.focus()
      editor.commands.insertContent({
        type: 'paragraph',
        content: [{ type: 'text', text: 'block' }],
      })
    })
    await waitFor(() => expect(result.current.status).toBe('error'), {
      timeout: 1000,
    })
    expect(result.current.lastError).toContain('mock create failure')
    editor.destroy()
  })

  it('6. multiple transactions within debounce window batch', async () => {
    // Start with one paragraph in baseline so subsequent inserts modify it.
    const startContent = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'start' }],
        },
      ],
    }
    const { editor, result } = await setup(startContent)
    // Three rapid edits to the same paragraph, all within the debounce window.
    await act(async () => {
      editor.commands.focus('end')
      editor.commands.insertContent(' a')
    })
    await waitMs(2)
    await act(async () => {
      editor.commands.insertContent(' b')
    })
    await waitMs(2)
    await act(async () => {
      editor.commands.insertContent(' c')
    })
    await waitFor(() => expect(result.current.status).toBe('saved'), {
      timeout: 1000,
    })
    // Single paragraph existed in baseline, so we expect ONE update call,
    // not three.
    expect(createCalls.length).toBe(0)
    expect(updateCalls.length).toBe(1)
    editor.destroy()
  })

  it('7. in-flight DELETE uses resolved server id from prior CREATE', async () => {
    createMode = 'manual'
    const { editor, result } = await setup()
    // T1: insert a paragraph.
    await act(async () => {
      editor.commands.focus()
      editor.commands.insertContent({
        type: 'paragraph',
        content: [{ type: 'text', text: 'queued' }],
      })
    })
    // Let debounce fire; flush 1 starts; CREATE pending.
    await waitMs(40)
    await waitFor(() => expect(createCalls.length).toBe(1))
    // Resolve the create with a known server id.
    createDeferreds[0].resolve({
      id: 'server-X',
      experiment_id: EXP_ID,
      block_type: 'paragraph',
      content: { text: 'queued' },
      sort_order: 1,
      parent_id: null,
      created_at: null,
      updated_at: null,
    })
    await waitFor(() => expect(result.current.status).toBe('saved'), {
      timeout: 1000,
    })
    // Reset the call-record so we observe ONLY the deletes triggered by
    // the next user action.
    deleteCalls.length = 0
    createCalls.length = 0
    // Now blow away the entire doc, replacing it with a single empty
    // paragraph. The "queued" paragraph (server id "server-X") must be
    // deleted using its translated server id.
    createMode = 'auto'
    await act(async () => {
      editor.commands.setContent({
        type: 'doc',
        content: [{ type: 'paragraph' }],
      })
    })
    await waitFor(
      () => {
        const ids = deleteCalls.map((c) => c.blockId)
        expect(ids).toContain('server-X')
      },
      { timeout: 1000 }
    )
    editor.destroy()
  })

  it('8. in-flight UPDATE uses resolved server id from prior CREATE', async () => {
    createMode = 'manual'
    const { editor, result } = await setup()
    await act(async () => {
      editor.commands.focus()
      editor.commands.insertContent({
        type: 'paragraph',
        content: [{ type: 'text', text: 'first' }],
      })
    })
    await waitMs(40)
    await waitFor(() => expect(createCalls.length).toBe(1))
    createDeferreds[0].resolve({
      id: 'server-Y',
      experiment_id: EXP_ID,
      block_type: 'paragraph',
      content: { text: 'first' },
      sort_order: 1,
      parent_id: null,
      created_at: null,
      updated_at: null,
    })
    await waitFor(() => expect(result.current.status).toBe('saved'), {
      timeout: 1000,
    })
    createMode = 'auto'
    // Edit the paragraph the server now owns.
    await act(async () => {
      editor.commands.focus('end')
      editor.commands.insertContent(' edited')
    })
    await waitFor(() => expect(updateCalls.length).toBeGreaterThanOrEqual(1), {
      timeout: 1000,
    })
    const updatedIds = updateCalls.map((c) => c.blockId)
    expect(updatedIds).toContain('server-Y')
    editor.destroy()
  })

  it('9. skip transactions with no doc change', async () => {
    const { editor, result } = await setup({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'static' }],
        },
      ],
    })
    await waitMs(20)
    expect(result.current.status).toBe('idle')
    // Selection-only transaction; docChanged=false.
    await act(async () => {
      editor.commands.setTextSelection({ from: 1, to: 1 })
    })
    await waitMs(40)
    expect(result.current.status).toBe('idle')
    expect(createCalls.length).toBe(0)
    expect(updateCalls.length).toBe(0)
    editor.destroy()
  })

  it('10. mass paste of 50 rows in one tx → 50 createBlock calls', async () => {
    const { editor, result } = await setup()
    const paragraphs: Array<{ type: string; content: Array<{ type: string; text: string }> }> = []
    for (let i = 0; i < 50; i++) {
      paragraphs.push({
        type: 'paragraph',
        content: [{ type: 'text', text: 'p' + String(i) }],
      })
    }
    await act(async () => {
      editor.commands.focus()
      editor.commands.insertContent(paragraphs)
    })
    await waitFor(() => expect(result.current.status).toBe('saved'), {
      timeout: 2000,
    })
    expect(createCalls.length).toBe(50)
    editor.destroy()
  })

  it('11. idempotent CREATE+DELETE within window → zero mutations', async () => {
    const { editor, result } = await setup()
    await act(async () => {
      editor.commands.focus()
      editor.commands.insertContent({
        type: 'paragraph',
        content: [{ type: 'text', text: 'fleeting' }],
      })
    })
    // Undo restores the exact prior doc state, including _rowIds.
    await act(async () => {
      editor.commands.undo()
    })
    await waitMs(60)
    await waitFor(() => expect(result.current.status).toBe('idle'))
    expect(createCalls.length).toBe(0)
    expect(deleteCalls.length).toBe(0)
    expect(updateCalls.length).toBe(0)
    editor.destroy()
  })

  it('12. topological ordering: column_list parents created before children', async () => {
    const { editor, result } = await setup()
    const columnLayout = {
      type: 'column_list',
      attrs: { column_count: 2 },
      content: [
        {
          type: 'column',
          attrs: { width_pct: 50 },
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'left' }],
            },
          ],
        },
        {
          type: 'column',
          attrs: { width_pct: 50 },
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'right' }],
            },
          ],
        },
      ],
    }
    await act(async () => {
      editor.commands.focus()
      editor.commands.insertContent(columnLayout)
    })
    await waitFor(() => expect(result.current.status).toBe('saved'), {
      timeout: 2000,
    })

    const types = createCalls.map((c) => c.data.block_type)
    // Expect at least 5 calls: column_list, column, column, paragraph, paragraph.
    expect(types).toContain('column_list')
    expect(types.filter((t) => t === 'column').length).toBe(2)
    expect(types.filter((t) => t === 'paragraph').length).toBeGreaterThanOrEqual(2)

    // The column_list is created before either column.
    const colListIdx = types.indexOf('column_list')
    const firstColIdx = types.indexOf('column')
    expect(colListIdx).toBeLessThan(firstColIdx)

    // Each column's POST has parent_id set to the column_list's server id.
    const colListCall = createCalls[colListIdx]
    const colListServerId = 'srv-' + String(colListIdx + 1)
    expect(colListCall.data.parent_id).toBeNull()

    const columnCalls = createCalls.filter((c) => c.data.block_type === 'column')
    for (const colCall of columnCalls) {
      expect(colCall.data.parent_id).toBe(colListServerId)
    }

    // Each paragraph that's a child of a column has a column server id parent.
    const paragraphCallsAsChildren = createCalls.filter(
      (c) =>
        c.data.block_type === 'paragraph' && c.data.parent_id !== null
    )
    expect(paragraphCallsAsChildren.length).toBe(2)
    const columnServerIds = new Set(
      createCalls
        .map((c, i) => ({ c, i }))
        .filter((x) => x.c.data.block_type === 'column')
        .map((x) => 'srv-' + String(x.i + 1))
    )
    for (const pCall of paragraphCallsAsChildren) {
      expect(columnServerIds.has(pCall.data.parent_id)).toBe(true)
    }
    editor.destroy()
  })

  it('13. beforeunload event prevents navigation when pending changes exist', async () => {
    const { editor } = await setup()
    // Simulate user typing — schedule a debounce flush, do NOT wait for it
    // to fire so debounceTimerRef remains set.
    await act(async () => {
      editor.commands.focus()
      editor.commands.insertContent('hi')
    })
    await waitMs(2)
    // Dispatch the beforeunload event directly so we can inspect it.
    const event = new Event('beforeunload', { cancelable: true }) as BeforeUnloadEvent
    let preventCalled = false
    const origPreventDefault = event.preventDefault.bind(event)
    event.preventDefault = () => {
      preventCalled = true
      origPreventDefault()
    }
    window.dispatchEvent(event)
    expect(preventCalled).toBe(true)
    editor.destroy()
  })

  it('14. beforeunload event does NOT prevent navigation when no pending changes', async () => {
    const { editor } = await setup()
    await waitMs(50)
    const event = new Event('beforeunload', { cancelable: true }) as BeforeUnloadEvent
    let preventCalled = false
    const origPreventDefault = event.preventDefault.bind(event)
    event.preventDefault = () => {
      preventCalled = true
      origPreventDefault()
    }
    window.dispatchEvent(event)
    expect(preventCalled).toBe(false)
    editor.destroy()
  })

  it('15. status is "dirty" while debounce timer is buffering, not "saved" or "idle"', async () => {
    const { editor, result } = await setup()
    await act(async () => {
      editor.commands.focus()
      editor.commands.insertContent('hi')
    })
    // Don't wait long enough for debounce (20ms) to fire.
    await waitMs(2)
    expect(result.current.status).toBe('dirty')
    editor.destroy()
  })

  it('16. status returns to "saved" only after flush completes AND no new debounce', async () => {
    const startContent = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'start' }],
        },
      ],
    }
    const { editor, result } = await setup(startContent)
    // First successful flush.
    await act(async () => {
      editor.commands.focus('end')
      editor.commands.insertContent(' a')
    })
    await waitFor(() => expect(result.current.status).toBe('saved'), {
      timeout: 1000,
    })
    // A new edit must immediately move status away from 'saved'.
    await act(async () => {
      editor.commands.insertContent(' b')
    })
    await waitMs(2)
    expect(result.current.status).toBe('dirty')
    editor.destroy()
  })
})
