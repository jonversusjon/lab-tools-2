import { useCallback, useEffect, useRef, useState } from 'react'
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
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { ExperimentBlock, TableBlockContent } from '@/types'

const DEBOUNCE_MS = 1500

interface TableBlockProps {
  experimentId: string
  block: ExperimentBlock
}

function parseContent(block: ExperimentBlock): TableBlockContent {
  const c = block.content as Record<string, unknown>
  return {
    table_width: typeof c.table_width === 'number' ? c.table_width : 3,
    has_column_header: typeof c.has_column_header === 'boolean' ? c.has_column_header : true,
    has_row_header: typeof c.has_row_header === 'boolean' ? c.has_row_header : false,
    rows: Array.isArray(c.rows) ? (c.rows as string[][]) : [['', '', ''], ['', '', '']],
  }
}

function flushTableSave(
  experimentId: string,
  blockId: string,
  content: TableBlockContent
) {
  fetch('/api/v1/experiments/' + experimentId + '/blocks/' + blockId, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
    keepalive: true,
  })
}

interface SortableRowProps {
  id: string
  rowIndex: number
  row: string[]
  tableWidth: number
  isColumnHeader: boolean
  isRowHeader: boolean
  canRemove: boolean
  onCellChange: (rowIdx: number, colIdx: number, value: string) => void
  onRemoveRow: (rowIdx: number) => void
}

function SortableRow({
  id,
  rowIndex,
  row,
  tableWidth: _tableWidth,
  isColumnHeader,
  isRowHeader,
  canRemove,
  onCellChange,
  onRemoveRow,
}: SortableRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <tr ref={setNodeRef} style={style} {...attributes} className="group/row">
      <td
        {...listeners}
        className="w-8 text-center cursor-grab text-gray-300 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-400 select-none border-r border-gray-200 dark:border-gray-700"
      >
        ⋮⋮
      </td>
      {row.map((cell, colIdx) => {
        const isHeader =
          (isColumnHeader && rowIndex === 0) ||
          (isRowHeader && colIdx === 0)
        return (
          <td
            key={colIdx}
            className={
              'border border-gray-200 dark:border-gray-700 px-2 py-1 ' +
              (isHeader ? 'font-semibold bg-gray-50 dark:bg-gray-800' : '')
            }
          >
            <input
              type="text"
              value={cell}
              onChange={(e) => onCellChange(rowIndex, colIdx, e.target.value)}
              className="w-full border-none outline-none focus:ring-0 bg-transparent text-sm text-gray-900 dark:text-gray-100"
            />
          </td>
        )
      })}
      <td className="w-8 text-center">
        {canRemove && (
          <button
            onClick={() => onRemoveRow(rowIndex)}
            className="opacity-0 group-hover/row:opacity-100 text-gray-400 hover:text-red-500 dark:text-gray-600 dark:hover:text-red-400 text-xs transition-opacity"
          >
            ×
          </button>
        )}
      </td>
    </tr>
  )
}

