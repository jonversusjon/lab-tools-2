import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  useMicroscope,
  useCreateMicroscope,
  useUpdateMicroscope,
  useDeleteMicroscope,
} from '@/hooks/useMicroscopes'
import { exportMicroscope } from '@/api/microscopes'
import MicroscopeLaserSection from './MicroscopeLaserSection'
import LocationInput from '@/components/shared/LocationInput'
import type { MicroscopeLaserFormData } from './MicroscopeLaserSection'

interface MicroscopeFormState {
  name: string
  location: string
  lasers: MicroscopeLaserFormData[]
}

const emptyState: MicroscopeFormState = {
  name: '',
  location: '',
  lasers: [],
}

const DEBOUNCE_MS = 1500

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

function buildPayload(form: MicroscopeFormState) {
  return {
    name: form.name,
    location: form.location.trim() || null,
    lasers: form.lasers.map((l) => ({
      wavelength_nm: l.wavelength_nm,
      name: l.name,
      excitation_type: l.excitation_type,
      ex_filter_width: l.ex_filter_width ?? null,
      filters: l.filters.map((f) => ({
        filter_midpoint: f.filter_midpoint,
        filter_width: f.filter_width,
        name: f.name || null,
      })),
    })),
  }
}

/** Fire-and-forget PUT via fetch with keepalive — survives page unload. */
function flushSave(microscopeId: string, form: MicroscopeFormState) {
  if (!form.name.trim()) return
  const payload = buildPayload(form)
  fetch('/api/v1/microscopes/' + microscopeId, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch((err) => console.error('Auto-save failed:', err))
}

export default function MicroscopeEditor() {
  const { id } = useParams<{ id: string }>()
  const isNew = !id
  const navigate = useNavigate()
  const { data: existing, isLoading } = useMicroscope(id ?? '')
  const createMutation = useCreateMicroscope()
  const updateMutation = useUpdateMicroscope()
  const deleteMutation = useDeleteMicroscope()

  const [form, setForm] = useState<MicroscopeFormState>(emptyState)
  const [error, setError] = useState<string | null>(null)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [initialized, setInitialized] = useState(false)

  // Track whether user has made edits (skip autosave on initial load)
  const userEdited = useRef(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // For new microscopes: track the created ID so we avoid double-create
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
          excitation_type: (l.excitation_type as 'laser' | 'arc') ?? 'laser',
          ex_filter_width: l.ex_filter_width ?? null,
          filters: l.filters.map((f) => ({
            filter_midpoint: f.filter_midpoint,
            filter_width: f.filter_width,
            name: f.name ?? '',
          })),
        })),
      })
      setInitialized(true)
    }
  }, [existing, initialized])

  const doSave = useCallback(
    async (current: MicroscopeFormState) => {
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
          navigate('/if-ihc/microscopes/' + created.id, { replace: true })
        } else {
          await updateMutation.mutateAsync({ id: id!, data: payload })
          setSaveStatus('saved')
          dirtyRef.current = false
          userEdited.current = false
        }
      } catch (err) {
        creatingRef.current = false
        setSaveStatus('error')
        if (err instanceof Error) {
          setError(err.message)
        } else {
          setError('Failed to save microscope.')
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

  // Flush pending save on unmount — fire keepalive fetch for existing microscopes
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
    return <p className="text-foreground-muted">Loading...</p>
  }

  // Wrap setForm to mark user edits and dirty state
  const updateForm = (next: MicroscopeFormState) => {
    userEdited.current = true
    dirtyRef.current = true
    setSaveStatus('idle')
    setForm(next)
  }

  const updateLaser = (index: number, updated: MicroscopeLaserFormData) => {
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
        { wavelength_nm: 0, name: '', excitation_type: 'laser', ex_filter_width: null, filters: [] },
      ],
    })
  }

  const handleExport = async () => {
    try {
      const data = await exportMicroscope(id!)
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = form.name.replace(/[^a-zA-Z0-9_\- ]/g, '').replace(/\s+/g, '_') + '.json'
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      setError('Failed to export microscope.')
    }
  }

  const handleDelete = async () => {
    if (
      !window.confirm(
        'Deleting this microscope will remove it from any IF panels using it. ' +
          'Those panels will need a new microscope selected. Continue?'
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
      navigate('/if-ihc/microscopes')
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
          <h1 className="text-2xl font-bold text-foreground">
            {isNew ? 'New Microscope' : 'Edit Microscope'}
          </h1>
          {saveStatus === 'saving' && (
            <span className="text-xs text-foreground-subtle">Saving...</span>
          )}
          {saveStatus === 'saved' && (
            <span className="text-xs text-success">Saved</span>
          )}
          {saveStatus === 'error' && (
            <span className="text-xs text-danger">Save failed</span>
          )}
        </div>
        <button
          onClick={() => navigate('/if-ihc/microscopes')}
          className="text-sm text-foreground-muted hover:text-foreground"
        >
          Back to list
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded border border-danger bg-danger-soft px-4 py-2 text-sm text-danger-soft-foreground">
          {error}
        </div>
      )}

      <div className="mb-6">
        <label className="mb-1 block text-sm font-medium text-foreground-muted">
          Microscope Name
        </label>
        <input
          type="text"
          value={form.name}
          onChange={(e) => updateForm({ ...form, name: e.target.value })}
          placeholder="e.g. Leica SP8 Confocal"
          className="w-full rounded border border-border-strong bg-elevated text-foreground px-3 py-2 text-sm"
        />
      </div>

      <div className="mb-6">
        <label className="mb-1 block text-sm font-medium text-foreground-muted">
          Location
        </label>
        <LocationInput
          value={form.location}
          onChange={(val) => updateForm({ ...form, location: val })}
          placeholder="Select or add location..."
        />
      </div>

      <div className="mb-4">
        <h2 className="mb-2 text-lg font-semibold text-foreground">Excitation Sources</h2>
        <div className="space-y-3">
          {form.lasers.map((laser, i) => (
            <MicroscopeLaserSection
              key={i}
              laser={laser}
              onChange={(updated) => updateLaser(i, updated)}
              onRemove={() => removeLaser(i)}
            />
          ))}
        </div>
        <button
          onClick={addLaser}
          className="mt-3 text-sm font-medium text-accent hover:opacity-80"
        >
          + Add Excitation Source
        </button>
      </div>

      {!isNew && (
        <div className="flex items-center gap-3 border-t border-border pt-4">
          <button
            onClick={handleExport}
            className="rounded border border-border-strong px-4 py-2 text-sm font-medium text-foreground-muted hover:bg-hover"
          >
            Export JSON
          </button>
          <button
            onClick={handleDelete}
            disabled={deleteMutation.isPending}
            className="rounded border border-danger px-4 py-2 text-sm font-medium text-danger hover:bg-danger-soft"
          >
            Delete Microscope
          </button>
        </div>
      )}
    </div>
  )
}
