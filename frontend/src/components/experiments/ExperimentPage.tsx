import { useParams, Navigate } from 'react-router-dom'
import { EditorContent, useEditor } from '@tiptap/react'
import { useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { tiptapExtensions } from '@/blocks-tiptap/extensions'
import { SlashMenu } from '@/blocks-tiptap/slashMenu'
import { stripRowIdsFromSlice } from '@/blocks-tiptap/paste'
import { rowsToTiptapDoc } from '@/blocks-tiptap/adapter/dbToTiptap'
import { useSaveCoordinator, statusLabel } from '@/blocks-tiptap/save'
import { DragHandleWrapper } from '@/blocks-tiptap/dragHandle'
import { BlockFramesProvider } from '@/blocks-tiptap/blockFramesProvider'
import { EditorProvider } from '@/blocks-tiptap/EditorContext'
import { getExperiment, ExperimentApiError, updateExperiment } from '@/api/experiments'
import { useExperimentLastFullWidth } from '@/hooks/useExperimentLastFullWidth'
import { PageWidthToggle } from './PageWidthToggle'
import ExperimentRail from './ExperimentRail'
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
  const queryClient = useQueryClient()

  // Inject the QueryClient into the slash menu so its dot-trigger template
  // omnibox can prefetch template lists and build panel node JSON.
  const extensions = useMemo(
    () =>
      tiptapExtensions.map((ext) =>
        ext === SlashMenu ? SlashMenu.configure({ queryClient }) : ext,
      ),
    [queryClient],
  )

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
      extensions,
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
    ? 'w-full px-4 py-6 space-y-6'
    : 'mx-auto max-w-7xl px-4 py-6 space-y-6'

  return (
    <BlockFramesProvider>
    <EditorProvider editor={editor}>
    <div className="flex items-stretch">
      <div className={containerClass + ' min-w-0 flex-1'}>
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
            <PageWidthToggle isFullWidth={isFullWidth} onToggle={toggleFullWidth} />
          </div>
        </div>

        <div className="prose dark:prose-invert max-w-none border border-border rounded p-4">
          {editor && <DragHandleWrapper editor={editor} />}
          <EditorContent editor={editor} />
        </div>
      </div>

      <ExperimentRail />
    </div>
    </EditorProvider>
    </BlockFramesProvider>
  )
}
