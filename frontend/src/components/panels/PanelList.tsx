import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePanels, useCreatePanel, useDeletePanel, useUpdatePanel } from '@/hooks/usePanels'
import { useInstruments } from '@/hooks/useInstruments'
import Modal from '@/components/layout/Modal'
import HoverActionsRow from '@/components/layout/HoverActionsRow'

export default function PanelList() {
  const { data, isLoading, error } = usePanels(0, 500)
  const createMutation = useCreatePanel()
  const deleteMutation = useDeletePanel()
  const updateMutation = useUpdatePanel()
  const navigate = useNavigate()
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [editingPanel, setEditingPanel] = useState<{id: string, name: string} | null>(null)
  const [renameValue, setRenameValue] = useState('')

  const { data: instrumentsData } = useInstruments(0, 500)
  const instruments = instrumentsData?.items ?? []

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

  const handleRename = () => {
    if (!editingPanel || !renameValue.trim() || renameValue.trim() === editingPanel.name) {
      setEditingPanel(null)
      return
    }
    updateMutation.mutate(
      { id: editingPanel.id, data: { name: renameValue.trim() } },
      {
        onSuccess: () => {
          setEditingPanel(null)
          setRenameValue('')
        },
      }
    )
  }

  const handleDelete = (id: string, name: string) => {
    if (!confirm('Delete panel "' + name + '"? This cannot be undone.')) return
    deleteMutation.mutate(id)
  }

  if (isLoading) return <p className="text-gray-500 dark:text-gray-400">Loading panels...</p>
  if (error) return <p className="text-red-600">Failed to load panels.</p>

  const inputClass = "w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm dark:text-gray-100 focus:border-blue-500 focus:outline-none"

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold dark:text-gray-100">Panels</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          New Panel
        </button>
      </div>

      {items.length === 0 ? (
        <p className="text-gray-500 dark:text-gray-400">No panels yet. Create one to get started.</p>
      ) : (
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400">
              <th className="py-2 font-medium">Name</th>
              <th className="py-2 font-medium">Instrument</th>
              <th className="py-2 font-medium">Targets</th>
              <th className="py-2 font-medium">Assignments</th>
              <th className="w-16 py-2" />
            </tr>
          </thead>
          <tbody>
            {items.map((p) => (
              <HoverActionsRow
                key={p.id}
                as="tr"
                className="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"
                onClick={() => navigate('/panels/' + p.id)}
                actions={{
                  onRename: () => {
                    setEditingPanel({ id: p.id, name: p.name })
                    setRenameValue(p.name)
                  },
                  // TODO: wire onDuplicate after backend POST /{id}/duplicate endpoints are built
                  onDuplicate: undefined,
                  onDelete: () => handleDelete(p.id, p.name),
                }}
              >
                <td className="py-2 font-medium text-gray-900 dark:text-gray-100">{p.name}</td>
                <td className="py-2 text-gray-600 dark:text-gray-400">
                  {p.instrument_id ? (
                    (() => {
                      const inst = instruments.find(i => i.id === p.instrument_id)
                      return inst ? (
                        <button
                          type="button"
                          className="text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-50"
                          onClick={(e) => {
                            e.stopPropagation()
                            navigate('/instruments/' + inst.id)
                          }}
                        >
                          {inst.name}
                        </button>
                      ) : (
                        <span className="text-gray-600 dark:text-gray-400">Configured</span>
                      )
                    })()
                  ) : (
                    <span className="italic text-gray-400 dark:text-gray-500">No instrument</span>
                  )}
                </td>
                <td className="py-2 text-gray-600 dark:text-gray-400">{p.target_count}</td>
                <td className="py-2 text-gray-600 dark:text-gray-400">{p.assignment_count}</td>
              </HoverActionsRow>
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
            <label htmlFor="panel-name" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
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
              className={inputClass}
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
        isOpen={!!editingPanel}
        onClose={() => {
          setEditingPanel(null)
          setRenameValue('')
        }}
        title="Rename Panel"
      >
        <div className="space-y-4">
          <div>
            <label htmlFor="rename-panel" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Panel Name
            </label>
            <input
              id="rename-panel"
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
                setEditingPanel(null)
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
