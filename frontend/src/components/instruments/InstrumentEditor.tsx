import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  useInstrument,
  useCreateInstrument,
  useUpdateInstrument,
  useDeleteInstrument,
} from '@/hooks/useInstruments'
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
    return <p className="text-gray-500">Loading...</p>
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
        <h1 className="text-2xl font-bold">
          {isNew ? 'New Instrument' : 'Edit Instrument'}
        </h1>
        <button
          onClick={() => navigate('/instruments')}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          Back to list
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="mb-6">
        <label className="mb-1 block text-sm font-medium text-gray-700">
          Instrument Name
        </label>
        <input
          type="text"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="e.g. BD FACSAria III"
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
        />
      </div>

      <div className="mb-4">
        <h2 className="mb-2 text-lg font-semibold text-gray-800">Lasers</h2>
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
          className="mt-3 text-sm font-medium text-blue-600 hover:text-blue-800"
        >
          + Add Laser
        </button>
      </div>

      <div className="flex items-center gap-3 border-t border-gray-200 pt-4">
        <button
          onClick={handleSave}
          disabled={isSaving || !form.name.trim()}
          className="rounded bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {isSaving ? 'Saving...' : 'Save'}
        </button>
        {!isNew && (
          <button
            onClick={handleDelete}
            disabled={deleteMutation.isPending}
            className="rounded border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
          >
            Delete Instrument
          </button>
        )}
      </div>
    </div>
  )
}
