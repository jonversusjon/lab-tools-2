import type { AntibodyTag } from '@/types'

interface TagBadgeProps {
  tag: AntibodyTag
  onRemove?: () => void
}

export default function TagBadge({ tag, onRemove }: TagBadgeProps) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
      style={{
        backgroundColor: tag.color ? tag.color + '20' : '#6b728020',
        color: tag.color ?? '#6b7280',
        border: `1px solid ${tag.color ?? '#6b7280'}40`,
      }}
    >
      {tag.name}
      {onRemove && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
          className="ml-0.5 hover:opacity-70"
        >
          &times;
        </button>
      )}
    </span>
  )
}
