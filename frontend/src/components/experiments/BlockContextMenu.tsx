import { useEffect, useRef } from 'react'
import type { ExperimentBlock } from '@/types'

const TEXT_TYPES = new Set([
  'paragraph',
  'heading_1',
  'heading_2',
  'heading_3',
  'heading_4',
  'bulleted_list_item',
  'numbered_list_item',
])

const CONVERT_OPTIONS = [
  { label: 'Paragraph', type: 'paragraph' },
  { label: 'Heading 1', type: 'heading_1' },
  { label: 'Heading 2', type: 'heading_2' },
  { label: 'Heading 3', type: 'heading_3' },
  { label: 'Heading 4', type: 'heading_4' },
  { label: 'Bulleted List', type: 'bulleted_list_item' },
  { label: 'Numbered List', type: 'numbered_list_item' },
]

interface BlockContextMenuProps {
  block: ExperimentBlock
  onDelete: () => void
  onDuplicate: () => void
  onConvertType: (newType: string) => void
  onClose: () => void
}

export default function BlockContextMenu({
  block,
  onDelete,
  onDuplicate,
  onConvertType,
  onClose,
}: BlockContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)

  const isPanel =
    block.block_type === 'flow_panel' || block.block_type === 'if_panel'
  const canConvert = TEXT_TYPES.has(block.block_type)

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [onClose])

  const handleDelete = () => {
    if (isPanel) {
      if (
        !window.confirm(
          'Delete this panel instance? Volume calculations will be lost.'
        )
      ) {
        return
      }
    }
    onDelete()
    onClose()
  }

  return (
    <div
      ref={menuRef}
      className="z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg w-48 py-1"
    >
      <button
        onClick={() => {
          onDuplicate()
          onClose()
        }}
        className="w-full px-3 py-1.5 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
      >
        Duplicate
      </button>
      {canConvert && (
        <div className="group/convert relative">
          <button className="w-full px-3 py-1.5 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center justify-between">
            Convert to
            <span className="text-xs text-gray-400">▶</span>
          </button>
          <div className="absolute left-full top-0 ml-0.5 hidden group-hover/convert:block z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg w-40 py-1">
            {CONVERT_OPTIONS.filter((opt) => opt.type !== block.block_type).map(
              (opt) => (
                <button
                  key={opt.type}
                  onClick={() => {
                    onConvertType(opt.type)
                    onClose()
                  }}
                  className="w-full px-3 py-1.5 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  {opt.label}
                </button>
              )
            )}
          </div>
        </div>
      )}
      <div className="border-t border-gray-200 dark:border-gray-700 my-1" />
      <button
        onClick={handleDelete}
        className="w-full px-3 py-1.5 text-left text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
      >
        Delete
      </button>
    </div>
  )
}
