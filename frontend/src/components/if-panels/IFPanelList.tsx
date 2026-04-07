import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useIFPanels, useCreateIFPanel, useDeleteIFPanel, useUpdateIFPanel } from '@/hooks/useIFPanels'
import { useMicroscopes } from '@/hooks/useMicroscopes'
import Modal from '@/components/layout/Modal'
import HoverActionsRow from '@/components/layout/HoverActionsRow'

export default function IFPanelList() {
  const { data, isLoading, error } = useIFPanels(0, 500)
  const createMutation = useCreateIFPanel()
  const deleteMutation = useDeleteIFPanel()
  const updateMutation = useUpdateIFPanel()
  const navigate = useNavigate()
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [newPanelType, setNewPanelType] = useState<'IF' | 'IHC'>('IF')
  const [editingPanel, setEditingPanel] = useState<{ id: string; name: string } | null>(null)
  const [renameValue, setRenameValue] = useState('')

  const { data: microscopesData } = useMicroscopes(0, 500)
  const microscopes = microscopesData?.items ?? []

  const items = data?.items ?? []

  const handleCreate = () => {
    if (!newName.trim()) return
    createMutation.mutate(
      { name: newName.trim(), panel_type: newPanelType },
      {
        onSuccess: (panel) => {
          setShowCreate(false)
          setNewName('')
          setNewPanelType('IF')
          navigate('/if-ihc/panels/' + panel.id)
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
    if (!confirm('Delete panel template "' + name + '"? This cannot be undone.')) return
    deleteMutation.mutate(id)
  }

  if (isLoading) return <p className="text-gray-500 dark:text-gray-400">Loading panel templates...</p>
  if (error) return <p className="text-red-600">Failed to load panels.</p>

  const inputClass =
    'w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm dark:text-gray-100 focus:border-blue-500 focus:outline-none'

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold dark:text-gray-100">IF/IHC Panel Templates</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Design reusable panels here. Add them to experiments to use.
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          New Template
        </button>
      </div>

      {items.length === 0 ? (
        <p className="text-gray-500 dark:text-gray-400">
          No panel templates yet. Create one to get started.
        </p>
      ) : (
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400">
              <th className="py-2 font-medium">Name</th>
              <th className="py-2 font-medium">Type</th>
              <th className="py-2 font-medium">Microscope</th>
              <th className="py-2 font-medium">Targets</th>
              <th className="py-2 font-medium">Updated</th>
              <th className="w-16 py-2" />
            </tr>
          </thead>
          <tbody>
            {items.map((p) => {
              const microscope = microscopes.find((m) => m.id === p.microscope_id)
              const updatedAt = p.updated_at ? new Date(p.updated_at).toLocaleDateString() : '—'
              return (
                <HoverActionsRow
                  key={p.id}
                  as="tr"
                  className="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"
                  onClick={() => navigate('/if-ihc/panels/' + p.id)}
                  actions={{
                    onRename: () => {
                      setEditingPanel({ id: p.id, name: p.name })
                      setRenameValue(p.name)
                    },
                    onDuplicate: undefined,
                    onDelete: () => handleDelete(p.id, p.name),
                  }}
                >
                  <td className="py-2 font-medium text-gray-900 dark:text-gray-100">{p.name}</td>
                  <td className="py-2">
                    {p.panel_type === 'IHC' ? (
                      <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">
                        IHC
                      </span>
                    ) : (
                      <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                        IF
                      </span>
                    )}
                  </td>
                  <td className="py-2 text-gray-600 dark:text-gray-400">
                    {microscope ? (
                      microscope.name
                    ) : (
                      <span className="text-gray-400 dark:text-gray-500">—</span>
                    )}
                  </td>
                  <td className="py-2 text-gray-600 dark:text-gray-400">{p.target_count}</td>
                  <td className="py-2 text-gray-600 dark:text-gray-400">{updatedAt}</td>
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
          setNewPanelType('IF')
        }}
        title="New Panel Template"
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
          <div>
            <p className="mb-1 text-sm font-medium text-gray-700 dark:text-gray-300">Panel Type</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setNewPanelType('IF')}
                className={
                  'rounded px-4 py-2 text-sm font-medium ' +
                  (newPanelType === 'IF'
                    ? 'bg-blue-600 text-white'
                    : 'border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700')
                }
              >
                IF
              </button>
              <button
                type="button"
                onClick={() => setNewPanelType('IHC')}
                className={
                  'rounded px-4 py-2 text-sm font-medium ' +
                  (newPanelType === 'IHC'
                    ? 'bg-purple-600 text-white'
                    : 'border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700')
                }
              >
                IHC
              </button>
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => {
                setShowCreate(false)
                setNewName('')
                setNewPanelType('IF')
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
        title="Rename Panel Template"
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
