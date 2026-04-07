import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  useExperiments,
  useCreateExperiment,
  useDeleteExperiment,
  useUpdateExperiment,
} from '@/hooks/useExperiments'
import Modal from '@/components/layout/Modal'
import HoverActionsRow from '@/components/layout/HoverActionsRow'

export default function ExperimentList() {
  const { data, isLoading, error } = useExperiments(0, 500)
  const createMutation = useCreateExperiment()
  const deleteMutation = useDeleteExperiment()
  const updateMutation = useUpdateExperiment()
  const navigate = useNavigate()

  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [editingExperiment, setEditingExperiment] = useState<{ id: string; name: string } | null>(null)
  const [renameValue, setRenameValue] = useState('')

  const items = data?.items ?? []

  const handleCreate = () => {
    if (!newName.trim()) return
    createMutation.mutate(
      { name: newName.trim(), description: newDescription.trim() || null },
      {
        onSuccess: (experiment) => {
          setShowCreate(false)
          setNewName('')
          setNewDescription('')
          navigate('/experiments/' + experiment.id)
        },
      }
    )
  }

  const handleRename = () => {
    if (!editingExperiment || !renameValue.trim() || renameValue.trim() === editingExperiment.name) {
      setEditingExperiment(null)
      return
    }
    updateMutation.mutate(
      { id: editingExperiment.id, data: { name: renameValue.trim() } },
      {
        onSuccess: () => {
          setEditingExperiment(null)
          setRenameValue('')
        },
      }
    )
  }

  const handleDelete = (id: string, name: string) => {
    if (!confirm('Delete experiment "' + name + '"? All blocks and data will be lost.')) return
    deleteMutation.mutate(id)
  }

  if (isLoading) return <p className="text-gray-500 dark:text-gray-400">Loading experiments...</p>
  if (error) return <p className="text-red-600">Failed to load experiments.</p>

  const inputClass =
    'w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm dark:text-gray-100 focus:border-blue-500 focus:outline-none'

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold dark:text-gray-100">Experiments</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          New Experiment
        </button>
      </div>

      {items.length === 0 ? (
        <p className="text-gray-500 dark:text-gray-400">No experiments yet. Create one to get started.</p>
      ) : (
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400">
              <th className="py-2 font-medium">Name</th>
              <th className="py-2 font-medium">Description</th>
              <th className="py-2 font-medium">Blocks</th>
              <th className="py-2 font-medium">Created</th>
              <th className="w-16 py-2" />
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const createdAt = item.created_at
                ? new Date(item.created_at).toLocaleDateString()
                : '—'
              const description =
                item.description
                  ? item.description.length > 60
                    ? item.description.slice(0, 60) + '...'
                    : item.description
                  : null

              return (
                <HoverActionsRow
                  key={item.id}
                  as="tr"
                  className="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"
                  onClick={() => navigate('/experiments/' + item.id)}
                  actions={{
                    onRename: () => {
                      setEditingExperiment({ id: item.id, name: item.name })
                      setRenameValue(item.name)
                    },
                    onDuplicate: undefined,
                    onDelete: () => handleDelete(item.id, item.name),
                  }}
                >
                  <td className="py-2 font-medium text-gray-900 dark:text-gray-100">{item.name}</td>
                  <td className="py-2 text-gray-600 dark:text-gray-400">
                    {description ?? (
                      <span className="italic text-gray-400 dark:text-gray-500">—</span>
                    )}
                  </td>
                  <td className="py-2 text-gray-600 dark:text-gray-400">{item.block_count}</td>
                  <td className="py-2 text-gray-500 dark:text-gray-400">{createdAt}</td>
                </HoverActionsRow>
              )
            })}
          </tbody>
        </table>
      )}

      <Modal
        isOpen={showCreate}
        onClose={() => {
          setShowCreate(false)
          setNewName('')
          setNewDescription('')
        }}
        title="New Experiment"
      >
        <div className="space-y-4">
          <div>
            <label htmlFor="exp-name" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Name
            </label>
            <input
              id="exp-name"
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreate()
              }}
              className={inputClass}
              autoFocus
            />
          </div>
          <div>
            <label htmlFor="exp-description" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Description <span className="font-normal text-gray-400">(optional)</span>
            </label>
            <textarea
              id="exp-description"
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              rows={3}
              className={inputClass + ' resize-none'}
            />
          </div>
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => {
                setShowCreate(false)
                setNewName('')
                setNewDescription('')
              }}
              className="rounded border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Create
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={!!editingExperiment}
        onClose={() => {
          setEditingExperiment(null)
          setRenameValue('')
        }}
        title="Rename Experiment"
      >
        <div className="space-y-4">
          <div>
            <label htmlFor="rename-exp" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Name
            </label>
            <input
              id="rename-exp"
              type="text"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRename()
              }}
              className={inputClass}
              autoFocus
            />
          </div>
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => {
                setEditingExperiment(null)
                setRenameValue('')
              }}
              className="rounded border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Cancel
            </button>
            <button
              onClick={handleRename}
              className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Save
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
