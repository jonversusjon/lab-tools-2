import { useState, useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { getPreferences, updatePreference } from '@/api/preferences'
import {
  downloadExport,
  uploadImport,
  previewImport,
  readImportFile,
  type ExportResource,
  type ImportPreviewResponse,
} from '@/api/exportImport'
import AntibodyImportDiffModal from '@/components/antibodies/AntibodyImportDiffModal'
import GenericImportDiffModal from '@/components/shared/GenericImportDiffModal'
import NestedImportDiffModal, {
  type NestedPreviewExtra,
} from '@/components/shared/NestedImportDiffModal'
import {
  SECONDARIES_SCHEMA,
  LIST_ENTRIES_SCHEMA,
  CHEMISTRIES_SCHEMA,
  DYE_LABELS_SCHEMA,
  PLATE_MAPS_SCHEMA,
  labelSecondary,
  labelListEntry,
  labelChemistry,
  labelDyeLabel,
  labelPlateMap,
  labelExperiment,
} from '@/components/shared/importSchemas'
import {
  useConjugateChemistries,
  useCreateConjugateChemistry,
  useUpdateConjugateChemistry,
  useDeleteConjugateChemistry,
} from '@/hooks/useConjugateChemistries'
import type { ConjugateChemistry } from '@/types'
import BlockFramesSection from '@/components/settings/BlockFramesSection'

export default function Settings() {
  const [minEx, setMinEx] = useState(5)
  const [minDet, setMinDet] = useState(10)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    getPreferences()
      .then((prefs) => {
        if (prefs.min_excitation_pct) setMinEx(Number(prefs.min_excitation_pct))
        if (prefs.min_detection_pct) setMinDet(Number(prefs.min_detection_pct))
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const handleSave = async () => {
    setSaving(true)
    setMessage('')
    try {
      await updatePreference('min_excitation_pct', String(minEx))
      await updatePreference('min_detection_pct', String(minDet))
      setMessage('Settings saved successfully.')
      setTimeout(() => setMessage(''), 3000)
    } catch (e) {
      console.error(e)
      setMessage('Failed to save settings.')
    } finally {
      setSaving(false)
    }
  }

  // Conjugate chemistry management
  const { data: chemistries = [], isLoading: chemLoading } = useConjugateChemistries()
  const createMut = useCreateConjugateChemistry()
  const updateMut = useUpdateConjugateChemistry()
  const deleteMut = useDeleteConjugateChemistry()

  const [newName, setNewName] = useState('')
  const [newLabel, setNewLabel] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editLabel, setEditLabel] = useState('')
  const [chemMessage, setChemMessage] = useState('')

  const handleAddChemistry = () => {
    const name = newName.trim().toLowerCase()
    const label = newLabel.trim()
    if (!name || !label) return
    createMut.mutate(
      { name, label },
      {
        onSuccess: () => {
          setNewName('')
          setNewLabel('')
          setChemMessage('Added: ' + name)
          setTimeout(() => setChemMessage(''), 3000)
        },
        onError: (err) => {
          setChemMessage(err.message)
          setTimeout(() => setChemMessage(''), 5000)
        },
      },
    )
  }

  const openEdit = (chem: ConjugateChemistry) => {
    setEditingId(chem.id)
    setEditName(chem.name)
    setEditLabel(chem.label)
  }

  const handleSaveEdit = () => {
    if (!editingId) return
    const name = editName.trim().toLowerCase()
    const label = editLabel.trim()
    if (!name || !label) return
    updateMut.mutate(
      { id: editingId, data: { name, label } },
      {
        onSuccess: () => {
          setEditingId(null)
          setChemMessage('Updated successfully')
          setTimeout(() => setChemMessage(''), 3000)
        },
        onError: (err) => {
          setChemMessage(err.message)
          setTimeout(() => setChemMessage(''), 5000)
        },
      },
    )
  }

  const handleDeleteChemistry = (id: string, name: string) => {
    if (!confirm(`Remove "${name}" from conjugate chemistries?`)) return
    deleteMut.mutate(id, {
      onSuccess: () => {
        setChemMessage(`Removed "${name}"`)
        setTimeout(() => setChemMessage(''), 3000)
      },
    })
  }

  // Export / Import state
  const [exportStatus, setExportStatus] = useState<Record<string, string>>({})
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({})

  const RESOURCES: { key: ExportResource; label: string; note?: string }[] = [
    { key: 'antibodies', label: 'Antibodies' },
    { key: 'secondaries', label: 'Secondary Antibodies' },
    { key: 'dye-labels', label: 'Dye Labels' },
    { key: 'instruments', label: 'Instruments' },
    { key: 'microscopes', label: 'Microscopes' },
    { key: 'list-entries', label: 'List Entries' },
    { key: 'conjugate-chemistries', label: 'Conjugate Chemistries' },
    { key: 'flow-panels', label: 'Flow Panels', note: 'Import after Antibodies + Instruments + Dye Labels' },
    { key: 'if-panels', label: 'IF/IHC Panels', note: 'Import after Antibodies + Microscopes + Dye Labels' },
    { key: 'plate-maps', label: 'Plate Maps' },
    { key: 'experiments', label: 'Experiments', note: 'Import after Panels' },
  ]

  const handleExport = async (resource: ExportResource) => {
    setExportStatus((s) => ({ ...s, [resource]: 'exporting' }))
    try {
      await downloadExport(resource)
      setExportStatus((s) => ({ ...s, [resource]: 'ok' }))
      setTimeout(() => setExportStatus((s) => ({ ...s, [resource]: '' })), 2000)
    } catch (err) {
      setExportStatus((s) => ({
        ...s,
        [resource]: err instanceof Error ? err.message : 'Export failed',
      }))
    }
  }

  const queryClient = useQueryClient()

  // Antibody diff-flow state
  const [abPreview, setAbPreview] = useState<ImportPreviewResponse | null>(null)
  const [abTagsPayload, setAbTagsPayload] = useState<unknown[]>([])

  // Generic diff-flow state (for flat resources)
  type GenericDiffConfig = {
    resource: ExportResource
    title: string
    schema: typeof SECONDARIES_SCHEMA
    labelFor: typeof labelSecondary
    invalidateKeys: string[][]
  }
  const GENERIC_CONFIGS: Record<string, GenericDiffConfig> = {
    secondaries: {
      resource: 'secondaries',
      title: 'Import Secondary Antibodies — Review Changes',
      schema: SECONDARIES_SCHEMA,
      labelFor: labelSecondary,
      invalidateKeys: [['secondary-antibodies']],
    },
    'list-entries': {
      resource: 'list-entries',
      title: 'Import List Entries — Review Changes',
      schema: LIST_ENTRIES_SCHEMA,
      labelFor: labelListEntry,
      invalidateKeys: [['list-entries']],
    },
    'conjugate-chemistries': {
      resource: 'conjugate-chemistries',
      title: 'Import Conjugate Chemistries — Review Changes',
      schema: CHEMISTRIES_SCHEMA,
      labelFor: labelChemistry,
      invalidateKeys: [['conjugate-chemistries']],
    },
    'dye-labels': {
      resource: 'dye-labels',
      title: 'Import Dye Labels — Review Changes',
      schema: DYE_LABELS_SCHEMA,
      labelFor: labelDyeLabel,
      invalidateKeys: [['dye-labels']],
    },
    'plate-maps': {
      resource: 'plate-maps',
      title: 'Import Plate Maps — Review Changes',
      schema: PLATE_MAPS_SCHEMA,
      labelFor: labelPlateMap,
      invalidateKeys: [['plate-maps']],
    },
  }
  const [genericPreview, setGenericPreview] = useState<{
    preview: ImportPreviewResponse
    config: GenericDiffConfig
  } | null>(null)

  // Nested diff-flow state (for instruments, microscopes, flow-panels, if-panels)
  type NestedDiffConfig = {
    resource: ExportResource
    title: string
    childKeys: string[]
    labelFor: (r: Record<string, unknown>) => string
    invalidateKeys: string[][]
  }
  const NESTED_CONFIGS: Record<string, NestedDiffConfig> = {
    instruments: {
      resource: 'instruments',
      title: 'Import Instruments — Review Changes',
      childKeys: ['lasers'],
      labelFor: (r) => String(r.name ?? r.id ?? 'Unknown'),
      invalidateKeys: [['instruments']],
    },
    microscopes: {
      resource: 'microscopes',
      title: 'Import Microscopes — Review Changes',
      childKeys: ['lasers'],
      labelFor: (r) => String(r.name ?? r.id ?? 'Unknown'),
      invalidateKeys: [['microscopes']],
    },
    'flow-panels': {
      resource: 'flow-panels',
      title: 'Import Flow Panels — Review Changes',
      childKeys: ['targets', 'assignments'],
      labelFor: (r) => String(r.name ?? r.id ?? 'Unknown'),
      invalidateKeys: [['panels']],
    },
    'if-panels': {
      resource: 'if-panels',
      title: 'Import IF/IHC Panels — Review Changes',
      childKeys: ['targets', 'assignments'],
      labelFor: (r) => String(r.name ?? r.id ?? 'Unknown'),
      invalidateKeys: [['if-panels']],
    },
    experiments: {
      resource: 'experiments',
      title: 'Import Experiments — Review Changes',
      childKeys: ['blocks'],
      labelFor: labelExperiment,
      invalidateKeys: [['experiments']],
    },
  }
  const [nestedPreview, setNestedPreview] = useState<{
    preview: ImportPreviewResponse & NestedPreviewExtra
    config: NestedDiffConfig
  } | null>(null)

  const handleImport = async (resource: ExportResource, file: File) => {
    setExportStatus((s) => ({ ...s, [resource]: 'importing' }))
    const input = fileInputRefs.current[resource]

    try {
      if (resource === 'antibodies') {
        // Diff flow: read file, preview, open modal
        const payload = await readImportFile(file)
        const preview = await previewImport('antibodies', payload)

        if (preview.conflicts.length === 0 && preview.new_items.length === 0) {
          setExportStatus((s) => ({ ...s, [resource]: 'Nothing to import' }))
          setTimeout(() => setExportStatus((s) => ({ ...s, [resource]: '' })), 4000)
        } else {
          setAbTagsPayload((payload.tags as unknown[]) ?? [])
          setAbPreview(preview)
          setExportStatus((s) => ({ ...s, [resource]: '' }))
        }
      } else if (GENERIC_CONFIGS[resource]) {
        const cfg = GENERIC_CONFIGS[resource]
        const payload = await readImportFile(file)
        const preview = await previewImport(cfg.resource, payload)
        if (preview.conflicts.length === 0 && preview.new_items.length === 0) {
          setExportStatus((s) => ({ ...s, [resource]: 'Nothing to import' }))
          setTimeout(() => setExportStatus((s) => ({ ...s, [resource]: '' })), 4000)
        } else {
          setGenericPreview({ preview, config: cfg })
          setExportStatus((s) => ({ ...s, [resource]: '' }))
        }
      } else if (NESTED_CONFIGS[resource]) {
        const cfg = NESTED_CONFIGS[resource]
        const payload = await readImportFile(file)
        const preview = await previewImport(cfg.resource, payload) as ImportPreviewResponse & NestedPreviewExtra
        if (preview.conflicts.length === 0 && preview.new_items.length === 0) {
          setExportStatus((s) => ({ ...s, [resource]: 'Nothing to import' }))
          setTimeout(() => setExportStatus((s) => ({ ...s, [resource]: '' })), 4000)
        } else {
          setNestedPreview({ preview, config: cfg })
          setExportStatus((s) => ({ ...s, [resource]: '' }))
        }
      } else {
        const result = await uploadImport(resource, file)
        setExportStatus((s) => ({
          ...s,
          [resource]: 'Imported ' + result.imported + ' records',
        }))
        setTimeout(() => setExportStatus((s) => ({ ...s, [resource]: '' })), 4000)
      }
    } catch (err) {
      setExportStatus((s) => ({
        ...s,
        [resource]: err instanceof Error ? err.message : 'Import failed',
      }))
    }

    if (input) input.value = ''
  }

  if (loading) {
    return <div className="p-4 py-8 text-center text-foreground-muted">Loading settings...</div>
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <h1 className="mb-6 text-2xl font-bold text-foreground">Settings</h1>

      {/* Fluorophore Thresholds */}
      <div className="space-y-6 rounded-lg border border-border bg-elevated p-6 shadow-sm">
        <div>
          <h2 className="text-lg font-medium text-foreground">
            Fluorophore Visibility Thresholds
          </h2>
          <p className="mt-1 text-sm text-foreground-muted">
            Lower values show more fluorophores per channel. Higher values show only well-matched
            fluorophores.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground-muted">
            Minimum Excitation Efficiency ({minEx}%)
          </label>
          <input
            type="range"
            min="1"
            max="50"
            value={minEx}
            onChange={(e) => setMinEx(Number(e.target.value))}
            className="mt-2 w-full cursor-pointer accent-accent"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground-muted">
            Minimum Detection Efficiency ({minDet}%)
          </label>
          <input
            type="range"
            min="1"
            max="50"
            value={minDet}
            onChange={(e) => setMinDet(Number(e.target.value))}
            className="mt-2 w-full cursor-pointer accent-accent"
          />
        </div>

        <div className="flex items-center space-x-4 pt-4">
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded bg-accent hover:bg-accent-hover text-accent-foreground px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
          {message && (
            <span
              className={`text-sm ${
                message.includes('Failed')
                  ? 'text-danger'
                  : 'text-success'
              }`}
            >
              {message}
            </span>
          )}
        </div>
      </div>

      {/* Conjugate Chemistries */}
      <div className="mt-6 space-y-4 rounded-lg border border-border bg-elevated p-6 shadow-sm">
        <div>
          <h2 className="text-lg font-medium text-foreground">
            Conjugate Chemistries
          </h2>
          <p className="mt-1 text-sm text-foreground-muted">
            Define non-fluorescent conjugation types (e.g. Biotin, DIG) and their binding partner labels.
            These are used by the panel designer to recognize when a primary antibody needs a
            conjugate-targeting secondary reagent (e.g. Streptavidin for Biotin).
          </p>
        </div>

        {/* Add new chemistry */}
        <div className="flex gap-2 items-end border-b border-border pb-4">
          <div className="flex-1">
            <label className="block text-xs font-medium text-foreground-muted mb-1">
              Conjugate Name
            </label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAddChemistry()
              }}
              placeholder="e.g. dnp"
              className="w-full rounded border border-border-strong bg-elevated text-foreground px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div className="flex-[2]">
            <label className="block text-xs font-medium text-foreground-muted mb-1">
              Binding Partner Label
            </label>
            <input
              type="text"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAddChemistry()
              }}
              placeholder="e.g. Anti-DNP"
              className="w-full rounded border border-border-strong bg-elevated text-foreground px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>
          <button
            onClick={handleAddChemistry}
            disabled={!newName.trim() || !newLabel.trim() || createMut.isPending}
            className="rounded bg-accent hover:bg-accent-hover text-accent-foreground px-3 py-1.5 text-sm font-medium disabled:opacity-50"
          >
            Add
          </button>
        </div>

        {/* Chemistry list */}
        {chemLoading ? (
          <div className="py-4 text-center text-sm text-foreground-subtle">Loading...</div>
        ) : chemistries.length === 0 ? (
          <div className="py-4 text-center text-sm text-foreground-subtle">
            No conjugate chemistries defined.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-foreground-muted">
                <th className="py-2">Conjugate</th>
                <th className="py-2">Binding Partner Label</th>
                <th className="py-2 w-28 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {chemistries.map((chem) => (
                <tr
                  key={chem.id}
                  className="border-b border-border group"
                >
                  {editingId === chem.id ? (
                    <>
                      <td className="py-2 pr-2">
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveEdit()
                            if (e.key === 'Escape') setEditingId(null)
                          }}
                          className="w-full rounded border border-border-strong bg-elevated text-foreground px-2 py-1 text-sm focus:border-blue-500 focus:outline-none"
                          autoFocus
                        />
                      </td>
                      <td className="py-2 pr-2">
                        <input
                          type="text"
                          value={editLabel}
                          onChange={(e) => setEditLabel(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveEdit()
                            if (e.key === 'Escape') setEditingId(null)
                          }}
                          className="w-full rounded border border-border-strong bg-elevated text-foreground px-2 py-1 text-sm focus:border-blue-500 focus:outline-none"
                        />
                      </td>
                      <td className="py-2 text-right">
                        <button
                          onClick={handleSaveEdit}
                          disabled={!editName.trim() || !editLabel.trim()}
                          className="text-xs text-success hover:opacity-80 mr-2 disabled:opacity-50"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="text-xs text-foreground-subtle hover:text-foreground-muted"
                        >
                          Cancel
                        </button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="py-2 text-foreground font-medium">
                        {chem.name}
                      </td>
                      <td className="py-2 text-foreground-muted">
                        {chem.label}
                      </td>
                      <td className="py-2 text-right">
                        <button
                          onClick={() => openEdit(chem)}
                          className="invisible text-xs text-foreground-subtle hover:text-accent group-hover:visible mr-2"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDeleteChemistry(chem.id, chem.name)}
                          className="invisible text-xs text-foreground-subtle hover:text-danger group-hover:visible"
                        >
                          Delete
                        </button>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {chemMessage && (
          <p
            className={`text-sm ${
              chemMessage.includes('Removed') || chemMessage.includes('Updated') || chemMessage.includes('Added')
                ? 'text-success'
                : 'text-danger'
            }`}
          >
            {chemMessage}
          </p>
        )}
      </div>

      {/* Export / Import */}
      <div className="mt-6 space-y-4 rounded-lg border border-border bg-elevated p-6 shadow-sm">
        <div>
          <h2 className="text-lg font-medium text-foreground">Export / Import Data</h2>
          <p className="mt-1 text-sm text-foreground-muted">
            Export any resource as JSON to back up your data. Re-import the file after deleting the
            database to restore. For panels, import their dependencies first.
          </p>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-foreground-muted">
              <th className="py-2">Resource</th>
              <th className="py-2 w-24 text-center">Export</th>
              <th className="py-2 w-24 text-center">Import</th>
              <th className="py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {RESOURCES.map(({ key, label, note }) => {
              const status = exportStatus[key] ?? ''
              const isBusy = status === 'exporting' || status === 'importing'
              const isError =
                status !== '' &&
                status !== 'ok' &&
                status !== 'exporting' &&
                status !== 'importing' &&
                !status.startsWith('Imported')
              return (
                <tr key={key} className="border-b border-border">
                  <td className="py-2 text-foreground">
                    {label}
                    {note && (
                      <span className="ml-1.5 text-xs text-foreground-subtle">({note})</span>
                    )}
                  </td>
                  <td className="py-2 text-center">
                    <button
                      onClick={() => handleExport(key)}
                      disabled={isBusy}
                      className="rounded bg-surface px-2.5 py-1 text-xs font-medium text-foreground-muted hover:bg-hover disabled:opacity-50"
                    >
                      {status === 'exporting' ? '...' : 'Download'}
                    </button>
                  </td>
                  <td className="py-2 text-center">
                    <input
                      type="file"
                      accept=".json"
                      className="hidden"
                      ref={(el) => { fileInputRefs.current[key] = el }}
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (file) handleImport(key, file)
                      }}
                    />
                    <button
                      onClick={() => fileInputRefs.current[key]?.click()}
                      disabled={isBusy}
                      className="rounded border border-border-strong px-2.5 py-1 text-xs font-medium text-foreground-muted hover:bg-hover disabled:opacity-50"
                    >
                      {status === 'importing' ? '...' : 'Upload'}
                    </button>
                  </td>
                  <td className="py-2 text-xs">
                    {status === 'ok' && (
                      <span className="text-success">Downloaded</span>
                    )}
                    {status.startsWith('Imported') && (
                      <span className="text-success">{status}</span>
                    )}
                    {isError && (
                      <span className="text-danger">{status}</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <AntibodyImportDiffModal
        isOpen={abPreview !== null}
        preview={abPreview}
        tagsPayload={abTagsPayload}
        onClose={() => {
          setAbPreview(null)
          setAbTagsPayload([])
        }}
        onCompleted={({ imported }) => {
          setAbPreview(null)
          setAbTagsPayload([])
          setExportStatus((s) => ({
            ...s,
            antibodies: 'Imported ' + imported + ' records',
          }))
          setTimeout(
            () => setExportStatus((s) => ({ ...s, antibodies: '' })),
            4000,
          )
          queryClient.invalidateQueries({ queryKey: ['antibodies'] })
          queryClient.invalidateQueries({ queryKey: ['antibodyTags'] })
        }}
      />

      {nestedPreview && (
        <NestedImportDiffModal
          isOpen={true}
          preview={nestedPreview.preview}
          resource={nestedPreview.config.resource}
          title={nestedPreview.config.title}
          childKeys={nestedPreview.config.childKeys}
          labelFor={nestedPreview.config.labelFor}
          onClose={() => setNestedPreview(null)}
          onCompleted={({ imported }) => {
            const cfg = nestedPreview.config
            setNestedPreview(null)
            setExportStatus((s) => ({
              ...s,
              [cfg.resource]: 'Imported ' + imported + ' records',
            }))
            setTimeout(
              () => setExportStatus((s) => ({ ...s, [cfg.resource]: '' })),
              4000,
            )
            for (const key of cfg.invalidateKeys) {
              queryClient.invalidateQueries({ queryKey: key })
            }
          }}
        />
      )}

      {genericPreview && (
        <GenericImportDiffModal
          isOpen={true}
          preview={genericPreview.preview}
          resource={genericPreview.config.resource}
          title={genericPreview.config.title}
          schema={genericPreview.config.schema}
          labelFor={genericPreview.config.labelFor}
          onClose={() => setGenericPreview(null)}
          onCompleted={({ imported }) => {
            const cfg = genericPreview.config
            setGenericPreview(null)
            setExportStatus((s) => ({
              ...s,
              [cfg.resource]: 'Imported ' + imported + ' records',
            }))
            setTimeout(
              () => setExportStatus((s) => ({ ...s, [cfg.resource]: '' })),
              4000,
            )
            for (const key of cfg.invalidateKeys) {
              queryClient.invalidateQueries({ queryKey: key })
            }
          }}
        />
      )}

      <BlockFramesSection />
    </div>
  )
}
