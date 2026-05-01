import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { Editor } from '@tiptap/react'
import type { ExperimentBlock } from '@/types'
import {
  useCreateBlock,
  useUpdateBlock,
  useDeleteBlock,
  useReorderBlocks,
} from '@/hooks/useExperimentBlocks'
import { tiptapDocToRows } from '@/blocks-tiptap/adapter/tiptapToDb'
import { inspectTransaction, type TransactionDiff } from './transactionInspector'

export type SaveStatus = 'idle' | 'dirty' | 'saving' | 'error'

export interface UseSaveCoordinatorOptions {
  editor: Editor | null
  experimentId: string | null
  initialBlocks?: ExperimentBlock[]
  debounceMs?: number
}

export interface SaveCoordinatorState {
  status: SaveStatus
  pendingCount: number
  lastError: string | null
}

const noop = () => {
  /* suppress mutation success invalidation */
}

function totalDiffSize(diff: TransactionDiff): number {
  return (
    diff.created.length +
    diff.deleted.length +
    diff.contentChanged.length +
    diff.topologyChanged.length
  )
}

// Topologically order creates so that parents appear before their children.
// `idsInBatch` is the set of local ids being created in this flush; rows
// whose parent is in the batch must wait for the parent to be placed first.
// Rows whose parent is null OR points outside the batch are emitted as soon
// as encountered.
export function orderCreatesTopologically(
  creates: ExperimentBlock[]
): ExperimentBlock[] {
  const idsInBatch = new Set(creates.map((r) => r.id))
  const ordered: ExperimentBlock[] = []
  const placed = new Set<string>()
  let pending = creates.slice()
  let safety = creates.length + 1

  while (pending.length > 0 && safety > 0) {
    let progress = false
    const remaining: ExperimentBlock[] = []
    for (const row of pending) {
      const pid = row.parent_id
      if (pid == null || !idsInBatch.has(pid) || placed.has(pid)) {
        ordered.push(row)
        placed.add(row.id)
        progress = true
      } else {
        remaining.push(row)
      }
    }
    pending = remaining
    if (!progress) {
      // Cycle or orphan — should not happen for ProseMirror docs. Emit
      // remaining rows in input order to avoid infinite loop; the server
      // may 400 these but we don't lock the client.
      ordered.push(...pending)
      break
    }
    safety -= 1
  }

  return ordered
}

