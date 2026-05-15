import { useParams, Navigate } from 'react-router-dom'
import { EditorContent, useEditor } from '@tiptap/react'
import { useEffect, useMemo, useState } from 'react'
import { tiptapExtensions } from '@/blocks-tiptap/extensions'
import { stripRowIdsFromSlice } from '@/blocks-tiptap/paste'
import { rowsToTiptapDoc } from '@/blocks-tiptap/adapter/dbToTiptap'
import { useSaveCoordinator, statusLabel } from '@/blocks-tiptap/save'
import { DragHandleWrapper } from '@/blocks-tiptap/dragHandle'
import { BlockFramesProvider } from '@/blocks-tiptap/blockFramesProvider'
import { getExperiment, ExperimentApiError, updateExperiment } from '@/api/experiments'
import { useExperimentLastFullWidth } from '@/hooks/useExperimentLastFullWidth'
import type { Experiment } from '@/types'

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; experiment: Experiment }
  | { kind: 'not-found' }
  | { kind: 'error'; message: string }

export default function ExperimentPage() {
  const { id } = useParams<{ id: string }>()
  const [loadState, setLoadState] = useState<LoadState>({ kind: 'loading' })
  const [isFullWidth, setIsFullWidth] = useState<boolean>(false)
  const { setLastFullWidth } = useExperimentLastFullWidth()

  useEffect(() => {
    if (!id) {
      setLoadState({ kind: 'not-found' })
      return
    }
    let cancelled = false
    getExperiment(id)
      .then((exp) => {
        if (cancelled) return
        setLoadState({ kind: 'ready', experiment: exp })
      })
      .catch((err) => {
        if (cancelled) return
        if (err instanceof ExperimentApiError && err.status === 404) {
          setLoadState({ kind: 'not-found' })
          return
        }
        const message = err instanceof Error ? err.message : String(err)
        setLoadState({ kind: 'error', message })
      })
    return () => { cancelled = true }
  }, [id])

  useEffect(() => {
    if (loadState.kind === 'ready') {
      setIsFullWidth(loadState.experiment.is_full_width)
    }
  }, [loadState])

  const initialEditorContent = useMemo(() => {
    if (loadState.kind !== 'ready') return null
    return rowsToTiptapDoc(loadState.experiment.blocks ?? [])
  }, [loadState])

  const editor = useEditor(
    {
      extensions: tiptapExtensions,
      content: initialEditorContent ?? { type: 'doc', content: [] },
      editorProps: {
        transformPasted: (slice) => stripRowIdsFromSlice(slice),
      },
    },
    [initialEditorContent]
  )

  const saveState = useSaveCoordinator({
    editor,
    experimentId: loadState.kind === 'ready' ? loadState.experiment.id : null,
    initialBlocks: loadState.kind === 'ready' ? loadState.experiment.blocks : undefined,
  })

  // Flush pending edits when SPA-navigating away or switching experiments.
  // beforeunload does not fire on React Router navigation; without this,
  // edits made within the debounce window are silently lost.
  useEffect(() => {
    return () => {
      void saveState.flushNow()
    }
  }, [id, saveState.flushNow])

  if (loadState.kind === 'loading') {
    return <div className="p-8 text-foreground-muted">Loading experiment...</div>
  }

  if (loadState.kind === 'not-found') {
    return <Navigate to="/experiments" replace />
  }

  if (loadState.kind === 'error') {
    return (
      <div className="p-8">
        <h1 className="text-xl font-semibold text-foreground">Failed to load experiment</h1>
        <p className="mt-2 text-sm text-foreground-muted">
          {loadState.message}
        </p>
      </div>
    )
  }

  const status = statusLabel(saveState.status)
  const experimentId = loadState.experiment.id

  const toggleFullWidth = () => {
    const next = !isFullWidth
    setIsFullWidth(next)
    updateExperiment(experimentId, { is_full_width: next }).catch(() => {
      setIsFullWidth(!next)
    })
    setLastFullWidth(next).catch(() => { /* sticky default — non-critical */ })
  }

  const containerClass = isFullWidth
    ? 'w-full px-[5vw] py-6 space-y-6'
    : 'mx-auto max-w-7xl px-4 py-6 space-y-6'

  return (
    <BlockFramesProvider>
    <div className={containerClass}>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">
          {loadState.experiment.name}
        </h1>
        <div className="flex items-center gap-3">
          <span
            data-testid="save-status"
            className={'px-2 py-0.5 rounded text-xs font-medium ' + status.cls}
            title={saveState.lastError ?? undefined}
          >
            {status.text}
          </span>
          {saveState.pendingCount > 0 && saveState.status !== 'saving' && (
            <span className="text-xs text-foreground-muted">
              {String(saveState.pendingCount)} pending
            </span>
          )}
          <button
            type="button"
            onClick={toggleFullWidth}
            title={isFullWidth ? 'Collapse to page width' : 'Expand to full width'}
            aria-label={isFullWidth ? 'Collapse to page width' : 'Expand to full width'}
            className="rounded p-1 text-foreground-muted hover:bg-hover hover:text-foreground"
          >
            {isFullWidth ? (
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 9V5H5m14 4V5h-4M5 15v4h4m6 0h4v-4"
                />
              </svg>
            ) : (
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 8V4h4M20 8V4h-4M4 16v4h4m12-4v4h-4"
                />
              </svg>
            )}
          </button>
        </div>
      </div>

      <div className="prose dark:prose-invert max-w-none border border-border rounded p-4">
        {editor && <DragHandleWrapper editor={editor} />}
        <EditorContent editor={editor} />
      </div>
    </div>
    </BlockFramesProvider>
  )
}
