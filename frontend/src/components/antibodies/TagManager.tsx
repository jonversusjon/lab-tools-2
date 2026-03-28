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
    <div className="absolute right-0 top-full z-20 mt-1 w-64 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3 shadow-lg">
      <div className="mb-2 text-xs font-medium text-gray-500 dark:text-gray-400">
        Assign Tags
      </div>

      <div className="max-h-48 overflow-y-auto space-y-1">
        {tags.map((tag) => (
          <label
            key={tag.id}
            className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-gray-50 dark:hover:bg-gray-700"
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
          className="flex-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-2 py-1 text-xs dark:text-gray-100"
        />
        <button
          onClick={handleCreateTag}
          disabled={!newTagName.trim()}
          className="rounded bg-gray-100 dark:bg-gray-700 px-2 py-1 text-xs hover:bg-gray-200 dark:hover:bg-gray-600 dark:text-gray-300 disabled:opacity-50"
        >
          +
        </button>
      </div>

      <div className="mt-3 flex justify-end gap-2">
        <button
          onClick={onClose}
          className="rounded px-3 py-1 text-xs text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={assignMutation.isPending}
          className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          Save
        </button>
      </div>
    </div>
  )
}
