import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useInstruments, useUpdateInstrument, useDeleteInstrument, useImportInstrument } from '@/hooks/useInstruments'
import { exportInstrument } from '@/api/instruments'
import Modal from '@/components/layout/Modal'
import HoverActionsRow from '@/components/layout/HoverActionsRow'
import type { InstrumentCreate } from '@/types'

export default function InstrumentList() {
  const { data, isLoading, error } = useInstruments()
  const updateMutation = useUpdateInstrument()
  const deleteMutation = useDeleteInstrument()
  const importMutation = useImportInstrument()
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [editingInstrument, setEditingInstrument] = useState<{id: string, name: string} | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [importError, setImportError] = useState<string | null>(null)

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

  const handleExport = async (id: string, name: string) => {
    try {
      const data = await exportInstrument(id)
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = name.replace(/[^a-zA-Z0-9_\- ]/g, '').replace(/\s+/g, '_') + '.json'
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      alert('Failed to export instrument.')
    }
  }

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    setImportError(null)
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target?.result as string) as InstrumentCreate
        if (!parsed.name || !Array.isArray(parsed.lasers)) {
          setImportError('Invalid instrument file: missing name or lasers array.')
          return
        }
        importMutation.mutate(parsed, {
          onError: () => setImportError('Failed to import instrument.'),
        })
      } catch {
        setImportError('Invalid JSON file.')
      }
    }
    reader.readAsText(file)
    // Reset input so same file can be re-imported
    e.target.value = ''
  }

  if (isLoading) return <p className="text-gray-500 dark:text-gray-400">Loading instruments...</p>
  if (error) return <p className="text-red-600">Failed to load instruments.</p>

  const instruments = data?.items ?? []

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold dark:text-gray-100">Instruments</h1>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleImportFile}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={importMutation.isPending}
            className="rounded border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
          >
            {importMutation.isPending ? 'Importing...' : 'Import'}
          </button>
          <button
            onClick={() => navigate('/flow/instruments/new')}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            New Instrument
          </button>
        </div>
      </div>
      {importError && (
        <div className="mb-4 rounded border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/30 px-4 py-2 text-sm text-red-700 dark:text-red-400">
          {importError}
        </div>
      )}

      {instruments.length === 0 ? (
        <p className="text-gray-500 dark:text-gray-400">No instruments yet.</p>
      ) : (
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400">
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
                  onClick={() => navigate('/flow/instruments/' + inst.id)}
                  className="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"
                  actions={{
                    onRename: () => {
                      setEditingInstrument({ id: inst.id, name: inst.name })
                      setRenameValue(inst.name)
                    },
                    onDuplicate: undefined,
                    onDelete: () => handleDelete(inst.id, inst.name),
                    extraActions: (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleExport(inst.id, inst.name)
                        }}
                        className="p-1.5 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                        aria-label="Export"
                        title="Export"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                      </button>
                    ),
                  }}
                >
                  <td className="py-3 font-medium text-gray-900 dark:text-gray-100">{inst.name}</td>
                  <td className="py-3 text-gray-600 dark:text-gray-400">{inst.lasers.length}</td>
                  <td className="py-3 text-gray-600 dark:text-gray-400">{totalDetectors}</td>
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
            <label htmlFor="rename-instrument" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
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
              className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm dark:text-gray-100 focus:border-blue-500 focus:outline-none"
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
