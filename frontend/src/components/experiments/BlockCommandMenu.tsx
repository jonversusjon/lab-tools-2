import { useEffect, useRef, useState } from 'react'

interface BlockMenuItem {
  icon: string
  label: string
  blockType: string
  initialContent: Record<string, unknown>
  disabled?: boolean
}

interface BlockMenuCategory {
  name: string
  items: BlockMenuItem[]
}

const MENU_CATEGORIES: BlockMenuCategory[] = [
  {
    name: 'Text',
    items: [
      { icon: '¶', label: 'Paragraph', blockType: 'paragraph', initialContent: { text: '' } },
      { icon: 'H1', label: 'Heading 1', blockType: 'heading_1', initialContent: { text: '' } },
      { icon: 'H2', label: 'Heading 2', blockType: 'heading_2', initialContent: { text: '' } },
      { icon: 'H3', label: 'Heading 3', blockType: 'heading_3', initialContent: { text: '' } },
      { icon: 'H4', label: 'Heading 4', blockType: 'heading_4', initialContent: { text: '' } },
    ],
  },
  {
    name: 'Lists',
    items: [
      { icon: '•', label: 'Bulleted List', blockType: 'bulleted_list_item', initialContent: { text: '' } },
      { icon: '1.', label: 'Numbered List', blockType: 'numbered_list_item', initialContent: { text: '' } },
    ],
  },
  {
    name: 'Media',
    items: [
      { icon: '💡', label: 'Callout', blockType: 'callout', initialContent: { text: '', icon: '💡', color: 'gray_background' } },
      { icon: '—', label: 'Divider', blockType: 'divider', initialContent: {} },
      { icon: '▦', label: 'Table', blockType: 'table', initialContent: { table_width: 3, has_column_header: true, has_row_header: false, rows: [['', '', ''], ['', '', '']] } },
    ],
  },
  {
    name: 'Layout',
    items: [
      { icon: '▐▌', label: '2 Columns', blockType: 'column_list', initialContent: { column_count: 2 } },
      { icon: '▐▐▌', label: '3 Columns', blockType: 'column_list_3', initialContent: { column_count: 3 } },
    ],
  },
  {
    name: 'Panels',
    items: [
      { icon: '🔬', label: 'Flow Panel', blockType: 'flow_panel', initialContent: {} },
      { icon: '🔭', label: 'IF Panel', blockType: 'if_panel', initialContent: {} },
    ],
  },
]

interface BlockCommandMenuProps {
  onSelect: (blockType: string, initialContent: Record<string, unknown>) => void
  onClose: () => void
  filterText?: string
  onOpenTemplatePicker?: (panelType: 'flow' | 'if') => void
  excludeLayout?: boolean
}

export default function BlockCommandMenu({
  onSelect,
  onClose,
  filterText,
  onOpenTemplatePicker,
  excludeLayout,
}: BlockCommandMenuProps) {
  const [selectedIndex, setSelectedIndex] = useState(0)
  const menuRef = useRef<HTMLDivElement>(null)

  // Build flat list of visible items
  const categories = excludeLayout
    ? MENU_CATEGORIES.filter((cat) => cat.name !== 'Layout')
    : MENU_CATEGORIES
  const allItems: BlockMenuItem[] = []
  for (const cat of categories) {
    for (const item of cat.items) {
      allItems.push(item)
    }
  }

  const filter = (filterText ?? '').toLowerCase()
  const filteredItems = filter
    ? allItems.filter((item) => item.label.toLowerCase().includes(filter))
    : allItems

  // Reset selection when filter changes
  useEffect(() => {
    setSelectedIndex(0)
  }, [filterText])

  // Keyboard navigation
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex((i) => Math.min(i + 1, filteredItems.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex((i) => Math.max(i - 1, 0))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        const item = filteredItems[selectedIndex]
        if (item && !item.disabled) {
          if (
            (item.blockType === 'flow_panel' || item.blockType === 'if_panel') &&
            onOpenTemplatePicker
          ) {
            onOpenTemplatePicker(item.blockType === 'flow_panel' ? 'flow' : 'if')
          } else {
            onSelect(item.blockType, item.initialContent)
          }
        }
      } else if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [filteredItems, selectedIndex, onSelect, onClose])

  // Close on click outside
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [onClose])

  if (filteredItems.length === 0) {
    return (
      <div
        ref={menuRef}
        className="z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-3 text-sm text-gray-400 dark:text-gray-500"
      >
        No results
      </div>
    )
  }

  // Group filtered items by category for display
  let flatIdx = 0
  return (
    <div
      ref={menuRef}
      className="z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-80 overflow-y-auto w-64"
    >
      {categories.map((cat) => {
        const catItems = cat.items.filter(
          (item) => !filter || item.label.toLowerCase().includes(filter)
        )
        if (catItems.length === 0) return null
        return (
          <div key={cat.name}>
            <div className="text-xs font-semibold uppercase text-gray-400 dark:text-gray-500 px-3 py-1.5">
              {cat.name}
            </div>
            {catItems.map((item) => {
              const thisIdx = flatIdx++
              const isSelected = thisIdx === selectedIndex
              return (
                <button
                  key={item.blockType + item.label}
                  onClick={() => {
                    if (!item.disabled) {
                      if (
                        (item.blockType === 'flow_panel' || item.blockType === 'if_panel') &&
                        onOpenTemplatePicker
                      ) {
                        onOpenTemplatePicker(item.blockType === 'flow_panel' ? 'flow' : 'if')
                      } else {
                        onSelect(item.blockType, item.initialContent)
                      }
                    }
                  }}
                  disabled={item.disabled}
                  className={
                    'w-full px-3 py-2 flex items-center gap-2 rounded text-left text-sm ' +
                    (item.disabled
                      ? 'text-gray-300 dark:text-gray-600 cursor-not-allowed '
                      : 'text-gray-700 dark:text-gray-300 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 ') +
                    (isSelected && !item.disabled
                      ? 'bg-gray-100 dark:bg-gray-700'
                      : '')
                  }
                >
                  <span className="w-6 text-center text-sm select-none">
                    {item.icon}
                  </span>
                  <span>{item.label}</span>
                </button>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}
