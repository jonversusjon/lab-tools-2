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
import { createBlock, deleteBlock, updateBlock, reorderBlocks, snapshotPanel } from '@/api/experiments'
import { useQueryClient } from '@tanstack/react-query'
import type { ExperimentBlock, FlowPanelBlockContent, IFPanelBlockContent } from '@/types'
import TextBlockEditor from './TextBlockEditor'
import DividerBlock from './DividerBlock'
import CalloutBlock from './CalloutBlock'
import TableBlock from './TableBlock'
import ColumnLayout from './ColumnLayout'
import BlockCommandMenu from './BlockCommandMenu'
import BlockContextMenu from './BlockContextMenu'
import PanelTemplatePicker from './PanelTemplatePicker'
import FlowPanelBlock from './FlowPanelBlock'
import type { PanelLibraryData } from './FlowPanelBlock'
import IFPanelBlock from './IFPanelBlock'

interface BlockRendererProps {
  experimentId: string
  blocks: ExperimentBlock[]
  libraryData: PanelLibraryData | null
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

/** Compute 0-based index within a consecutive numbered list run */
function computeListIndex(blocks: ExperimentBlock[], blockId: string): number {
  const idx = blocks.findIndex((b) => b.id === blockId)
  if (idx === -1) return 0
  if (blocks[idx].block_type !== 'numbered_list_item') return 0
  let count = 0
  for (let i = idx - 1; i >= 0; i--) {
    if (blocks[i].block_type === 'numbered_list_item') {
      count++
    } else {
      break
    }
  }
  return count
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
  slashMenuNode: React.ReactNode | null
  isSelected: boolean
  onMouseEnter: () => void
}

function SortableBlockWrapper({
  block,
  children,
  onContextMenu,
  contextMenuBlockId,
  contextMenuNode,
  slashMenuNode,
  isSelected,
  onMouseEnter,
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
      onMouseEnter={onMouseEnter}
      className={
        'group/block relative flex items-start gap-1 rounded px-1 -mx-1 ' +
        (isSelected ? 'bg-blue-50 dark:bg-blue-900/20' : '')
      }
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
      <div className="flex-1 min-w-0 relative">
        {children}
        {slashMenuNode}
      </div>
    </div>
  )
}

export default function BlockRenderer({
  experimentId,
  blocks,
  libraryData,
}: BlockRendererProps) {
  const qc = useQueryClient()
  const pendingFocusRef = useRef<string | null>(null)
  const [commandMenuIndex, setCommandMenuIndex] = useState<number | null>(null)
  const [contextMenuBlockId, setContextMenuBlockId] = useState<string | null>(null)

  // Slash command state: which block triggered it and what filter text
  const [slashMenu, setSlashMenu] = useState<{
    blockId: string
    filter: string
  } | null>(null)

  // Template picker state
  type PickerState =
    | { mode: 'insert'; insertionIndex: number; panelType: 'flow' | 'if' }
    | { mode: 'slash'; slashBlockId: string; panelType: 'flow' | 'if' }
    | { mode: 'column'; columnId: string; panelType: 'flow' | 'if' }
  const [pickerState, setPickerState] = useState<PickerState | null>(null)

  // Multi-select state
  const [selectedBlockIds, setSelectedBlockIds] = useState<Set<string>>(new Set())
  const isDraggingSelect = useRef(false)
  const selectionAnchorIdx = useRef<number | null>(null)

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

  // Clear selection on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selectedBlockIds.size > 0 && !slashMenu) {
        setSelectedBlockIds(new Set())
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [selectedBlockIds.size, slashMenu])

  // Mouse-up anywhere stops drag-select
  useEffect(() => {
    const handleUp = () => {
      isDraggingSelect.current = false
    }
    document.addEventListener('mouseup', handleUp)
    return () => document.removeEventListener('mouseup', handleUp)
  }, [])

