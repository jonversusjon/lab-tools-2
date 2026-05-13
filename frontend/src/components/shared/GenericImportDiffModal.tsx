import { useMemo, useState } from 'react'
import Modal from '@/components/layout/Modal'
import FluorophoreSearch from '@/components/shared/FluorophoreSearch'
import { useFluorophores } from '@/hooks/useFluorophores'
import {
  commitImport,
  type ExportResource,
  type ImportPreviewResponse,
} from '@/api/exportImport'

export type FieldDef =
  | { key: string; label: string; type: 'text'; placeholder?: string }
  | { key: string; label: string; type: 'number' }
  | { key: string; label: string; type: 'textarea'; rows?: number }
  | { key: string; label: string; type: 'checkbox' }
  | { key: string; label: string; type: 'select'; options: { value: string; label: string }[] }
  | { key: string; label: string; type: 'fluorophore' }

export type RawRecord = Record<string, unknown>

type Resolution = 'left' | 'right' | null

interface Props {
  isOpen: boolean
  preview: ImportPreviewResponse<RawRecord> | null
  resource: ExportResource
  title: string
  schema: FieldDef[]
  labelFor: (r: RawRecord) => string
  onClose: () => void
  onCompleted: (result: { imported: number }) => void
}

const inputClass =
  'w-full rounded border border-border-strong bg-elevated px-2 py-1.5 text-sm text-foreground focus:border-blue-500 focus:outline-none'

function highlightClass(key: string, highlight: Set<string>): string {
  return highlight.has(key)
    ? 'rounded ring-2 ring-amber-400 dark:ring-amber-500 ring-offset-1 dark:ring-offset-gray-800' // theme-exempt: ring-offset color has no theme token
    : ''
}

interface FieldsProps {
  values: RawRecord
  schema: FieldDef[]
  onChange: (patch: RawRecord) => void
  highlight: Set<string>
  fluorophores: { id: string; name: string }[]
  idPrefix: string
}

