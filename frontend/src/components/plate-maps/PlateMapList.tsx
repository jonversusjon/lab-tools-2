import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePlateMaps, useCreatePlateMap, useDeletePlateMap, useUpdatePlateMap } from '@/hooks/usePlateMaps'
import Modal from '@/components/layout/Modal'
import HoverActionsRow from '@/components/layout/HoverActionsRow'

export default function PlateMapList() {
  const { data, isLoading, error } = usePlateMaps(0, 500)
  const createMutation = useCreatePlateMap()
  const deleteMutation = useDeletePlateMap()
  const updateMutation = useUpdatePlateMap()
  const navigate = useNavigate()

  const [editingMap, setEditingMap] = useState<{ id: string; name: string } | null>(null)
  const [renameValue, setRenameValue] = useState('')

  const items = data?.items ?? []

  const handleCreate = () => {
    const now = new Date()
    const defaultName = 'Plate \u2014 ' + now.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }) + ' ' + now.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    })

    createMutation.mutate(
      { name: defaultName, plate_type: '96-well' },
      {
        onSuccess: (pm) => {
          navigate('/plate-maps/' + pm.id)
        },
      }
    )
  }

  const handleRename = () => {
    if (!editingMap || !renameValue.trim() || renameValue.trim() === editingMap.name) {
      setEditingMap(null)
      return
    }
    updateMutation.mutate(
      { id: editingMap.id, data: { name: renameValue.trim() } },
      {
        onSuccess: () => {
          setEditingMap(null)
          setRenameValue('')
        },
      }
    )
  }

  const handleDelete = (id: string, name: string) => {
    if (!confirm('Delete plate map "' + name + '"? This cannot be undone.')) return
    deleteMutation.mutate(id)
  }

  if (isLoading) return <p className="text-gray-500 dark:text-gray-400">Loading plate maps...</p>
  if (error) return <p className="text-red-600">Failed to load plate maps.</p>

  const inputClass =
    'w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm dark:text-gray-100 focus:border-blue-500 focus:outline-none'

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold dark:text-gray-100">Plate Maps</h1>
        <button
          onClick={handleCreate}
          disabled={createMutation.isPending}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          New Plate Map
        </button>
      </div>

      {items.length === 0 ? (
        <p className="text-gray-500 dark:text-gray-400">No plate maps yet. Create one to get started.</p>
      ) : (
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400">
              <th className="py-2 font-medium">Name</th>
              <th className="py-2 font-medium">Type</th>
              <th className="py-2 font-medium">Created</th>
              <th className="w-16 py-2" />
            </tr>
          </thead>
          <tbody>
            {items.map((pm) => (
              <HoverActionsRow
                key={pm.id}
                as="tr"
                className="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"
                onClick={() => navigate('/plate-maps/' + pm.id)}
                actions={{
                  onRename: () => {
                    setEditingMap({ id: pm.id, name: pm.name })
                    setRenameValue(pm.name)
                  },
                  onDelete: () => handleDelete(pm.id, pm.name),
                }}
              >
                <td className="py-2 font-medium text-gray-900 dark:text-gray-100">{pm.name}</td>
                <td className="py-2 text-gray-600 dark:text-gray-400">{pm.plate_type}</td>
                <td className="py-2 text-gray-500 dark:text-gray-400">
                  {pm.created_at ? new Date(pm.created_at).toLocaleDateString() : '—'}
                </td>
              </HoverActionsRow>
            ))}
          </tbody>
        </table>
      )}

      <Modal
        isOpen={!!editingMap}
        onClose={() => { setEditingMap(null); setRenameValue('') }}
        title="Rename Plate Map"
      >
        <div className="space-y-4">
          <div>
            <label htmlFor="rename-pm" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Name
            </label>
            <input
              id="rename-pm"
              type="text"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleRename() }}
              className={inputClass}
              autoFocus
            />
          </div>
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => { setEditingMap(null); setRenameValue('') }}
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
