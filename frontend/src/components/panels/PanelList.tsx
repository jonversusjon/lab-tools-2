import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePanels, useCreatePanel, useDeletePanel } from '@/hooks/usePanels'
import Modal from '@/components/layout/Modal'

export default function PanelList() {
  const { data, isLoading, error } = usePanels(0, 500)
  const createMutation = useCreatePanel()
  const deleteMutation = useDeletePanel()
  const navigate = useNavigate()
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')

  const items = data?.items ?? []

  const handleCreate = () => {
    if (!newName.trim()) return
    createMutation.mutate(
      { name: newName.trim() },
      {
        onSuccess: (panel) => {
          setShowCreate(false)
          setNewName('')
          navigate('/panels/' + panel.id)
        },
      }
    )
  }

  const handleDelete = (id: string, name: string) => {
    if (!confirm('Delete panel "' + name + '"? This cannot be undone.')) return
    deleteMutation.mutate(id)
  }

  if (isLoading) return <p className="text-gray-500">Loading panels...</p>
  if (error) return <p className="text-red-600">Failed to load panels.</p>

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Panels</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          New Panel
        </button>
      </div>

      {items.length === 0 ? (
        <p className="text-gray-500">No panels yet. Create one to get started.</p>
      ) : (
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-gray-500">
              <th className="py-2 font-medium">Name</th>
              <th className="py-2 font-medium">Instrument</th>
              <th className="py-2 font-medium">Targets</th>
              <th className="py-2 font-medium">Assignments</th>
              <th className="w-16 py-2" />
            </tr>
          </thead>
          <tbody>
            {items.map((p) => (
              <tr
                key={p.id}
                className="cursor-pointer border-b border-gray-100 hover:bg-gray-50"
                onClick={() => navigate('/panels/' + p.id)}
              >
                <td className="py-2 font-medium text-gray-900">{p.name}</td>
                <td className="py-2 text-gray-600">
                  {p.instrument_id ? (
                    <span className="text-gray-600">Configured</span>
                  ) : (
                    <span className="italic text-gray-400">No instrument</span>
                  )}
                </td>
                <td className="py-2 text-gray-600">{p.target_count}</td>
                <td className="py-2 text-gray-600">{p.assignment_count}</td>
                <td className="py-2 text-center">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDelete(p.id, p.name)
                    }}
                    className="text-red-500 hover:text-red-700"
                    aria-label="Delete"
                  >
                    &times;
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <Modal
        isOpen={showCreate}
        onClose={() => {
          setShowCreate(false)
          setNewName('')
        }}
        title="New Panel"
      >
        <div className="space-y-4">
          <div>
            <label htmlFor="panel-name" className="mb-1 block text-sm font-medium text-gray-700">
              Panel Name
            </label>
            <input
              id="panel-name"
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreate()
              }}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              autoFocus
            />
          </div>
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => {
                setShowCreate(false)
                setNewName('')
              }}
              className="rounded border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
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
    </div>
  )
}
