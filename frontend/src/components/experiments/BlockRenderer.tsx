import { useCallback, useEffect, useMemo, useRef } from 'react'
import { createBlock, deleteBlock } from '@/api/experiments'
import { useQueryClient } from '@tanstack/react-query'
import type { ExperimentBlock } from '@/types'
import TextBlockEditor from './TextBlockEditor'
import DividerBlock from './DividerBlock'
import CalloutBlock from './CalloutBlock'
import TableBlock from './TableBlock'
import ColumnLayout from './ColumnLayout'

interface BlockRendererProps {
  experimentId: string
  blocks: ExperimentBlock[]
}

/** Build a map of parent_id → sorted children */
function buildChildrenMap(
  blocks: ExperimentBlock[]
): Record<string, ExperimentBlock[]> {
  const map: Record<string, ExperimentBlock[]> = {}
  for (const b of blocks) {
    if (b.parent_id) {
      if (!map[b.parent_id]) map[b.parent_id] = []
      map[b.parent_id].push(b)
    }
  }
  // Sort children by sort_order
  for (const key of Object.keys(map)) {
    map[key].sort((a, b) => a.sort_order - b.sort_order)
  }
  return map
}

const TEXT_BLOCK_TYPES = new Set([
  'paragraph',
  'heading_1',
  'heading_2',
  'heading_3',
  'heading_4',
  'bulleted_list_item',
  'numbered_list_item',
])

export default function BlockRenderer({
  experimentId,
  blocks,
}: BlockRendererProps) {
  const qc = useQueryClient()
  const pendingFocusRef = useRef<string | null>(null)

  const topLevel = useMemo(
    () =>
      blocks
        .filter((b) => b.parent_id === null)
        .sort((a, b) => a.sort_order - b.sort_order),
    [blocks]
  )

  const childrenByParentId = useMemo(() => buildChildrenMap(blocks), [blocks])

  // Focus management: after render, focus the pending block
  useEffect(() => {
    if (pendingFocusRef.current) {
      const id = pendingFocusRef.current
      pendingFocusRef.current = null
      requestAnimationFrame(() => {
        const el = document.querySelector(
          '[data-block-id="' + id + '"] [data-block-input]'
        ) as HTMLElement | null
        if (el) el.focus()
      })
    }
  })

  const handleCreateBlockBelow = useCallback(
    async (afterBlockId: string) => {
      const idx = topLevel.findIndex((b) => b.id === afterBlockId)
      if (idx === -1) return

      const current = topLevel[idx]
      const next = topLevel[idx + 1]
      const newSortOrder = next
        ? (current.sort_order + next.sort_order) / 2
        : current.sort_order + 1.0

      try {
        const created = await createBlock(experimentId, {
          block_type: 'paragraph',
          content: { text: '' },
          sort_order: newSortOrder,
          parent_id: null,
        })
        pendingFocusRef.current = created.id
        qc.invalidateQueries({ queryKey: ['experiments', experimentId] })
      } catch {
        // Silently fail — user can retry
      }
    },
    [experimentId, topLevel, qc]
  )

  const handleDeleteBlock = useCallback(
    async (blockId: string) => {
      const idx = topLevel.findIndex((b) => b.id === blockId)
      // Don't delete the last block
      if (topLevel.length <= 1) return

      // Find previous block to focus
      const prevBlock = idx > 0 ? topLevel[idx - 1] : topLevel[1]
      if (prevBlock) {
        pendingFocusRef.current = prevBlock.id
      }

      try {
        await deleteBlock(experimentId, blockId)
        qc.invalidateQueries({ queryKey: ['experiments', experimentId] })
      } catch {
        // Silently fail
      }
    },
    [experimentId, topLevel, qc]
  )

  const renderBlock = (block: ExperimentBlock) => {
    const blockChildren = childrenByParentId[block.id]

    if (TEXT_BLOCK_TYPES.has(block.block_type)) {
      return (
        <TextBlockEditor
          key={block.id}
          experimentId={experimentId}
          block={block}
          onCreateBlockBelow={handleCreateBlockBelow}
          onDeleteBlock={handleDeleteBlock}
        >
          {blockChildren?.map((child) => (
            <div key={child.id}>{renderBlock(child)}</div>
          ))}
        </TextBlockEditor>
      )
    }

    if (block.block_type === 'divider') {
      return <DividerBlock key={block.id} block={block} />
    }

    if (block.block_type === 'callout') {
      return (
        <CalloutBlock
          key={block.id}
          experimentId={experimentId}
          block={block}
        />
      )
    }

    if (block.block_type === 'table') {
      return (
        <TableBlock
          key={block.id}
          experimentId={experimentId}
          block={block}
        />
      )
    }

    if (block.block_type === 'column_list') {
      return (
        <ColumnLayout
          key={block.id}
          experimentId={experimentId}
          block={block}
          childrenByParentId={childrenByParentId}
          renderBlock={renderBlock}
        />
      )
    }

    if (block.block_type === 'flow_panel' || block.block_type === 'if_panel') {
      return (
        <div
          key={block.id}
          data-block-id={block.id}
          className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-4 py-3 text-sm text-gray-500 dark:text-gray-400"
        >
          {block.block_type === 'flow_panel'
            ? 'Flow panel block (Phase 4)'
            : 'IF panel block (Phase 4)'}
        </div>
      )
    }

    // Fallback for unknown types
    return (
      <div
        key={block.id}
        data-block-id={block.id}
        className="rounded bg-gray-100 dark:bg-gray-800 px-3 py-2 text-xs text-gray-400 dark:text-gray-500"
      >
        Unknown block type: {block.block_type}
      </div>
    )
  }

  return (
    <div className="space-y-1">
      {topLevel.map((block) => (
        <div
          key={block.id}
          className="group/block rounded px-1 -mx-1 transition-colors hover:border-l-2 hover:border-blue-300 dark:hover:border-blue-600"
        >
          {renderBlock(block)}
        </div>
      ))}
    </div>
  )
}
