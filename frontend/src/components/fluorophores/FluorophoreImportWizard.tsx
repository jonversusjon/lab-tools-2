import { useCallback, useState } from 'react'
import Modal from '@/components/layout/Modal'
import { useUploadFluorophoreCsv, useConfirmFluorophoreImport } from '@/hooks/useFluorophores'
import type {
  FluorophoreImportItem,
  FluorophoreImportPreview,
} from '@/types'

interface FluorophoreImportWizardProps {
  onClose: () => void
}

type Step = 'upload' | 'review' | 'done'

function spectraBadge(item: FluorophoreImportItem): string | null {
  if (!item.spectra) return null
  const keys = Object.keys(item.spectra)
  if (keys.length === 0) return null
  return keys.join('+')
}

export default function FluorophoreImportWizard({ onClose }: FluorophoreImportWizardProps) {
  const [step, setStep] = useState<Step>('upload')
  const [preview, setPreview] = useState<FluorophoreImportPreview | null>(null)
  const [items, setItems] = useState<FluorophoreImportItem[]>([])
  const [doneResult, setDoneResult] = useState<{ created: number; skipped: number; errors: string[] } | null>(null)

  const uploadMutation = useUploadFluorophoreCsv()
  const confirmMutation = useConfirmFluorophoreImport()

  const processFile = useCallback(
    (file: File) => {
      uploadMutation.mutate(file, {
        onSuccess: (data) => {
          setPreview(data)
          setItems(data.new_items)
          setStep('review')
        },
      })
    },
    [uploadMutation]
  )

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) processFile(file)
    },
    [processFile]
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      const file = e.dataTransfer.files?.[0]
      if (file) processFile(file)
    },
    [processFile]
  )

  const removeItem = (idx: number) => {
    setItems((prev) => prev.filter((_, i) => i !== idx))
  }

  const updateItem = (
    idx: number,
    field: keyof FluorophoreImportItem,
    value: string | number | null
  ) => {
    setItems((prev) =>
      prev.map((item, i) =>
        i === idx ? { ...item, [field]: value } : item
      )
    )
  }

  const handleConfirm = () => {
    confirmMutation.mutate(items, {
      onSuccess: (result) => {
        setDoneResult(result)
        setStep('done')
      },
    })
  }

  const inputClass =
    'w-full rounded border border-border bg-elevated text-foreground px-2 py-1 text-sm focus:border-blue-500 focus:outline-none'

  return (
    <Modal isOpen onClose={onClose} title="Import Fluorophores" wide>
      <div className="min-h-[400px]">
        {/* Step indicator */}
        <div className="mb-6 flex items-center gap-2 text-xs text-foreground-muted">
          {(['upload', 'review', 'done'] as Step[]).map((s, i) => (
            <span key={s} className="flex items-center gap-1">
              {i > 0 && <span className="mx-1">&rarr;</span>}
              <span
                className={
                  step === s ? 'font-bold text-accent' : ''
                }
              >
                {i + 1}. {s.charAt(0).toUpperCase() + s.slice(1)}
              </span>
            </span>
          ))}
        </div>

        {/* Step 1: Upload */}
        {step === 'upload' && (
          <div
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-border-strong p-12"
          >
            <svg
              className="mb-4 h-12 w-12 text-foreground-subtle"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
              />
            </svg>
            <p className="mb-1 text-foreground-muted">
              Drag &amp; drop a CSV or JSON file here, or click to browse
            </p>
            <p className="mb-4 text-xs text-foreground-subtle">
              CSV: name, ex_max_nm, em_max_nm, fluor_type, qy, ext_coeff &nbsp;|&nbsp;
              JSON: array or {"{"}"fluorophores": [...]{"}"}
            </p>
            <label className="cursor-pointer rounded bg-accent hover:bg-accent-hover text-accent-foreground px-4 py-2 text-sm font-medium">
              Choose File
              <input
                type="file"
                accept=".csv,.json"
                onChange={handleFileChange}
                className="hidden"
              />
            </label>
            {uploadMutation.isPending && (
              <p className="mt-4 text-sm text-foreground-muted">Parsing file...</p>
            )}
            {uploadMutation.isError && (
              <p className="mt-4 text-sm text-red-600">
                {uploadMutation.error?.message ?? 'Failed to parse file. Check the file format.'}
              </p>
            )}
          </div>
        )}

        {/* Step 2: Review */}
        {step === 'review' && preview && (
          <div>
            {/* Summary bar */}
            <div className="mb-4 rounded bg-surface p-3 text-sm">
              <strong>{preview.total_rows}</strong> rows parsed &mdash;{' '}
              <span className="text-success">
                {items.length} new
              </span>
              {preview.duplicates.length > 0 && (
                <>
                  ,{' '}
                  <span className="text-foreground-muted">
                    {preview.duplicates.length} already in database
                  </span>
                </>
              )}
              {preview.parse_errors.length > 0 && (
                <>
                  ,{' '}
                  <span className="text-red-600">
                    {preview.parse_errors.length} errors
                  </span>
                </>
              )}
              {preview.format_detected === 'json' && (
                <span className="ml-2 rounded bg-accent-soft px-2 py-0.5 text-xs text-accent-soft-foreground">
                  JSON
                </span>
              )}
            </div>

            {/* Parse errors */}
            {preview.parse_errors.length > 0 && (
              <details className="mb-3">
                <summary className="cursor-pointer text-sm text-red-600 dark:text-red-400">
                  {preview.parse_errors.length} parse error(s)
                </summary>
                <ul className="mt-1 space-y-1 text-xs text-red-500 pl-4">
                  {preview.parse_errors.map((e) => (
                    <li key={e.row_number}>
                      Row {e.row_number}: {e.error}
                    </li>
                  ))}
                </ul>
              </details>
            )}

            {/* Duplicates */}
            {preview.duplicates.length > 0 && (
              <details className="mb-3">
                <summary className="cursor-pointer text-sm text-foreground-muted">
                  {preview.duplicates.length} duplicate(s) — already in database, will be skipped
                </summary>
                <ul className="mt-1 space-y-1 text-xs text-foreground-subtle pl-4">
                  {preview.duplicates.map((d) => (
                    <li key={d.row_number}>
                      Row {d.row_number}: {d.name}
                    </li>
                  ))}
                </ul>
              </details>
            )}

            {/* Review table */}
            {items.length === 0 ? (
              <p className="text-sm text-foreground-muted py-4 text-center">
                No new fluorophores to import.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-surface text-left">
                      <th className="px-2 py-1 font-medium text-foreground-muted w-8">#</th>
                      <th className="px-2 py-1 font-medium text-foreground-muted">Name</th>
                      <th className="px-2 py-1 font-medium text-foreground-muted w-24">Type</th>
                      <th className="px-2 py-1 font-medium text-foreground-muted w-20">Ex Max</th>
                      <th className="px-2 py-1 font-medium text-foreground-muted w-20">Em Max</th>
                      <th className="px-2 py-1 font-medium text-foreground-muted w-16">QY</th>
                      <th className="px-2 py-1 font-medium text-foreground-muted w-16">Spectra</th>
                      <th className="px-2 py-1 font-medium text-foreground-muted">Warnings</th>
                      <th className="px-2 py-1 w-6"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, idx) => {
                      const hasWarnings = item.warnings.length > 0
                      const badge = spectraBadge(item)
                      return (
                        <tr
                          key={idx}
                          className={
                            hasWarnings
                              ? 'bg-amber-50 dark:bg-amber-900/10'
                              : 'even:bg-surface'
                          }
                        >
                          <td className="px-2 py-1 text-foreground-subtle">{item.row_number}</td>
                          <td className="px-2 py-1">
                            <input
                              className={inputClass}
                              value={item.name}
                              onChange={(e) => updateItem(idx, 'name', e.target.value)}
                            />
                          </td>
                          <td className="px-2 py-1">
                            <select
                              className={inputClass}
                              value={item.fluor_type ?? ''}
                              onChange={(e) =>
                                updateItem(idx, 'fluor_type', e.target.value || null)
                              }
                            >
                              <option value="">—</option>
                              <option value="protein">protein</option>
                              <option value="dye">dye</option>
                            </select>
                          </td>
                          <td className="px-2 py-1">
                            <input
                              type="number"
                              className={inputClass}
                              value={item.ex_max_nm ?? ''}
                              onChange={(e) =>
                                updateItem(
                                  idx,
                                  'ex_max_nm',
                                  e.target.value ? parseFloat(e.target.value) : null
                                )
                              }
                            />
                          </td>
                          <td className="px-2 py-1">
                            <input
                              type="number"
                              className={inputClass}
                              value={item.em_max_nm ?? ''}
                              onChange={(e) =>
                                updateItem(
                                  idx,
                                  'em_max_nm',
                                  e.target.value ? parseFloat(e.target.value) : null
                                )
                              }
                            />
                          </td>
                          <td className="px-2 py-1">
                            <input
                              type="number"
                              step="0.01"
                              className={inputClass}
                              value={item.qy ?? ''}
                              onChange={(e) =>
                                updateItem(
                                  idx,
                                  'qy',
                                  e.target.value ? parseFloat(e.target.value) : null
                                )
                              }
                            />
                          </td>
                          <td className="px-2 py-1">
                            {badge ? (
                              <span className="rounded bg-accent-soft px-1.5 py-0.5 text-xs font-medium text-accent-soft-foreground">
                                {badge}
                              </span>
                            ) : (
                              <span className="text-foreground-subtle">—</span>
                            )}
                          </td>
                          <td className="px-2 py-1">
                            {hasWarnings && (
                              <ul className="space-y-0.5">
                                {item.warnings.map((w, wi) => (
                                  <li key={wi} className="text-warning-soft-foreground">
                                    {w}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </td>
                          <td className="px-2 py-1">
                            <button
                              onClick={() => removeItem(idx)}
                              className="text-foreground-subtle hover:text-danger" // theme-exempt: semantic delete hover
                              title="Remove"
                            >
                              &times;
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {confirmMutation.isError && (
              <p className="mt-3 text-sm text-red-600">
                {confirmMutation.error?.message ?? 'Import failed.'}
              </p>
            )}

            <div className="mt-4 flex justify-between">
              <button
                onClick={() => {
                  setStep('upload')
                  setPreview(null)
                  setItems([])
                  uploadMutation.reset()
                }}
                className="rounded border border-border-strong px-4 py-2 text-sm text-foreground-muted hover:bg-hover"
              >
                Back
              </button>
              <button
                onClick={handleConfirm}
                disabled={items.length === 0 || confirmMutation.isPending}
                className="rounded bg-accent hover:bg-accent-hover text-accent-foreground px-4 py-2 text-sm font-medium disabled:opacity-50"
              >
                {confirmMutation.isPending
                  ? 'Importing...'
                  : `Import ${items.length} Fluorophore${items.length !== 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Done */}
        {step === 'done' && doneResult && (
          <div className="flex flex-col items-center py-8">
            <svg
              className="mb-4 h-12 w-12 text-success"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <p className="text-lg font-semibold text-foreground">
              Import complete
            </p>
            <p className="mt-1 text-sm text-foreground-muted">
              {doneResult.created} fluorophore{doneResult.created !== 1 ? 's' : ''} created
              {doneResult.skipped > 0 && `, ${doneResult.skipped} skipped`}
            </p>
            {doneResult.errors.length > 0 && (
              <ul className="mt-3 space-y-1 text-xs text-red-500 text-left max-w-md">
                {doneResult.errors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            )}
            <button
              onClick={onClose}
              className="mt-6 rounded bg-accent hover:bg-accent-hover text-accent-foreground px-6 py-2 text-sm font-medium"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </Modal>
  )
}
