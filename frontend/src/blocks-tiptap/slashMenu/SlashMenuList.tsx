import { forwardRef, useEffect, useImperativeHandle, useState } from 'react'
import type { SlashMenuItem } from './items'
import { getProviderForItem } from './templateProviders'

export interface SlashMenuListProps {
  items: SlashMenuItem[]
  command: (item: SlashMenuItem) => void
  /**
   * Called when `.` is pressed while an item that has a registered template
   * provider is highlighted. The container uses this to enter omnibox mode.
   */
  onDotTrigger?: (item: SlashMenuItem) => void
}

export interface SlashMenuListRef {
  onKeyDown: (event: KeyboardEvent) => boolean
}

const SlashMenuList = forwardRef<SlashMenuListRef, SlashMenuListProps>(
  ({ items, command, onDotTrigger }, ref) => {
    const [selectedIndex, setSelectedIndex] = useState(0)

    useEffect(() => setSelectedIndex(0), [items])

    useImperativeHandle(ref, () => ({
      onKeyDown: (event: KeyboardEvent) => {
        if (event.key === 'ArrowUp') {
          setSelectedIndex((i) => (i + items.length - 1) % items.length)
          return true
        }
        if (event.key === 'ArrowDown') {
          setSelectedIndex((i) => (i + 1) % items.length)
          return true
        }
        if (event.key === 'Enter') {
          if (items[selectedIndex]) command(items[selectedIndex])
          return true
        }
        if (event.key === '.') {
          // Dot is reserved as the template-trigger key whenever the slash
          // menu is open: swallow it unconditionally so it never reaches the
          // editor. Only items with a registered provider switch to omnibox.
          const highlighted = items[selectedIndex]
          if (highlighted && getProviderForItem(highlighted.title)) {
            onDotTrigger?.(highlighted)
          }
          return true
        }
        return false
      },
    }))

    if (items.length === 0) {
      return (
        <div className="min-w-[12rem] rounded border border-border bg-elevated px-3 py-3 text-sm text-foreground-subtle shadow-lg">
          No matching blocks
        </div>
      )
    }

    return (
      <div className="max-h-96 min-w-[12rem] overflow-y-auto rounded border border-border bg-elevated shadow-lg">
        {items.map((item, index) => (
          <button
            key={item.title}
            type="button"
            onClick={() => command(item)}
            onMouseEnter={() => setSelectedIndex(index)}
            className={
              'w-full px-3 py-1.5 text-left text-sm ' +
              (index === selectedIndex
                ? 'bg-blue-50 dark:bg-blue-900/30'
                : 'hover:bg-gray-50 dark:hover:bg-gray-700')
            }
          >
            {item.title}
          </button>
        ))}
      </div>
    )
  },
)

SlashMenuList.displayName = 'SlashMenuList'
export default SlashMenuList
