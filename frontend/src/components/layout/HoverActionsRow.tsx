import { ReactNode } from 'react'
import HoverActions, { HoverActionsProps } from './HoverActions'

interface HoverActionsRowProps {
  children: ReactNode
  actions: HoverActionsProps
  as?: 'div' | 'tr' | 'li'
  className?: string
  onClick?: () => void
}

export default function HoverActionsRow({
  children,
  actions,
  as: Component = 'div',
  className = '',
  onClick,
}: HoverActionsRowProps) {
  return (
    <Component
      className={`group relative ${onClick ? 'cursor-pointer' : ''} ${className}`}
      onClick={onClick}
    >
      {children}
      {(actions.onRename || actions.onDuplicate || actions.onDelete || actions.extraActions) && (
        <div className={Component === 'tr' ? '' : 'absolute right-2 top-1/2 -translate-y-1/2'}>
          {Component === 'tr' ? (
            <td className="w-16 py-2 text-right relative">
              <div className="absolute right-2 top-1/2 -translate-y-1/2 bg-white/90 shadow-sm rounded-md md:bg-transparent md:shadow-none">
                <HoverActions {...actions} />
              </div>
            </td>
          ) : (
            <HoverActions {...actions} />
          )}
        </div>
      )}
    </Component>
  )
}
