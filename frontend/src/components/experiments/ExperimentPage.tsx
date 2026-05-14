import { useParams, Navigate } from 'react-router-dom'
import { EditorContent, useEditor } from '@tiptap/react'
import { useEffect, useMemo, useState } from 'react'
import { tiptapExtensions } from '@/blocks-tiptap/extensions'
import { stripRowIdsFromSlice } from '@/blocks-tiptap/paste'
import { rowsToTiptapDoc } from '@/blocks-tiptap/adapter/dbToTiptap'
import { useSaveCoordinator, statusLabel } from '@/blocks-tiptap/save'
import { DragHandleWrapper } from '@/blocks-tiptap/dragHandle'
import { getExperiment } from '@/api/experiments'
import type { Experiment } from '@/types'

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; experiment: Experiment }
  | { kind: 'not-found' }
  | { kind: 'error'; message: string }

export default function ExperimentPage() {
  const { id } = useParams<{ id: string }>()
  const [loadState, setLoadState] = useState<LoadState>({ kind: 'loading' })

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
        const message = err instanceof Error ? err.message : String(err)
        if (message.includes('404') || message.toLowerCase().includes('not found')) {
          setLoadState({ kind: 'not-found' })
        } else {
          setLoadState({ kind: 'error', message })
        }
      })
    return () => { cancelled = true }
  }, [id])

  const initialEditorContent = useMemo(() => {
    if (loadState.kind !== 'ready') return null
    const blocks = loadState.experiment.blocks
    if (!blocks || blocks.length === 0) {
      return { type: 'doc', content: [{ type: 'paragraph' }] }
    }
    return rowsToTiptapDoc(blocks)
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

  return (
    <div className="w-full px-[5vw] py-6 space-y-6">
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
        </div>
      </div>

      <div className="prose dark:prose-invert max-w-none border border-border rounded p-4">
        {editor && <DragHandleWrapper editor={editor} />}
        <EditorContent editor={editor} />
      </div>
    </div>
  )
}
