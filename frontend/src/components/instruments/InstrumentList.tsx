import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useInstruments, useUpdateInstrument, useDeleteInstrument } from '@/hooks/useInstruments'
import Modal from '@/components/layout/Modal'
import HoverActionsRow from '@/components/layout/HoverActionsRow'

export default function InstrumentList() {
  const { data, isLoading, error } = useInstruments()
  const updateMutation = useUpdateInstrument()
  const deleteMutation = useDeleteInstrument()
  const navigate = useNavigate()

  const [editingInstrument, setEditingInstrument] = useState<{id: string, name: string} | null>(null)
  const [renameValue, setRenameValue] = useState('')

  const handleRename = () => {
    if (!editingInstrument || !renameValue.trim() || renameValue.trim() === editingInstrument.name) {
      setEditingInstrument(null)
      return
    }
    updateMutation.mutate(
      { id: editingInstrument.id, data: { name: renameValue.trim() } },
      {
        onSuccess: () => {
          setEditingInstrument(null)
          setRenameValue('')
        },
      }
    )
  }

  const handleDelete = (id: string, name: string) => {
    if (!confirm('Delete instrument "' + name + '"? This cannot be undone.')) return
    deleteMutation.mutate(id)
  }

  if (isLoading) return <p className="text-gray-500">Loading instruments...</p>
  if (error) return <p className="text-red-600">Failed to load instruments.</p>

  const instruments = data?.items ?? []

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Instruments</h1>
        <button
          onClick={() => navigate('/instruments/new')}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          New Instrument
        </button>
      </div>

      {instruments.length === 0 ? (
        <p className="text-gray-500">No instruments yet.</p>
      ) : (
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-gray-500">
              <th className="py-2 font-medium">Name</th>
              <th className="py-2 font-medium">Lasers</th>
              <th className="py-2 font-medium">Detectors</th>
              <th className="w-16 py-2" />
            </tr>
          </thead>
          <tbody>
            {instruments.map((inst) => {
              const totalDetectors = inst.lasers.reduce(
                (sum, l) => sum + l.detectors.length,
                0
              )
              return (
                <HoverActionsRow
                  key={inst.id}
                  as="tr"
                  onClick={() => navigate('/instruments/' + inst.id)}
                  className="border-b border-gray-100 hover:bg-gray-50"
                  actions={{
                    onRename: () => {
                      setEditingInstrument({ id: inst.id, name: inst.name })
                      setRenameValue(inst.name)
                    },
                    // TODO: wire onDuplicate after backend POST /{id}/duplicate endpoints are built
                    onDuplicate: undefined,
                    onDelete: () => handleDelete(inst.id, inst.name),
                  }}
                >
                  <td className="py-3 font-medium text-gray-900">{inst.name}</td>
                  <td className="py-3 text-gray-600">{inst.lasers.length}</td>
                  <td className="py-3 text-gray-600">{totalDetectors}</td>
                </HoverActionsRow>
              )
            })}
          </tbody>
        </table>
      )}

      <Modal
        isOpen={!!editingInstrument}
        onClose={() => {
          setEditingInstrument(null)
          setRenameValue('')
        }}
        title="Rename Instrument"
      >
        <div className="space-y-4">
          <div>
            <label htmlFor="rename-instrument" className="mb-1 block text-sm font-medium text-gray-700">
              Instrument Name
            </label>
            <input
              id="rename-instrument"
              type="text"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRename()
              }}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              autoFocus
            />
          </div>
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => {
                setEditingInstrument(null)
                setRenameValue('')
              }}
              className="rounded border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
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