  const handleContainerMouseDown = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement
    if (target.closest('input, textarea')) {
      // Clicking into a text editor clears selection
      setSelectedBlockIds(new Set())
      isDraggingSelect.current = false
      return
    }
    if (target.closest('button, a, [role="button"]')) {
      isDraggingSelect.current = false
      return
    }
    isDraggingSelect.current = true
    setSelectedBlockIds(new Set())
    selectionAnchorIdx.current = null
  }

  const handleBlockMouseEnter = (idx: number) => {
    if (!isDraggingSelect.current) return
    if (selectionAnchorIdx.current === null) {
      selectionAnchorIdx.current = idx
    }
    const lo = Math.min(selectionAnchorIdx.current, idx)
    const hi = Math.max(selectionAnchorIdx.current, idx)
    const ids = new Set(topLevel.slice(lo, hi + 1).map((b) => b.id))
    setSelectedBlockIds(ids)
  }

  const invalidate = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['experiments', experimentId] })
  }, [qc, experimentId])

  const handleCreateBlockBelow = useCallback(
    async (afterBlockId: string) => {
      const block = blocks.find((b) => b.id === afterBlockId)
      if (!block) return

      const siblings = block.parent_id
        ? (childrenByParentId[block.parent_id] ?? [])
        : topLevel
      const idx = siblings.findIndex((b) => b.id === afterBlockId)
      if (idx === -1) return

      const current = siblings[idx]
      const next = siblings[idx + 1]
      const newSortOrder = next
        ? (current.sort_order + next.sort_order) / 2
        : current.sort_order + 1.0

      try {
        const created = await createBlock(experimentId, {
          block_type: 'paragraph',
          content: { text: '' },
          sort_order: newSortOrder,
          parent_id: block.parent_id,
        })
        pendingFocusRef.current = created.id
        invalidate()
      } catch {
        // Silently fail
      }
    },
    [experimentId, blocks, topLevel, childrenByParentId, invalidate]
  )

  const handleDeleteBlock = useCallback(
    async (blockId: string) => {
      const block = blocks.find((b) => b.id === blockId)
      if (!block) return

      const siblings = block.parent_id
        ? (childrenByParentId[block.parent_id] ?? [])
        : topLevel

      // Don't delete the last top-level block; column children can all be deleted
      if (siblings.length <= 1 && !block.parent_id) return

      const idx = siblings.findIndex((b) => b.id === blockId)
      const prevBlock =
        idx > 0 ? siblings[idx - 1] : !block.parent_id ? siblings[1] : null
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
    [experimentId, blocks, topLevel, childrenByParentId, invalidate]
  )

  /** Insert a new block (from the + button between blocks) */
  const handleInsertBlock = useCallback(
    async (
      insertionIndex: number,
      blockType: string,
      initialContent: Record<string, unknown>
    ) => {
      setCommandMenuIndex(null)

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

  /** Add a block inside a column */
  const handleAddBlockToColumn = useCallback(
    async (
      columnId: string,
      blockType: string,
      initialContent: Record<string, unknown>
    ) => {
      // Panel types open the template picker
      if (blockType === 'flow_panel' || blockType === 'if_panel') {
        setPickerState({
          mode: 'column',
          columnId,
          panelType: blockType === 'flow_panel' ? 'flow' : 'if',
        })
        return
      }

      const columnChildren = childrenByParentId[columnId] ?? []
      const sortOrder =
        columnChildren.length > 0
          ? columnChildren[columnChildren.length - 1].sort_order + 1.0
          : 1.0

      try {
        const created = await createBlock(experimentId, {
          block_type: blockType,
          content: TEXT_BLOCK_TYPES.has(blockType)
            ? { text: '' }
            : initialContent,
          sort_order: sortOrder,
          parent_id: columnId,
        })
        pendingFocusRef.current = created.id
        invalidate()
      } catch {
        // Silently fail
      }
    },
    [experimentId, childrenByParentId, invalidate]
  )

  /** Convert the block that triggered the slash command */
  const handleConvertFromSlash = useCallback(
    async (blockType: string, initialContent: Record<string, unknown>) => {
      if (!slashMenu) return
      const { blockId } = slashMenu
      setSlashMenu(null)

      // Panel types open the template picker instead of directly converting
      if (blockType === 'flow_panel' || blockType === 'if_panel') {
        setPickerState({
          mode: 'slash',
          slashBlockId: blockId,
          panelType: blockType === 'flow_panel' ? 'flow' : 'if',
        })
        return
      }

      const actualType = blockType === 'column_list_3' ? 'column_list' : blockType

      try {
        await updateBlock(experimentId, blockId, {
          block_type: actualType,
          content: TEXT_BLOCK_TYPES.has(actualType)
            ? { text: '' }
            : initialContent,
        })

        if (actualType === 'column_list') {
          const colCount = (initialContent as { column_count?: number }).column_count ?? 2
          for (let i = 0; i < colCount; i++) {
            await createBlock(experimentId, {
              block_type: 'column',
              content: { column_index: i },
              sort_order: i,
              parent_id: blockId,
            })
          }
        }

        pendingFocusRef.current = blockId
        invalidate()
      } catch {
        // Silently fail
      }
    },
    [experimentId, slashMenu, invalidate]
  )

  const handlePickerSelect = useCallback(
    async (panelId: string, panelType: 'flow' | 'if') => {
      if (!pickerState) return

      const blankFlowContent = {
        source_panel_id: null,
        name: 'Untitled Panel',
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
      const blankIFContent = {
        source_panel_id: null,
        name: 'Untitled Panel',
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
      const blockType = panelType === 'flow' ? 'flow_panel' : 'if_panel'
      const blankContent = panelType === 'flow' ? blankFlowContent : blankIFContent

      if (pickerState.mode === 'insert') {
        const { insertionIndex } = pickerState
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
          if (panelId === 'blank') {
            await createBlock(experimentId, {
              block_type: blockType,
              content: blankContent,
              sort_order: sortOrder,
              parent_id: null,
            })
          } else {
            const created = await snapshotPanel(experimentId, {
              source_panel_id: panelId,
              panel_type: panelType,
            })
            await updateBlock(experimentId, created.id, { sort_order: sortOrder })
          }
        } catch {
          // Silently fail
        }
      } else if (pickerState.mode === 'slash') {
        // slash mode
        const { slashBlockId } = pickerState
        const slashBlock = topLevel.find((b) => b.id === slashBlockId)
        try {
          if (panelId === 'blank') {
            await updateBlock(experimentId, slashBlockId, {
              block_type: blockType,
              content: blankContent,
            })
          } else {
            await snapshotPanel(experimentId, {
              source_panel_id: panelId,
              panel_type: panelType,
            })
            if (slashBlock) {
              await deleteBlock(experimentId, slashBlockId)
            }
          }
        } catch {
          // Silently fail
        }
      } else if (pickerState.mode === 'column') {
        // column mode — add panel block inside a column
        const { columnId } = pickerState
        const columnChildren = childrenByParentId[columnId] ?? []
        const sortOrder =
          columnChildren.length > 0
            ? columnChildren[columnChildren.length - 1].sort_order + 1.0
            : 1.0
        try {
          if (panelId === 'blank') {
            await createBlock(experimentId, {
              block_type: blockType,
              content: blankContent,
              sort_order: sortOrder,
              parent_id: columnId,
            })
          } else {
            const created = await snapshotPanel(experimentId, {
              source_panel_id: panelId,
              panel_type: panelType,
            })
            await updateBlock(experimentId, created.id, {
              sort_order: sortOrder,
              parent_id: columnId,
            })
          }
        } catch {
          // Silently fail
        }
      }

      invalidate()
    },
    [pickerState, topLevel, childrenByParentId, experimentId, invalidate]
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

  /** Convert all selected blocks to a new type (in order) */
  const handleConvertAll = useCallback(
    async (newType: string) => {
      const blocksToConvert = topLevel.filter((b) => selectedBlockIds.has(b.id))
      setSelectedBlockIds(new Set())
      setContextMenuBlockId(null)
      for (const block of blocksToConvert) {
        try {
          await updateBlock(experimentId, block.id, { block_type: newType })
        } catch {
          // Silently fail
        }
      }
      invalidate()
    },
    [experimentId, topLevel, selectedBlockIds, invalidate]
  )

  /** Delete all selected blocks */
  const handleDeleteAll = useCallback(async () => {
    const idsToDelete = Array.from(selectedBlockIds)
    setSelectedBlockIds(new Set())
    setContextMenuBlockId(null)
    for (const id of idsToDelete) {
      try {
        await deleteBlock(experimentId, id)
      } catch {
        // Silently fail
      }
    }
    invalidate()
  }, [experimentId, selectedBlockIds, invalidate])

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event
      if (!over || active.id === over.id) return

      const oldIndex = topLevel.findIndex((b) => b.id === active.id)
      const newIndex = topLevel.findIndex((b) => b.id === over.id)
      if (oldIndex === -1 || newIndex === -1) return

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

  const handleSlashFilter = useCallback(
    (blockId: string, filter: string | null) => {
      if (filter === null) {
        setSlashMenu(null)
      } else {
        setSlashMenu({ blockId, filter })
      }
    },
    []
  )

  const renderBlock = (block: ExperimentBlock): React.ReactNode => {
    const blockChildren = childrenByParentId[block.id]

    if (TEXT_BLOCK_TYPES.has(block.block_type)) {
      const listIdx = computeListIndex(topLevel, block.id)
      return (
        <TextBlockEditor
          experimentId={experimentId}
          block={block}
          onCreateBlockBelow={handleCreateBlockBelow}
          onDeleteBlock={handleDeleteBlock}
          onSlashFilter={handleSlashFilter}
          isSlashMenuOpen={slashMenu?.blockId === block.id}
          listIndex={listIdx}
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
          onAddBlockToColumn={handleAddBlockToColumn}
          onDeleteColumnBlock={handleDeleteBlock}
          onOpenTemplatePicker={(columnId, panelType) => {
            setPickerState({ mode: 'column', columnId, panelType })
          }}
        />
      )
    }

    if (block.block_type === 'flow_panel') {
      if (libraryData) {
        return (
          <FlowPanelBlock
            experimentId={experimentId}
            block={block}
            libraryData={libraryData}
          />
        )
      }
      // Fallback summary card while library data is loading
      const c = block.content as unknown as FlowPanelBlockContent
      return (
        <div
          data-block-id={block.id}
          className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden"
        >
          <div className="bg-gray-50 dark:bg-gray-800 px-4 py-3 flex items-center gap-2">
            <span className="font-semibold text-gray-900 dark:text-gray-100">
              {c.name || 'Untitled Panel'}
            </span>
            <span className="inline-flex items-center rounded-full bg-blue-100 dark:bg-blue-900/30 px-2 py-0.5 text-xs font-medium text-blue-700 dark:text-blue-300">
              Flow
            </span>
          </div>
          <div className="px-4 py-3 text-sm text-gray-400 dark:text-gray-500 italic">
            Loading panel designer...
          </div>
        </div>
      )
    }

    if (block.block_type === 'if_panel') {
      if (libraryData) {
        return (
          <IFPanelBlock
            experimentId={experimentId}
            block={block}
            libraryData={{
              antibodies: libraryData.antibodies,
              fluorophores: libraryData.allFluorophores,
              secondaries: libraryData.secondaries,
              conjugateChemistries: libraryData.conjugateChemistries,
            }}
          />
        )
      }
      // Fallback summary card while library data is loading
      const c = block.content as unknown as IFPanelBlockContent
      return (
        <div
          data-block-id={block.id}
          className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden"
        >
          <div className="bg-gray-50 dark:bg-gray-800 px-4 py-3 flex items-center gap-2">
            <span className="font-semibold text-gray-900 dark:text-gray-100">
              {c.name || 'Untitled Panel'}
            </span>
            <span className="inline-flex items-center rounded-full bg-blue-100 dark:bg-blue-900/30 px-2 py-0.5 text-xs font-medium text-blue-700 dark:text-blue-300">
              {c.panel_type}
            </span>
          </div>
          <div className="px-4 py-3 text-sm text-gray-400 dark:text-gray-500 italic">
            Loading panel designer...
          </div>
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
              onOpenTemplatePicker={(panelType) => {
                setCommandMenuIndex(null)
                setPickerState({ mode: 'insert', insertionIndex, panelType })
              }}
            />
          </div>
        )}
      </div>
    )
  }

  const blockIds = topLevel.map((b) => b.id)

  const selectedBlocksArray = topLevel.filter((b) => selectedBlockIds.has(b.id))

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
        <div
          className="space-y-0"
          onMouseDown={handleContainerMouseDown}
        >
          {renderAddBlockZone(0)}
          {topLevel.map((block, idx) => (
            <div key={block.id}>
              <SortableBlockWrapper
                block={block}
                isSelected={selectedBlockIds.has(block.id)}
                onMouseEnter={() => handleBlockMouseEnter(idx)}
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
                        selectedBlocks={
                          selectedBlockIds.has(block.id)
                            ? selectedBlocksArray
                            : undefined
                        }
                        onConvertAll={handleConvertAll}
                        onDeleteAll={handleDeleteAll}
                      />
                    </div>
                  ) : null
                }
                slashMenuNode={
                  slashMenu?.blockId === block.id ? (
                    <div className="absolute left-0 top-full mt-1 z-50">
                      <BlockCommandMenu
                        filterText={slashMenu.filter}
                        onSelect={handleConvertFromSlash}
                        onClose={() => setSlashMenu(null)}
                        onOpenTemplatePicker={(panelType) => {
                          setSlashMenu(null)
                          setPickerState({
                            mode: 'slash',
                            slashBlockId: block.id,
                            panelType,
                          })
                        }}
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

      <PanelTemplatePicker
        isOpen={pickerState !== null}
        onClose={() => setPickerState(null)}
        onSelect={handlePickerSelect}
        filterType={pickerState?.panelType}
      />
    </DndContext>
  )
}
