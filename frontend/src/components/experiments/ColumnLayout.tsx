import type { ExperimentBlock, ColumnListBlockContent } from '@/types'

interface ColumnLayoutProps {
  experimentId: string
  block: ExperimentBlock
  childrenByParentId: Record<string, ExperimentBlock[]>
  renderBlock: (block: ExperimentBlock) => React.ReactNode
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
}: ColumnLayoutProps) {
  const { column_count } = parseContent(block)
  const columnBlocks = (childrenByParentId[block.id] ?? [])
    .filter((b) => b.block_type === 'column')
    .sort((a, b) => a.sort_order - b.sort_order)

  const gridClass =
    column_count === 3 ? 'grid grid-cols-3 gap-4' : 'grid grid-cols-2 gap-4'

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
              <p className="text-xs text-gray-400 dark:text-gray-600">
                Click + to add a block
              </p>
            ) : (
              <div className="space-y-1">
                {columnChildren.map((child) => (
                  <div key={child.id}>{renderBlock(child)}</div>
                ))}
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
              Click + to add a block
            </p>
          </div>
        )
      )}
    </div>
  )
}
