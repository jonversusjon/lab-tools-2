import { useState } from 'react'
import type { ExperimentBlock, ColumnListBlockContent } from '@/types'
import BlockCommandMenu from './BlockCommandMenu'

interface ColumnLayoutProps {
  experimentId: string
  block: ExperimentBlock
  childrenByParentId: Record<string, ExperimentBlock[]>
  renderBlock: (block: ExperimentBlock) => React.ReactNode
  onAddBlockToColumn: (
    columnId: string,
    blockType: string,
    initialContent: Record<string, unknown>
  ) => void
  onOpenTemplatePicker?: (columnId: string, panelType: 'flow' | 'if') => void
}

function parseContent(block: ExperimentBlock): ColumnListBlockContent {
  const c = block.content as Record<string, unknown>
  return {
    column_count: typeof c.column_count === 'number' ? c.column_count : 2,
  }
}

export default function ColumnLayout({
  block,
  childrenByParentId,
  renderBlock,
  onAddBlockToColumn,
  onOpenTemplatePicker,
}: ColumnLayoutProps) {
  const [menuColumnId, setMenuColumnId] = useState<string | null>(null)
  const { column_count } = parseContent(block)
  const columnBlocks = (childrenByParentId[block.id] ?? [])
    .filter((b) => b.block_type === 'column')
    .sort((a, b) => a.sort_order - b.sort_order)

  const gridClass =
    column_count === 3 ? 'grid grid-cols-3 gap-4' : 'grid grid-cols-2 gap-4'

  const handleSelect = (
    columnId: string,
    blockType: string,
    initialContent: Record<string, unknown>
  ) => {
    setMenuColumnId(null)
    onAddBlockToColumn(columnId, blockType, initialContent)
  }

  const renderColumnMenu = (colId: string) => {
    const isOpen = menuColumnId === colId
    if (!isOpen) return null
    return (
      <div className="absolute left-0 top-full mt-1 z-50">
        <BlockCommandMenu
          excludeLayout
          onSelect={(blockType, initialContent) =>
            handleSelect(colId, blockType, initialContent)
          }
          onClose={() => setMenuColumnId(null)}
          onOpenTemplatePicker={
            onOpenTemplatePicker
              ? (panelType) => {
                  setMenuColumnId(null)
                  onOpenTemplatePicker(colId, panelType)
                }
              : undefined
          }
        />
      </div>
    )
  }

  const renderAddButton = (colId: string, isEmpty: boolean) => {
    const isOpen = menuColumnId === colId
    if (isEmpty) {
      return (
        <div className="relative">
          <button
            onClick={() => setMenuColumnId(isOpen ? null : colId)}
            className="w-full flex items-center justify-center gap-1 text-xs text-gray-400 hover:text-gray-600 dark:text-gray-600 dark:hover:text-gray-400 py-2 rounded hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            <span className="text-lg leading-none">+</span>
            <span>Add a block</span>
          </button>
          {renderColumnMenu(colId)}
        </div>
      )
    }
    return (
      <div className="relative">
        <div className="flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity pt-1">
          <button
            onClick={() => setMenuColumnId(isOpen ? null : colId)}
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 dark:text-gray-600 dark:hover:text-gray-400"
          >
            <span className="text-lg leading-none">+</span>
          </button>
          <div className="flex-1 border-t border-gray-200 dark:border-gray-700 ml-2" />
        </div>
        {renderColumnMenu(colId)}
      </div>
    )
  }

  return (
    <div data-block-id={block.id} className={gridClass}>
      {columnBlocks.map((col) => {
        const columnChildren = childrenByParentId[col.id] ?? []
        return (
          <div
            key={col.id}
            data-block-id={col.id}
            className="border border-dashed border-gray-200 dark:border-gray-700 rounded-lg p-3 min-h-[80px]"
          >
            {columnChildren.length === 0 ? (
              renderAddButton(col.id, true)
            ) : (
              <div className="space-y-1">
                {columnChildren.map((child) => (
                  <div key={child.id}>{renderBlock(child)}</div>
                ))}
                {renderAddButton(col.id, false)}
              </div>
            )}
          </div>
        )
      })}
      {/* If fewer columns than expected, render empty placeholders */}
      {Array.from(
        { length: Math.max(0, column_count - columnBlocks.length) },
        (_, i) => (
          <div
            key={'empty-' + String(i)}
            className="border border-dashed border-gray-200 dark:border-gray-700 rounded-lg p-3 min-h-[80px]"
          >
            <p className="text-xs text-gray-400 dark:text-gray-600">
              Empty column
            </p>
          </div>
        )
      )}
    </div>
  )
}
