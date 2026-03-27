import { MouseEvent } from 'react'

export interface HoverActionsProps {
  onRename?: () => void
  onDuplicate?: () => void
  onDelete?: () => void
  extraActions?: React.ReactNode
}

export default function HoverActions({
  onRename,
  onDuplicate,
  onDelete,
  extraActions,
}: HoverActionsProps) {
  const handleClick = (e: MouseEvent, handler?: () => void) => {
    e.stopPropagation()
    handler?.()
  }

  return (
    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
      {onRename && (
        <button
          onClick={(e) => handleClick(e, onRename)}
          className="p-1.5 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100"
          aria-label="Rename"
          title="Rename"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
          </svg>
        </button>
      )}

      {onDuplicate && (
        <button
          onClick={(e) => handleClick(e, onDuplicate)}
          className="p-1.5 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100"
          aria-label="Duplicate"
          title="Duplicate"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" />
          </svg>
        </button>
      )}

      {extraActions}

      {onDelete && (
        <button
          onClick={(e) => handleClick(e, onDelete)}
          className="p-1.5 rounded text-gray-400 hover:text-red-600 hover:bg-red-50"
          aria-label="Delete"
          title="Delete"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      )}
    </div>
  )
}