export function useSaveCoordinator(
  options: UseSaveCoordinatorOptions
): SaveCoordinatorState {
  const { editor, experimentId, initialBlocks, debounceMs = 1500 } = options

  const queryClient = useQueryClient()
  const createMutation = useCreateBlock()
  const updateMutation = useUpdateBlock()
  const deleteMutation = useDeleteBlock()
  const reorderMutation = useReorderBlocks()

  const [status, setStatus] = useState<SaveStatus>('idle')
  const [pendingCount, setPendingCount] = useState(0)
  const [lastError, setLastError] = useState<string | null>(null)

  // Refs persist across renders but don't cause re-renders.
  const baselineRowsRef = useRef<ExperimentBlock[]>(initialBlocks ?? [])
  const currentRowsRef = useRef<ExperimentBlock[]>(initialBlocks ?? [])
  const localToServerRef = useRef<Map<string, string>>(new Map())
  const inFlightCreatesRef = useRef<Map<string, Promise<string>>>(new Map())
  const isFlushingRef = useRef(false)
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const experimentIdRef = useRef<string | null>(experimentId)
  const debounceMsRef = useRef(debounceMs)

  experimentIdRef.current = experimentId
  debounceMsRef.current = debounceMs

  // Keep baseline in sync when initial blocks change (e.g., experiment loads).
  useEffect(() => {
    if (initialBlocks) {
      baselineRowsRef.current = initialBlocks
      currentRowsRef.current = initialBlocks
    }
  }, [initialBlocks])

  function translateId(localId: string): string {
    return localToServerRef.current.get(localId) ?? localId
  }

  function translateParentId(parentLocalId: string | null): string | null {
    if (parentLocalId == null) return null
    return localToServerRef.current.get(parentLocalId) ?? parentLocalId
  }

  async function flush(): Promise<void> {
    const expId = experimentIdRef.current
    if (!expId) return
    if (isFlushingRef.current) return

    const baseline = baselineRowsRef.current
    const snapshot = currentRowsRef.current
    const diff = inspectTransaction(baseline, snapshot)
    if (totalDiffSize(diff) === 0) {
      setStatus('idle')
      setPendingCount(0)
      return
    }

    isFlushingRef.current = true
    setStatus('saving')

    try {
      // Wave 1: creates, in topological order. Sequential await so each
      // child has its parent's server id available via localToServer.
      const orderedCreates = orderCreatesTopologically(diff.created)
      for (const row of orderedCreates) {
        let resolvedParentId: string | null = null
        if (row.parent_id != null) {
          if (localToServerRef.current.has(row.parent_id)) {
            resolvedParentId = localToServerRef.current.get(row.parent_id)!
          } else if (inFlightCreatesRef.current.has(row.parent_id)) {
            resolvedParentId = await inFlightCreatesRef.current.get(
              row.parent_id
            )!
          } else {
            // Parent not in this batch and not in flight — assume it's
            // already a server id.
            resolvedParentId = row.parent_id
          }
        }

        const createPromise: Promise<string> = createMutation
          .mutateAsync(
            {
              experimentId: expId,
              data: {
                block_type: row.block_type,
                content: row.content,
                sort_order: row.sort_order,
                parent_id: resolvedParentId,
              },
            },
            { onSuccess: noop }
          )
          .then((created) => created.id)

        inFlightCreatesRef.current.set(row.id, createPromise)
        const serverId = await createPromise
        localToServerRef.current.set(row.id, serverId)
        inFlightCreatesRef.current.delete(row.id)
      }

      // Wave 2: deletes. Translate id and await any in-flight create for
      // the same id (cross-flush case).
      for (const row of diff.deleted) {
        if (inFlightCreatesRef.current.has(row.id)) {
          await inFlightCreatesRef.current.get(row.id)!
        }
        const serverId = translateId(row.id)
        await deleteMutation.mutateAsync(
          { experimentId: expId, blockId: serverId },
          { onSuccess: noop }
        )
      }

      // Wave 3: content updates.
      for (const row of diff.contentChanged) {
        if (inFlightCreatesRef.current.has(row.id)) {
          await inFlightCreatesRef.current.get(row.id)!
        }
        const serverId = translateId(row.id)
        await updateMutation.mutateAsync(
          {
            experimentId: expId,
            blockId: serverId,
            data: {
              block_type: row.block_type,
              content: row.content,
            },
          },
          { onSuccess: noop }
        )
      }

      // Wave 4: single reorder call covering all topology changes.
      if (diff.topologyChanged.length > 0) {
        for (const row of diff.topologyChanged) {
          if (inFlightCreatesRef.current.has(row.id)) {
            await inFlightCreatesRef.current.get(row.id)!
          }
        }
        const blocks = diff.topologyChanged.map((row) => ({
          id: translateId(row.id),
          sort_order: row.sort_order,
          parent_id: translateParentId(row.parent_id),
        }))
        await reorderMutation.mutateAsync(
          { experimentId: expId, blocks },
          { onSuccess: noop }
        )
      }

      // Success — advance baseline. Keep local ids; localToServer handles
      // wire-time translation for future flushes.
      baselineRowsRef.current = snapshot
      isFlushingRef.current = false
      setLastError(null)

      const newDiff = inspectTransaction(
        baselineRowsRef.current,
        currentRowsRef.current
      )
      const newPending = totalDiffSize(newDiff)
      setPendingCount(newPending)
      if (newPending > 0) {
        setStatus('dirty')
        scheduleFlush()
      } else {
        setStatus('idle')
      }
    } catch (err) {
      isFlushingRef.current = false
      const message = err instanceof Error ? err.message : String(err)
      setLastError(message)
      setStatus('error')
      queryClient.invalidateQueries({
        queryKey: ['experiments', expId],
      })
    }
  }

  function scheduleFlush(): void {
    if (debounceTimerRef.current != null) {
      clearTimeout(debounceTimerRef.current)
    }
    debounceTimerRef.current = setTimeout(() => {
      debounceTimerRef.current = null
      void flush()
    }, debounceMsRef.current)
  }

  function handleDocChange(): void {
    const expId = experimentIdRef.current
    if (!expId || !editor) return
    const newRows = tiptapDocToRows(editor.getJSON(), expId)
    currentRowsRef.current = newRows

    const diff = inspectTransaction(baselineRowsRef.current, newRows)
    const total = totalDiffSize(diff)
    setPendingCount(total)

    if (total === 0) {
      if (!isFlushingRef.current) {
        setStatus('idle')
      }
      return
    }

    if (!isFlushingRef.current) {
      setStatus('dirty')
    }
    scheduleFlush()
  }

  useEffect(() => {
    if (!editor) return

    const onTransaction = ({ transaction }: { transaction: any }) => {
      if (!transaction.docChanged) return
      handleDocChange()
    }

    editor.on('transaction', onTransaction)
    return () => {
      editor.off('transaction', onTransaction)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor])

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current != null) {
        clearTimeout(debounceTimerRef.current)
      }
    }
  }, [])

  return { status, pendingCount, lastError }
}
