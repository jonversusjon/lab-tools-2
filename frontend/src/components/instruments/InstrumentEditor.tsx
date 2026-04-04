import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  useInstrument,
  useCreateInstrument,
  useUpdateInstrument,
  useDeleteInstrument,
} from '@/hooks/useInstruments'
import { exportInstrument } from '@/api/instruments'
import LaserSection from './LaserSection'
import ListEditor from '@/components/shared/ListEditor'
import type { LaserFormData } from './LaserSection'

interface InstrumentFormState {
  name: string
  location: string
  lasers: LaserFormData[]
}

const emptyState: InstrumentFormState = {
  name: '',
  location: '',
  lasers: [],
}

const DEBOUNCE_MS = 1500

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

function buildPayload(form: InstrumentFormState) {
  return {
    name: form.name,
    location: form.location.trim() || null,
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
}

/** Fire-and-forget PUT via fetch with keepalive — survives page unload. */
function flushSave(instrumentId: string, form: InstrumentFormState) {
  if (!form.name.trim()) return
  const payload = buildPayload(form)
  fetch('/api/v1/instruments/' + instrumentId, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    keepalive: true,
  })
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
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [initialized, setInitialized] = useState(false)

  // Track whether user has made edits (skip autosave on initial load)
  const userEdited = useRef(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // For new instruments: track the created ID so we avoid double-create
  const creatingRef = useRef(false)
  // Refs for unmount/beforeunload flush — always hold latest values
  const formRef = useRef(form)
  formRef.current = form
  const dirtyRef = useRef(false)
  const idRef = useRef(id)
  idRef.current = id
  // Track if we're intentionally leaving (delete)
  const intentionalLeaveRef = useRef(false)

  useEffect(() => {
    if (existing && !initialized) {
      setForm({
        name: existing.name,
        location: existing.location ?? '',
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

  const doSave = useCallback(
    async (current: InstrumentFormState) => {
      if (!current.name.trim()) return

      setError(null)
      setSaveStatus('saving')
      const payload = buildPayload(current)

      try {
        if (isNew) {
          if (creatingRef.current) return
          creatingRef.current = true
          const created = await createMutation.mutateAsync(payload)
          setSaveStatus('saved')
          dirtyRef.current = false
          navigate('/flow/instruments/' + created.id, { replace: true })
        } else {
          await updateMutation.mutateAsync({ id: id!, data: payload })
          setSaveStatus('saved')
          dirtyRef.current = false
        }
      } catch (err) {
        creatingRef.current = false
        setSaveStatus('error')
        if (err instanceof Error) {
          setError(err.message)
        } else {
          setError('Failed to save instrument.')
        }
      }
    },
    [isNew, id, createMutation, updateMutation, navigate],
  )

  // Debounced autosave whenever form changes after user edits
  useEffect(() => {
    if (!userEdited.current) return

    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      doSave(form)
    }, DEBOUNCE_MS)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [form, doSave])

  // Flush pending save on unmount — fire keepalive fetch for existing instruments
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      if (intentionalLeaveRef.current) return
      if (dirtyRef.current && idRef.current) {
        flushSave(idRef.current, formRef.current)
      }
    }
  }, [])

  // Guard browser close / refresh with native beforeunload when dirty
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current) {
        e.preventDefault()
      }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [])

  if (!isNew && isLoading) {
    return <p className="text-gray-500 dark:text-gray-400">Loading...</p>
  }

  // Wrap setForm to mark user edits and dirty state
  const updateForm = (next: InstrumentFormState) => {
    userEdited.current = true
    dirtyRef.current = true
    setSaveStatus('idle')
    setForm(next)
  }

  const updateLaser = (index: number, updated: LaserFormData) => {
    const lasers = [...form.lasers]
    lasers[index] = updated
    updateForm({ ...form, lasers })
  }

  const removeLaser = (index: number) => {
    updateForm({ ...form, lasers: form.lasers.filter((_, i) => i !== index) })
  }

  const addLaser = () => {
    updateForm({
      ...form,
      lasers: [
        ...form.lasers,
        { wavelength_nm: 0, name: '', detectors: [] },
      ],
    })
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
      // Cancel any pending autosave and skip unmount flush
      if (debounceRef.current) clearTimeout(debounceRef.current)
      dirtyRef.current = false
      intentionalLeaveRef.current = true
      await deleteMutation.mutateAsync(id!)
      navigate('/flow/instruments')
    } catch (err) {
      intentionalLeaveRef.current = false
      if (err instanceof Error) {
        setError(err.message)
      }
    }
  }

  return (
    <div className="max-w-3xl">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold dark:text-gray-100">
            {isNew ? 'New Instrument' : 'Edit Instrument'}
          </h1>
          {saveStatus === 'saving' && (
            <span className="text-xs text-gray-400 dark:text-gray-500">Saving...</span>
          )}
          {saveStatus === 'saved' && (
            <span className="text-xs text-green-600 dark:text-green-400">Saved</span>
          )}
          {saveStatus === 'error' && (
            <span className="text-xs text-red-500">Save failed</span>
          )}
        </div>
        <button
          onClick={() => navigate('/flow/instruments')}
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
          onChange={(e) => updateForm({ ...form, name: e.target.value })}
          placeholder="e.g. BD FACSAria III"
          className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm dark:text-gray-100"
        />
      </div>

      <div className="mb-6">
        <ListEditor
          listType="instrument_location"
          label="Location"
          value={form.location}
          onChange={(val) => updateForm({ ...form, location: val })}
          placeholder="Select location..."
          selectOnly
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

      {!isNew && (
        <div className="flex items-center gap-3 border-t border-gray-200 dark:border-gray-700 pt-4">
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
        </div>
      )}
    </div>
  )
}