function GenericFields({ values, schema, onChange, highlight, fluorophores, idPrefix }: FieldsProps) {
  return (
    <div className="space-y-3">
      {schema.map((f) => {
        const id = idPrefix + '-' + f.key
        const raw = values[f.key]
        if (f.type === 'fluorophore') {
          const fluorId = typeof raw === 'string' && raw.length > 0 ? raw : null
          const name = fluorId ? (fluorophores.find((fl) => fl.id === fluorId)?.name ?? fluorId) : ''
          return (
            <div key={f.key} className={highlightClass(f.key, highlight)}>
              <label className="mb-1 block text-xs font-medium text-foreground">
                {f.label}
              </label>
              <FluorophoreSearch
                fluorophores={fluorophores as never}
                selectedId={fluorId}
                selectedName={name}
                onSelect={(fid) => onChange({ [f.key]: fid })}
                onClear={() => onChange({ [f.key]: null })}
              />
            </div>
          )
        }
        if (f.type === 'checkbox') {
          return (
            <label
              key={f.key}
              className={
                'flex items-center gap-2 text-sm text-foreground ' +
                (highlight.has(f.key) ? 'px-1 ring-2 ring-amber-400 rounded' : '')
              }
            >
              <input
                type="checkbox"
                id={id}
                checked={Boolean(raw)}
                onChange={(e) => onChange({ [f.key]: e.target.checked })}
              />
              {f.label}
            </label>
          )
        }
        if (f.type === 'select') {
          return (
            <div key={f.key} className={highlightClass(f.key, highlight)}>
              <label htmlFor={id} className="mb-1 block text-xs font-medium text-foreground">
                {f.label}
              </label>
              <select
                id={id}
                value={typeof raw === 'string' ? raw : ''}
                onChange={(e) => onChange({ [f.key]: e.target.value || null })}
                className={inputClass}
              >
                <option value="">--</option>
                {f.options.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          )
        }
        if (f.type === 'textarea') {
          return (
            <div key={f.key} className={highlightClass(f.key, highlight)}>
              <label htmlFor={id} className="mb-1 block text-xs font-medium text-foreground">
                {f.label}
              </label>
              <textarea
                id={id}
                value={typeof raw === 'string' ? raw : ''}
                rows={f.rows ?? 2}
                onChange={(e) => onChange({ [f.key]: e.target.value || null })}
                className={inputClass}
              />
            </div>
          )
        }
        if (f.type === 'number') {
          return (
            <div key={f.key} className={highlightClass(f.key, highlight)}>
              <label htmlFor={id} className="mb-1 block text-xs font-medium text-foreground">
                {f.label}
              </label>
              <input
                id={id}
                type="number"
                value={raw === null || raw === undefined || raw === '' ? '' : String(raw)}
                onChange={(e) => {
                  const v = e.target.value
                  onChange({ [f.key]: v === '' ? null : Number(v) })
                }}
                className={inputClass}
              />
            </div>
          )
        }
        // text
        return (
          <div key={f.key} className={highlightClass(f.key, highlight)}>
            <label htmlFor={id} className="mb-1 block text-xs font-medium text-foreground">
              {f.label}
            </label>
            <input
              id={id}
              type="text"
              value={typeof raw === 'string' ? raw : ''}
              placeholder={f.placeholder}
              onChange={(e) => onChange({ [f.key]: e.target.value || null })}
              className={inputClass}
            />
          </div>
        )
      })}
    </div>
  )
}

function recordToValues(r: RawRecord | null, schema: FieldDef[]): RawRecord {
  const out: RawRecord = {}
  for (const f of schema) {
    const v = r?.[f.key]
    if (f.type === 'checkbox') out[f.key] = Boolean(v)
    else if (f.type === 'number') out[f.key] = typeof v === 'number' ? v : v === null || v === undefined || v === '' ? null : Number(v)
    else out[f.key] = typeof v === 'string' ? v : v ?? null
  }
  return out
}

function valuesToRecord(id: string, values: RawRecord, source: RawRecord, schema: FieldDef[]): RawRecord {
  // Build a record preserving fields the form doesn't manage (e.g. schema-only fields we didn't surface).
  const record: RawRecord = { ...source, id }
  for (const f of schema) {
    const v = values[f.key]
    if (f.type === 'text' || f.type === 'textarea') {
      record[f.key] = typeof v === 'string' && v.trim() ? v.trim() : null
    } else if (f.type === 'select' || f.type === 'fluorophore') {
      record[f.key] = typeof v === 'string' && v ? v : null
    } else {
      record[f.key] = v
    }
  }
  return record
}

export default function GenericImportDiffModal({
  isOpen,
  preview,
  resource,
  title,
  schema,
  labelFor,
  onClose,
  onCompleted,
}: Props) {
  const hasFluorophoreField = schema.some((f) => f.type === 'fluorophore')
  const { data: fluorophoresData } = useFluorophores({ limit: 2000 })
  const fluorophores = useMemo(
    () => (hasFluorophoreField ? (fluorophoresData?.items ?? []).map((f) => ({ id: f.id, name: f.name })) : []),
    [fluorophoresData, hasFluorophoreField],
  )

  const [tab, setTab] = useState<'conflicts' | 'new'>('conflicts')
  const [conflictIndex, setConflictIndex] = useState(0)
  const [newIndex, setNewIndex] = useState(0)
  const [resolutions, setResolutions] = useState<Record<string, Resolution>>({})
  const [leftEdits, setLeftEdits] = useState<Record<string, RawRecord>>({})
  const [rightEdits, setRightEdits] = useState<Record<string, RawRecord>>({})
  const [newEdits, setNewEdits] = useState<Record<string, RawRecord>>({})
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState('')

  if (!isOpen || !preview) return null

  const conflicts = preview.conflicts
  const newItems = preview.new_items
  const currentConflict = conflicts[conflictIndex]
  const currentNew = newItems[newIndex]

  const getLeft = (id: string, existing: RawRecord) =>
    leftEdits[id] ?? recordToValues(existing, schema)
  const getRight = (id: string, imported: RawRecord) =>
    rightEdits[id] ?? recordToValues(imported, schema)
  const getNew = (id: string, imp: RawRecord) =>
    newEdits[id] ?? recordToValues(imp, schema)

  const setResolution = (id: string, choice: Resolution) =>
    setResolutions((r) => ({ ...r, [id]: choice }))

  const acceptAllImported = () => {
    const next: Record<string, Resolution> = {}
    for (const c of conflicts) next[c.id] = 'right'
    setResolutions(next)
  }
  const keepAllExisting = () => {
    const next: Record<string, Resolution> = {}
    for (const c of conflicts) next[c.id] = null
    setResolutions(next)
  }

  const handleApply = async () => {
    setError('')
    setApplying(true)
    try {
      const records: RawRecord[] = []
      for (const item of newItems) {
        const id = String(item.id)
        records.push(valuesToRecord(id, getNew(id, item), item, schema))
      }
      for (const c of conflicts) {
        const choice = resolutions[c.id]
        if (choice === 'right') {
          records.push(valuesToRecord(c.id, getRight(c.id, c.imported), c.imported, schema))
        } else if (choice === 'left') {
          records.push(valuesToRecord(c.id, getLeft(c.id, c.existing), c.existing, schema))
        }
      }
      const result = await commitImport(resource, { records })
      onCompleted({ imported: result.imported })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed')
    } finally {
      setApplying(false)
    }
  }

  const unresolvedCount = conflicts.filter((c) => resolutions[c.id] === undefined).length

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="xl">
      <div className="mb-4 rounded border border-blue-200 bg-blue-50 p-3 text-sm dark:border-blue-900 dark:bg-blue-950">
        <div className="font-medium text-blue-900 dark:text-blue-200">Summary</div>
        <ul className="mt-1 ml-4 list-disc text-blue-800 dark:text-blue-300">
          <li>{newItems.length} new item{newItems.length === 1 ? '' : 's'} will be added</li>
          <li>{conflicts.length} conflict{conflicts.length === 1 ? '' : 's'} detected</li>
          {preview.db_only_props.length > 0 && (
            <li>
              {preview.db_only_props.length} DB field{preview.db_only_props.length === 1 ? '' : 's'} missing from import:{' '}
              <span className="font-mono text-xs">{preview.db_only_props.join(', ')}</span>
            </li>
          )}
          {preview.import_only_props.length > 0 && (
            <li>
              {preview.import_only_props.length} import field{preview.import_only_props.length === 1 ? '' : 's'} ignored:{' '}
              <span className="font-mono text-xs">{preview.import_only_props.join(', ')}</span>
            </li>
          )}
        </ul>
      </div>

      <div className="mb-3 flex gap-2 border-b border-border">
        <button
          onClick={() => setTab('conflicts')}
          className={
            'border-b-2 px-4 py-2 text-sm font-medium ' +
            (tab === 'conflicts'
              ? 'border-blue-600 text-blue-700 dark:border-blue-400 dark:text-blue-300'
              : 'border-transparent text-foreground-muted hover:text-foreground')
          }
        >
          Conflicts ({conflicts.length})
        </button>
        <button
          onClick={() => setTab('new')}
          className={
            'border-b-2 px-4 py-2 text-sm font-medium ' +
            (tab === 'new'
              ? 'border-blue-600 text-blue-700 dark:border-blue-400 dark:text-blue-300'
              : 'border-transparent text-foreground-muted hover:text-foreground')
          }
        >
          New Items ({newItems.length})
        </button>
      </div>

      {tab === 'conflicts' && (
        <>
          {conflicts.length === 0 ? (
            <div className="py-8 text-center text-sm text-foreground-muted">
              No conflicts. All matched records are identical to the import.
            </div>
          ) : currentConflict ? (
            <>
              <div className="mb-3 flex items-center justify-between">
                <div className="text-sm text-foreground">
                  <span className="font-medium">
                    Item {conflictIndex + 1} of {conflicts.length}:
                  </span>{' '}
                  {labelFor(currentConflict.imported)}
                  {resolutions[currentConflict.id] && (
                    <span className="ml-2 rounded bg-green-100 px-1.5 py-0.5 text-xs text-green-800 dark:bg-green-900 dark:text-green-300">
                      {resolutions[currentConflict.id] === 'right' ? 'Imported chosen' : 'Existing chosen'}
                    </span>
                  )}
                  {resolutions[currentConflict.id] === null && (
                    <span className="ml-2 rounded bg-surface px-1.5 py-0.5 text-xs text-foreground">
                      Keep existing (skip)
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setConflictIndex((i) => Math.max(0, i - 1))}
                    disabled={conflictIndex === 0}
                    className="rounded border border-border-strong px-2 py-1 text-xs disabled:opacity-40"
                  >
                    ← Prev
                  </button>
                  <button
                    onClick={() => setConflictIndex((i) => Math.min(conflicts.length - 1, i + 1))}
                    disabled={conflictIndex >= conflicts.length - 1}
                    className="rounded border border-border-strong px-2 py-1 text-xs disabled:opacity-40"
                  >
                    Next →
                  </button>
                </div>
              </div>

              <div className="mb-2 text-xs text-foreground-muted">
                Differing fields: {currentConflict.diff_fields.join(', ')}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="rounded border border-border bg-surface p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">
                      Existing (your DB)
                    </span>
                    <button
                      onClick={() => setResolution(currentConflict.id, 'left')}
                      className={
                        'rounded px-2 py-1 text-xs font-medium ' +
                        (resolutions[currentConflict.id] === 'left'
                          ? 'bg-accent text-accent-foreground'
                          : 'border border-border-strong text-foreground hover:bg-hover')
                      }
                    >
                      Keep this version
                    </button>
                  </div>
                  <GenericFields
                    values={getLeft(currentConflict.id, currentConflict.existing)}
                    schema={schema}
                    onChange={(patch) =>
                      setLeftEdits((m) => ({
                        ...m,
                        [currentConflict.id]: { ...getLeft(currentConflict.id, currentConflict.existing), ...patch },
                      }))
                    }
                    highlight={new Set(currentConflict.diff_fields)}
                    fluorophores={fluorophores}
                    idPrefix={'diff-l-' + currentConflict.id}
                  />
                </div>
                <div className="rounded border border-amber-200 bg-amber-50/50 p-3 dark:border-amber-900 dark:bg-amber-950/30">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">
                      Imported (from file)
                    </span>
                    <button
                      onClick={() => setResolution(currentConflict.id, 'right')}
                      className={
                        'rounded px-2 py-1 text-xs font-medium ' +
                        (resolutions[currentConflict.id] === 'right'
                          ? 'bg-accent text-accent-foreground'
                          : 'border border-border-strong text-foreground hover:bg-hover')
                      }
                    >
                      Use this version
                    </button>
                  </div>
                  <GenericFields
                    values={getRight(currentConflict.id, currentConflict.imported)}
                    schema={schema}
                    onChange={(patch) =>
                      setRightEdits((m) => ({
                        ...m,
                        [currentConflict.id]: { ...getRight(currentConflict.id, currentConflict.imported), ...patch },
                      }))
                    }
                    highlight={new Set(currentConflict.diff_fields)}
                    fluorophores={fluorophores}
                    idPrefix={'diff-r-' + currentConflict.id}
                  />
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-3">
                <button
                  onClick={acceptAllImported}
                  className="rounded bg-accent hover:bg-accent-hover text-accent-foreground px-3 py-1.5 text-xs font-medium"
                >
                  Accept all imported
                </button>
                <button
                  onClick={keepAllExisting}
                  className="rounded border border-border-strong px-3 py-1.5 text-xs font-medium text-foreground hover:bg-hover"
                >
                  Keep all existing
                </button>
                {unresolvedCount > 0 && (
                  <span className="ml-auto self-center text-xs text-amber-700 dark:text-amber-300">
                    {unresolvedCount} unresolved — unresolved conflicts keep the existing row.
                  </span>
                )}
              </div>
            </>
          ) : null}
        </>
      )}

      {tab === 'new' && (
        <>
          {newItems.length === 0 ? (
            <div className="py-8 text-center text-sm text-foreground-muted">
              No new items.
            </div>
          ) : currentNew ? (
            <>
              <div className="mb-3 flex items-center justify-between">
                <div className="text-sm text-foreground">
                  <span className="font-medium">
                    Item {newIndex + 1} of {newItems.length}:
                  </span>{' '}
                  {labelFor(currentNew)}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setNewIndex((i) => Math.max(0, i - 1))}
                    disabled={newIndex === 0}
                    className="rounded border border-border-strong px-2 py-1 text-xs disabled:opacity-40"
                  >
                    ← Prev
                  </button>
                  <button
                    onClick={() => setNewIndex((i) => Math.min(newItems.length - 1, i + 1))}
                    disabled={newIndex >= newItems.length - 1}
                    className="rounded border border-border-strong px-2 py-1 text-xs disabled:opacity-40"
                  >
                    Next →
                  </button>
                </div>
              </div>
              <div className="rounded border border-border p-3">
                <GenericFields
                  values={getNew(String(currentNew.id), currentNew)}
                  schema={schema}
                  onChange={(patch) =>
                    setNewEdits((m) => ({
                      ...m,
                      [String(currentNew.id)]: {
                        ...getNew(String(currentNew.id), currentNew),
                        ...patch,
                      },
                    }))
                  }
                  highlight={new Set(preview.db_only_props)}
                  fluorophores={fluorophores}
                  idPrefix={'new-' + String(currentNew.id)}
                />
              </div>
              {preview.db_only_props.length > 0 && (
                <p className="mt-2 text-xs text-foreground-muted">
                  Fields highlighted in amber are present in your database but missing from the import file.
                </p>
              )}
            </>
          ) : null}
        </>
      )}

      {error && (
        <div className="mt-3 rounded border border-red-300 bg-red-50 p-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          {error}
        </div>
      )}

      <div className="mt-5 flex justify-end gap-2 border-t border-border pt-4">
        <button
          onClick={onClose}
          disabled={applying}
          className="rounded border border-border-strong px-4 py-2 text-sm text-foreground hover:bg-hover disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          onClick={handleApply}
          disabled={applying}
          className="rounded bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50" // theme-exempt: semantic apply action (green bg + white text); no success-foreground token
        >
          {applying ? 'Applying...' : 'Apply'}
        </button>
      </div>
    </Modal>
  )
}