export default function TableBlock({
  experimentId,
  block,
}: TableBlockProps) {
  const parsed = parseContent(block)
  const [rows, setRows] = useState(parsed.rows)
  const [tableWidth, setTableWidth] = useState(parsed.table_width)
  const [hasColumnHeader, setHasColumnHeader] = useState(parsed.has_column_header)
  const [hasRowHeader, setHasRowHeader] = useState(parsed.has_row_header)

  const userEdited = useRef(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dirtyRef = useRef(false)
  const contentRef = useRef<TableBlockContent>({
    table_width: tableWidth,
    has_column_header: hasColumnHeader,
    has_row_header: hasRowHeader,
    rows,
  })

  // Keep contentRef in sync
  useEffect(() => {
    contentRef.current = {
      table_width: tableWidth,
      has_column_header: hasColumnHeader,
      has_row_header: hasRowHeader,
      rows,
    }
  }, [tableWidth, hasColumnHeader, hasRowHeader, rows])

  // Sync from props when not editing
  useEffect(() => {
    if (!userEdited.current) {
      const p = parseContent(block)
      setRows(p.rows)
      setTableWidth(p.table_width)
      setHasColumnHeader(p.has_column_header)
      setHasRowHeader(p.has_row_header)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [block.content, block.updated_at])

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const saveContent = useCallback(
    (content: TableBlockContent) => {
      fetch(
        '/api/v1/experiments/' + experimentId + '/blocks/' + block.id,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content }),
        }
      )
      dirtyRef.current = false
    },
    [experimentId, block.id]
  )

  const triggerSave = useCallback(() => {
    userEdited.current = true
    dirtyRef.current = true
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      saveContent(contentRef.current)
    }, DEBOUNCE_MS)
  }, [saveContent])

  // Flush on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      if (dirtyRef.current) {
        flushTableSave(experimentId, block.id, contentRef.current)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleCellChange = (rowIdx: number, colIdx: number, value: string) => {
    setRows((prev) => {
      const updated = prev.map((r) => [...r])
      updated[rowIdx][colIdx] = value
      return updated
    })
    triggerSave()
  }

  const handleAddRow = () => {
    setRows((prev) => [...prev, Array(tableWidth).fill('')])
    triggerSave()
  }

  const handleRemoveRow = (rowIdx: number) => {
    setRows((prev) => prev.filter((_, i) => i !== rowIdx))
    triggerSave()
  }

  const handleAddColumn = () => {
    setRows((prev) => prev.map((r) => [...r, '']))
    setTableWidth((w) => w + 1)
    triggerSave()
  }

  const handleRemoveColumn = (colIdx: number) => {
    setRows((prev) => prev.map((r) => r.filter((_, i) => i !== colIdx)))
    setTableWidth((w) => w - 1)
    triggerSave()
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = Number(active.id)
    const newIndex = Number(over.id)

    setRows((prev) => arrayMove(prev, oldIndex, newIndex))
    triggerSave()
  }

  const toggleColumnHeader = () => {
    setHasColumnHeader((v) => !v)
    triggerSave()
  }

  const toggleRowHeader = () => {
    setHasRowHeader((v) => !v)
    triggerSave()
  }

  const rowIds = rows.map((_, i) => String(i))

  return (
    <div data-block-id={block.id}>
      <div className="flex items-center gap-2 mb-2">
        <label className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 cursor-pointer">
          <input
            type="checkbox"
            checked={hasColumnHeader}
            onChange={toggleColumnHeader}
            className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500 w-3 h-3"
          />
          Column header
        </label>
        <label className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 cursor-pointer">
          <input
            type="checkbox"
            checked={hasRowHeader}
            onChange={toggleRowHeader}
            className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500 w-3 h-3"
          />
          Row header
        </label>
      </div>
      <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <table className="w-full">
            <thead>
              <tr>
                <th className="w-8" />
                {Array.from({ length: tableWidth }, (_, i) => (
                  <th
                    key={i}
                    className="relative px-2 py-0.5 text-xs text-gray-400 dark:text-gray-500 font-normal"
                  >
                    {tableWidth > 1 && (
                      <button
                        onClick={() => handleRemoveColumn(i)}
                        className="opacity-0 hover:opacity-100 text-gray-400 hover:text-red-500 dark:text-gray-600 dark:hover:text-red-400 absolute -top-0.5 right-0 text-xs"
                        title="Remove column"
                      >
                        ×
                      </button>
                    )}
                  </th>
                ))}
                <th className="w-8" />
              </tr>
            </thead>
            <SortableContext
              items={rowIds}
              strategy={verticalListSortingStrategy}
            >
              <tbody>
                {rows.map((row, i) => (
                  <SortableRow
                    key={i}
                    id={String(i)}
                    rowIndex={i}
                    row={row}
                    tableWidth={tableWidth}
                    isColumnHeader={hasColumnHeader}
                    isRowHeader={hasRowHeader}
                    canRemove={rows.length > 1}
                    onCellChange={handleCellChange}
                    onRemoveRow={handleRemoveRow}
                  />
                ))}
              </tbody>
            </SortableContext>
          </table>
        </DndContext>
      </div>
      <div className="flex gap-2 mt-1">
        <button
          onClick={handleAddRow}
          className="text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
        >
          + Add row
        </button>
        <button
          onClick={handleAddColumn}
          className="text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
        >
          + Add column
        </button>
      </div>
    </div>
  )
}
