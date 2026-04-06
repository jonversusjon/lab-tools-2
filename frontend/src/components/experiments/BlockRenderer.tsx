import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { restrictToVerticalAxis } from '@dnd-kit/modifiers'
import { CSS } from '@dnd-kit/utilities'
import { createBlock, deleteBlock, updateBlock, reorderBlocks } from '@/api/experiments'
import { useQueryClient } from '@tanstack/react-query'
import type { ExperimentBlock } from '@/types'
import TextBlockEditor from './TextBlockEditor'
import DividerBlock from './DividerBlock'
import CalloutBlock from './CalloutBlock'
import TableBlock from './TableBlock'
import ColumnLayout from './ColumnLayout'
import BlockCommandMenu from './BlockCommandMenu'
import BlockContextMenu from './BlockContextMenu'

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

interface SortableBlockWrapperProps {
  block: ExperimentBlock
  children: React.ReactNode
  onContextMenu: (blockId: string) => void
  contextMenuBlockId: string | null
  contextMenuNode: React.ReactNode | null
}

function SortableBlockWrapper({
  block,
  children,
  onContextMenu,
  contextMenuBlockId,
  contextMenuNode,
}: SortableBlockWrapperProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: block.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      className="group/block relative flex items-start gap-1 rounded px-1 -mx-1"
    >
      <div className="flex flex-col items-center gap-0.5 pt-1 opacity-0 group-hover/block:opacity-100 transition-opacity shrink-0 w-6">
        <button
          {...listeners}
          className="cursor-grab text-gray-300 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-400 text-xs select-none"
          title="Drag to reorder"
        >
          ⋮⋮
        </button>
        <div className="relative">
          <button
            onClick={() => onContextMenu(block.id)}
            className="text-gray-300 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-400 text-xs select-none"
            title="More options"
          >
            ⋯
          </button>
          {contextMenuBlockId === block.id && contextMenuNode}
        </div>
      </div>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  )
}

