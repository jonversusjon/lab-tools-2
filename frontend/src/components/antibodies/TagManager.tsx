import { useState } from 'react'
import { useTags, useCreateTag } from '@/hooks/useTags'
import { useAssignTags } from '@/hooks/useAntibodies'
import type { AntibodyTag } from '@/types'
import TagBadge from './TagBadge'

interface TagManagerProps {
  antibodyId: string
  currentTags: AntibodyTag[]
  onClose: () => void
}

export default function TagManager({
  antibodyId,
  currentTags,
  onClose,
}: TagManagerProps) {
  const { data: allTags } = useTags()
  const assignMutation = useAssignTags()
  const createMutation = useCreateTag()
  const [newTagName, setNewTagName] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    new Set(currentTags.map((t) => t.id))
  )

  const tags = allTags ?? []

  const toggleTag = (tagId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(tagId)) next.delete(tagId)
      else next.add(tagId)
      return next
    })
  }

  const handleSave = () => {
    assignMutation.mutate(
      { antibodyId, tagIds: Array.from(selectedIds) },
      { onSuccess: onClose }
    )
  }

  const handleCreateTag = () => {
    if (!newTagName.trim()) return
    createMutation.mutate(
      { name: newTagName.trim() },
      {
        onSuccess: (tag) => {
          setSelectedIds((prev) => new Set([...prev, tag.id]))
          setNewTagName('')
        },
      }
    )
  }

  return (
    <div className="absolute right-0 top-full z-20 mt-1 w-64 rounded-lg border border-border bg-elevated p-3 shadow-lg">
      <div className="mb-2 text-xs font-medium text-foreground-muted">
        Assign Tags
      </div>

      <div className="max-h-48 overflow-y-auto space-y-1">
        {tags.map((tag) => (
          <label
            key={tag.id}
            className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-hover"
          >
            <input
              type="checkbox"
              checked={selectedIds.has(tag.id)}
              onChange={() => toggleTag(tag.id)}
            />
            <TagBadge tag={tag} />
          </label>
        ))}
      </div>

      <div className="mt-2 flex gap-1">
        <input
          type="text"
          placeholder="New tag..."
          value={newTagName}
          onChange={(e) => setNewTagName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleCreateTag()}
          className="flex-1 rounded border border-border-strong bg-elevated text-foreground px-2 py-1 text-xs"
        />
        <button
          onClick={handleCreateTag}
          disabled={!newTagName.trim()}
          className="rounded bg-surface px-2 py-1 text-xs text-foreground-muted hover:bg-hover disabled:opacity-50"
        >
          +
        </button>
      </div>

      <div className="mt-3 flex justify-end gap-2">
        <button
          onClick={onClose}
          className="rounded px-3 py-1 text-xs text-foreground-muted hover:bg-hover"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={assignMutation.isPending}
          className="rounded bg-accent hover:bg-accent-hover text-accent-foreground px-3 py-1 text-xs font-medium disabled:opacity-50"
        >
          Save
        </button>
      </div>
    </div>
  )
}
