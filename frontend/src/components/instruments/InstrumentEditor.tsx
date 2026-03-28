import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  useInstrument,
  useCreateInstrument,
  useUpdateInstrument,
  useDeleteInstrument,
} from '@/hooks/useInstruments'
import { exportInstrument } from '@/api/instruments'
import LaserSection from './LaserSection'
import type { LaserFormData } from './LaserSection'

interface InstrumentFormState {
  name: string
  lasers: LaserFormData[]
}

const emptyState: InstrumentFormState = {
  name: '',
  lasers: [],
}

export default function InstrumentEditor() {
  const { id } = useParams<{ id: string }>()
  const isNew = !id
  const navigate = useNavigate()
  const { data: existing, isLoading } = useInstrument(id ?? '')
  const createMutation = useCreateInstrument()
  const updateMutation = useUpdateInstrument()
  const deleteMutation = useDeleteInstrument()

  const [form, setForm] = useState<InstrumentFormState>(emptyState)
  const [error, setError] = useState<string | null>(null)
  const [initialized, setInitialized] = useState(false)

  useEffect(() => {
    if (existing && !initialized) {
      setForm({
        name: existing.name,
        lasers: existing.lasers.map((l) => ({
          wavelength_nm: l.wavelength_nm,
          name: l.name,
          detectors: l.detectors.map((d) => ({
            filter_midpoint: d.filter_midpoint,
            filter_width: d.filter_width,
            name: d.name ?? '',
          })),
        })),
      })
      setInitialized(true)
    }
  }, [existing, initialized])

  if (!isNew && isLoading) {
    return <p className="text-gray-500 dark:text-gray-400">Loading...</p>
  }

  const updateLaser = (index: number, updated: LaserFormData) => {
    const lasers = [...form.lasers]
    lasers[index] = updated
    setForm({ ...form, lasers })
  }

  const removeLaser = (index: number) => {
    setForm({ ...form, lasers: form.lasers.filter((_, i) => i !== index) })
  }

  const addLaser = () => {
    setForm({
      ...form,
      lasers: [
        ...form.lasers,
        { wavelength_nm: 0, name: '', detectors: [] },
      ],
    })
  }

  const handleSave = async () => {
    setError(null)
    const payload = {
      name: form.name,
      lasers: form.lasers.map((l) => ({
        wavelength_nm: l.wavelength_nm,
        name: l.name,
        detectors: l.detectors.map((d) => ({
          filter_midpoint: d.filter_midpoint,
          filter_width: d.filter_width,
          name: d.name || null,
        })),
      })),
    }

    try {
      if (isNew) {
        await createMutation.mutateAsync(payload)
      } else {
        await updateMutation.mutateAsync({ id: id!, data: payload })
      }
      navigate('/instruments')
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message)
      } else {
        setError('Failed to save instrument.')
      }
    }
  }

  const handleExport = async () => {
    try {
      const data = await exportInstrument(id!)
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = form.name.replace(/[^a-zA-Z0-9_\- ]/g, '').replace(/\s+/g, '_') + '.json'
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      setError('Failed to export instrument.')
    }
  }

  const handleDelete = async () => {
    if (
      !window.confirm(
        'Deleting this instrument will remove it from any panels using it. ' +
          'Those panels will need a new instrument selected. Continue?'
      )
    ) {
      return
    }
    try {
      await deleteMutation.mutateAsync(id!)
      navigate('/instruments')
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message)
      }
    }
  }

  const isSaving = createMutation.isPending || updateMutation.isPending

  return (
    <div className="max-w-3xl">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold dark:text-gray-100">
          {isNew ? 'New Instrument' : 'Edit Instrument'}
        </h1>
        <button
          onClick={() => navigate('/instruments')}
          className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
        >
          Back to list
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/30 px-4 py-2 text-sm text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      <div className="mb-6">
        <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
          Instrument Name
        </label>
        <input
          type="text"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="e.g. BD FACSAria III"
          className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm dark:text-gray-100"
        />
      </div>

      <div className="mb-4">
        <h2 className="mb-2 text-lg font-semibold text-gray-800 dark:text-gray-200">Lasers</h2>
        <div className="space-y-3">
          {form.lasers.map((laser, i) => (
            <LaserSection
              key={i}
              laser={laser}
              onChange={(updated) => updateLaser(i, updated)}
              onRemove={() => removeLaser(i)}
            />
          ))}
        </div>
        <button
          onClick={addLaser}
          className="mt-3 text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300"
        >
          + Add Laser
        </button>
      </div>

      <div className="flex items-center gap-3 border-t border-gray-200 dark:border-gray-700 pt-4">
        <button
          onClick={handleSave}
          disabled={isSaving || !form.name.trim()}
          className="rounded bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {isSaving ? 'Saving...' : 'Save'}
        </button>
        {!isNew && (
          <>
            <button
              onClick={handleExport}
              className="rounded border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Export JSON
            </button>
            <button
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
              className="rounded border border-red-300 dark:border-red-700 px-4 py-2 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30"
            >
              Delete Instrument
            </button>
          </>
        )}
      </div>
    </div>
  )
}