export default function BlockRenderer({
  experimentId,
  blocks,
}: BlockRendererProps) {
  const qc = useQueryClient()
  const pendingFocusRef = useRef<string | null>(null)
  const [commandMenuIndex, setCommandMenuIndex] = useState<number | null>(null)
  const [contextMenuBlockId, setContextMenuBlockId] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const topLevel = useMemo(
    () =>
      blocks
        .filter((b) => b.parent_id === null)
        .sort((a, b) => a.sort_order - b.sort_order),
    [blocks]
  )

  const childrenByParentId = useMemo(() => buildChildrenMap(blocks), [blocks])

  // Focus management
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

  const invalidate = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['experiments', experimentId] })
  }, [qc, experimentId])

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
        invalidate()
      } catch {
        // Silently fail
      }
    },
    [experimentId, topLevel, invalidate]
  )

  const handleDeleteBlock = useCallback(
    async (blockId: string) => {
      const idx = topLevel.findIndex((b) => b.id === blockId)
      if (topLevel.length <= 1) return

      const prevBlock = idx > 0 ? topLevel[idx - 1] : topLevel[1]
      if (prevBlock) {
        pendingFocusRef.current = prevBlock.id
      }

      try {
        await deleteBlock(experimentId, blockId)
        invalidate()
      } catch {
        // Silently fail
      }
    },
    [experimentId, topLevel, invalidate]
  )

  const handleInsertBlock = useCallback(
    async (
      insertionIndex: number,
      blockType: string,
      initialContent: Record<string, unknown>
    ) => {
      setCommandMenuIndex(null)

      // Handle column_list_3 special case (3-column variant)
      const actualType = blockType === 'column_list_3' ? 'column_list' : blockType

      const prev = topLevel[insertionIndex - 1]
      const next = topLevel[insertionIndex]
      let sortOrder: number
      if (!prev && !next) {
        sortOrder = 1.0
      } else if (!prev) {
        sortOrder = next.sort_order - 1.0
      } else if (!next) {
        sortOrder = prev.sort_order + 1.0
      } else {
        sortOrder = (prev.sort_order + next.sort_order) / 2
      }

      try {
        const created = await createBlock(experimentId, {
          block_type: actualType,
          content: initialContent,
          sort_order: sortOrder,
          parent_id: null,
        })

        // For column_list, also create the column children
        if (actualType === 'column_list') {
          const colCount = (initialContent as { column_count?: number }).column_count ?? 2
          for (let i = 0; i < colCount; i++) {
            await createBlock(experimentId, {
              block_type: 'column',
              content: { column_index: i },
              sort_order: i,
              parent_id: created.id,
            })
          }
        }

        pendingFocusRef.current = created.id
        invalidate()
      } catch {
        // Silently fail
      }
    },
    [experimentId, topLevel, invalidate]
  )

  const handleDuplicateBlock = useCallback(
    async (blockId: string) => {
      const block = topLevel.find((b) => b.id === blockId)
      if (!block) return

      const idx = topLevel.indexOf(block)
      const next = topLevel[idx + 1]
      const sortOrder = next
        ? (block.sort_order + next.sort_order) / 2
        : block.sort_order + 1.0

      try {
        await createBlock(experimentId, {
          block_type: block.block_type,
          content: block.content,
          sort_order: sortOrder,
          parent_id: null,
        })
        invalidate()
      } catch {
        // Silently fail
      }
    },
    [experimentId, topLevel, invalidate]
  )

  const handleConvertType = useCallback(
    async (blockId: string, newType: string) => {
      try {
        await updateBlock(experimentId, blockId, { block_type: newType })
        invalidate()
      } catch {
        // Silently fail
      }
    },
    [experimentId, invalidate]
  )

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event
      if (!over || active.id === over.id) return

      const oldIndex = topLevel.findIndex((b) => b.id === active.id)
      const newIndex = topLevel.findIndex((b) => b.id === over.id)
      if (oldIndex === -1 || newIndex === -1) return

      // Compute new sort orders
      const reordered = [...topLevel]
      const [moved] = reordered.splice(oldIndex, 1)
      reordered.splice(newIndex, 0, moved)

      const updates = reordered.map((b, i) => ({
        id: b.id,
        sort_order: i,
        parent_id: b.parent_id,
      }))

      try {
        await reorderBlocks(experimentId, updates)
        invalidate()
      } catch {
        // Silently fail
      }
    },
    [experimentId, topLevel, invalidate]
  )

  const renderBlock = (block: ExperimentBlock): React.ReactNode => {
    const blockChildren = childrenByParentId[block.id]

    if (TEXT_BLOCK_TYPES.has(block.block_type)) {
      return (
        <TextBlockEditor
          experimentId={experimentId}
          block={block}
          onCreateBlockBelow={handleCreateBlockBelow}
          onDeleteBlock={handleDeleteBlock}
          onSlashCommand={(insertionBlockId) => {
            const idx = topLevel.findIndex((b) => b.id === insertionBlockId)
            if (idx !== -1) setCommandMenuIndex(idx)
          }}
        >
          {blockChildren?.map((child) => (
            <div key={child.id}>{renderBlock(child)}</div>
          ))}
        </TextBlockEditor>
      )
    }

    if (block.block_type === 'divider') {
      return <DividerBlock block={block} />
    }

    if (block.block_type === 'callout') {
      return (
        <CalloutBlock experimentId={experimentId} block={block} />
      )
    }

    if (block.block_type === 'table') {
      return (
        <TableBlock experimentId={experimentId} block={block} />
      )
    }

    if (block.block_type === 'column_list') {
      return (
        <ColumnLayout
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
          data-block-id={block.id}
          className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-4 py-3 text-sm text-gray-500 dark:text-gray-400"
        >
          {block.block_type === 'flow_panel'
            ? 'Flow panel block (Phase 4)'
            : 'IF panel block (Phase 4)'}
        </div>
      )
    }

    return (
      <div
        data-block-id={block.id}
        className="rounded bg-gray-100 dark:bg-gray-800 px-3 py-2 text-xs text-gray-400 dark:text-gray-500"
      >
        Unknown block type: {block.block_type}
      </div>
    )
  }

  const renderAddBlockZone = (insertionIndex: number) => {
    const isOpen = commandMenuIndex === insertionIndex
    return (
      <div className="group relative py-0.5">
        <div className="flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() =>
              setCommandMenuIndex(isOpen ? null : insertionIndex)
            }
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 dark:text-gray-600 dark:hover:text-gray-400"
          >
            <span className="text-lg leading-none">+</span>
          </button>
          <div className="flex-1 border-t border-gray-200 dark:border-gray-700 ml-2" />
        </div>
        {isOpen && (
          <div className="absolute left-8 top-full mt-1 z-50">
            <BlockCommandMenu
              onSelect={(blockType, initialContent) =>
                handleInsertBlock(insertionIndex, blockType, initialContent)
              }
              onClose={() => setCommandMenuIndex(null)}
            />
          </div>
        )}
      </div>
    )
  }

  const blockIds = topLevel.map((b) => b.id)

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalAxis]}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={blockIds}
        strategy={verticalListSortingStrategy}
      >
        <div className="space-y-0">
          {renderAddBlockZone(0)}
          {topLevel.map((block, idx) => (
            <div key={block.id}>
              <SortableBlockWrapper
                block={block}
                onContextMenu={(id) =>
                  setContextMenuBlockId(
                    contextMenuBlockId === id ? null : id
                  )
                }
                contextMenuBlockId={contextMenuBlockId}
                contextMenuNode={
                  contextMenuBlockId === block.id ? (
                    <div className="absolute left-0 top-full mt-1 z-50">
                      <BlockContextMenu
                        block={block}
                        onDelete={() => handleDeleteBlock(block.id)}
                        onDuplicate={() => handleDuplicateBlock(block.id)}
                        onConvertType={(newType) =>
                          handleConvertType(block.id, newType)
                        }
                        onClose={() => setContextMenuBlockId(null)}
                      />
                    </div>
                  ) : null
                }
              >
                {renderBlock(block)}
              </SortableBlockWrapper>
              {renderAddBlockZone(idx + 1)}
            </div>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  )
}
