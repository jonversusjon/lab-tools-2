import { useCallback, useMemo, useState } from 'react'
import Modal from '@/components/layout/Modal'
import { useUploadCsv, useConfirmImport } from '@/hooks/useAntibodies'
import type {
  CsvImportResponse,
  ImportAntibodyItem,
  NewAntibodyRow,
  ParsedAntibody,
} from '@/types'

interface ImportWizardProps {
  onClose: () => void
}

type Step = 'upload' | 'select' | 'review' | 'done'

export default function ImportWizard({ onClose }: ImportWizardProps) {
  const [step, setStep] = useState<Step>('upload')
  const [importData, setImportData] = useState<CsvImportResponse | null>(null)
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set())
  const [editedRows, setEditedRows] = useState<Map<number, ParsedAntibody>>(new Map())
  const [expandedRow, setExpandedRow] = useState<number | null>(null)
  const [importResult, setImportResult] = useState<{ imported: number; errors: { name?: string; error: string }[] } | null>(null)
  const [selectSearch, setSelectSearch] = useState('')

  const uploadMutation = useUploadCsv()
  const confirmMutation = useConfirmImport()

  // Step 1: Upload
  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return
      uploadMutation.mutate(file, {
        onSuccess: (data) => {
          setImportData(data)
          // Auto-select all new antibodies
          const indices = new Set(data.new_antibodies.map((r) => r.csv_row_index))
          setSelectedIndices(indices)
          setStep('select')
        },
      })
    },
    [uploadMutation]
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      const file = e.dataTransfer.files?.[0]
      if (!file || !file.name.endsWith('.csv')) return
      uploadMutation.mutate(file, {
        onSuccess: (data) => {
          setImportData(data)
          const indices = new Set(data.new_antibodies.map((r) => r.csv_row_index))
          setSelectedIndices(indices)
          setStep('select')
        },
      })
    },
    [uploadMutation]
  )

  // Step 2: Select
  const filteredNew = useMemo(() => {
    if (!importData) return []
    if (!selectSearch) return importData.new_antibodies
    const term = selectSearch.toLowerCase()
    return importData.new_antibodies.filter(
      (r) =>
        r.parsed.name?.toLowerCase().includes(term) ||
        r.parsed.catalog_number?.toLowerCase().includes(term) ||
        r.parsed.manufacturer?.toLowerCase().includes(term)
    )
  }, [importData, selectSearch])

  const toggleRow = (idx: number) => {
    setSelectedIndices((prev) => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }

  const selectAll = () => {
    if (!importData) return
    setSelectedIndices(
      new Set(importData.new_antibodies.map((r) => r.csv_row_index))
    )
  }

  const selectNone = () => setSelectedIndices(new Set())

  // Step 3: Review
  const selectedRows = useMemo(() => {
    if (!importData) return []
    return importData.new_antibodies.filter((r) =>
      selectedIndices.has(r.csv_row_index)
    )
  }, [importData, selectedIndices])

  const getEdited = (row: NewAntibodyRow): ParsedAntibody =>
    editedRows.get(row.csv_row_index) ?? row.parsed

  const updateField = (
    idx: number,
    field: keyof ParsedAntibody,
    value: string | boolean | string[]
  ) => {
    setEditedRows((prev) => {
      const next = new Map(prev)
      const current =
        next.get(idx) ??
        importData!.new_antibodies.find((r) => r.csv_row_index === idx)!.parsed
      next.set(idx, { ...current, [field]: value })
      return next
    })
  }

  // Step 4: Confirm
  const handleConfirm = () => {
    const antibodies: ImportAntibodyItem[] = selectedRows.map((row) => {
      const p = getEdited(row)
      return {
        name: p.name,
        target: p.name,
        catalog_number: p.catalog_number,
        conjugate: p.conjugate,
        host: p.host_species,
        isotype: p.isotype,
        vendor: p.manufacturer,
        confirmed_in_stock: p.confirmed_in_stock,
        date_received: p.date_received,
        flow_dilution: p.flow_dilution,
        icc_if_dilution: p.icc_if_dilution,
        wb_dilution: p.wb_dilution,
        reacts_with: p.reacts_with,
        storage_temp: p.storage_temp,
        validation_notes: p.validation_notes,
        notes: p.notes,
        website: p.website,
        physical_location: p.physical_location,
      }
    })

    confirmMutation.mutate(antibodies, {
      onSuccess: (result) => {
        setImportResult(result)
        setStep('done')
      },
    })
  }

  const inputClass =
    'w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-2 py-1 text-sm dark:text-gray-100 focus:border-blue-500 focus:outline-none'
  const missingClass =
    'w-full rounded border border-amber-400 dark:border-amber-500 bg-amber-50 dark:bg-amber-900/20 px-2 py-1 text-sm dark:text-gray-100 focus:border-blue-500 focus:outline-none'

  return (
    <Modal isOpen onClose={onClose} title="Import Antibodies from CSV" wide>
      <div className="min-h-[400px]">
        {/* Step indicator */}
        <div className="mb-6 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
          {(['upload', 'select', 'review', 'done'] as Step[]).map((s, i) => (
            <span key={s} className="flex items-center gap-1">
              {i > 0 && <span className="mx-1">&rarr;</span>}
              <span
                className={
                  step === s
                    ? 'font-bold text-blue-600 dark:text-blue-400'
                    : ''
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
            className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 p-12"
          >
            <svg
              className="mb-4 h-12 w-12 text-gray-400"
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
            <p className="mb-2 text-gray-600 dark:text-gray-300">
              Drag & drop a CSV file here, or click to browse
            </p>
            <label className="cursor-pointer rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
              Choose File
              <input
                type="file"
                accept=".csv"
                onChange={handleFileSelect}
                className="hidden"
              />
            </label>
            {uploadMutation.isPending && (
              <p className="mt-4 text-sm text-gray-500">Parsing CSV...</p>
            )}
            {uploadMutation.isError && (
              <p className="mt-4 text-sm text-red-600">
                Failed to parse CSV. Check the file format.
              </p>
            )}
          </div>
        )}

        {/* Step 2: Select */}
        {step === 'select' && importData && (
          <div>
            <div className="mb-4 rounded bg-gray-50 dark:bg-gray-800 p-3 text-sm">
              <strong>{importData.summary.total_csv_rows}</strong> rows parsed:{' '}
              <span className="text-green-600 dark:text-green-400">
                {importData.summary.new} new
              </span>
              ,{' '}
              <span className="text-gray-500">
                {importData.summary.existing} already in database
              </span>
              {importData.summary.errors > 0 && (
                <>
                  ,{' '}
                  <span className="text-red-600">
                    {importData.summary.errors} errors
                  </span>
                </>
              )}
            </div>

            {importData.parse_errors.length > 0 && (
              <details className="mb-4">
                <summary className="cursor-pointer text-sm text-red-600">
                  {importData.parse_errors.length} parse error(s)
                </summary>
                <ul className="mt-1 space-y-1 text-xs text-red-500">
                  {importData.parse_errors.map((e) => (
                    <li key={e.csv_row_index}>
                      Row {e.csv_row_index + 1}: {e.error}
                    </li>
                  ))}
                </ul>
              </details>
            )}

            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button
                  onClick={selectAll}
                  className="rounded border border-gray-300 dark:border-gray-600 px-3 py-1 text-xs hover:bg-gray-50 dark:hover:bg-gray-700 dark:text-gray-300"
                >
                  Select All
                </button>
                <button
                  onClick={selectNone}
                  className="rounded border border-gray-300 dark:border-gray-600 px-3 py-1 text-xs hover:bg-gray-50 dark:hover:bg-gray-700 dark:text-gray-300"
                >
                  Select None
                </button>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {selectedIndices.size} of {importData.new_antibodies.length}{' '}
                  selected
                </span>
              </div>
              <input
                type="text"
                placeholder="Filter..."
                value={selectSearch}
                onChange={(e) => setSelectSearch(e.target.value)}
                className="rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-2 py-1 text-xs dark:text-gray-100 w-48"
              />
            </div>

            <div className="max-h-[400px] overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-white dark:bg-gray-900">
                  <tr className="border-b border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400">
                    <th className="py-1 w-8" />
                    <th className="py-1">Name</th>
                    <th className="py-1">Catalog #</th>
                    <th className="py-1">Host</th>
                    <th className="py-1">Conjugate</th>
                    <th className="py-1">Manufacturer</th>
                    <th className="py-1">Missing</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredNew.map((row) => (
                    <tr
                      key={row.csv_row_index}
                      className="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer"
                      onClick={() => toggleRow(row.csv_row_index)}
                    >
                      <td className="py-1">
                        <input
                          type="checkbox"
                          checked={selectedIndices.has(row.csv_row_index)}
                          onChange={() => toggleRow(row.csv_row_index)}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </td>
                      <td className="py-1 font-medium dark:text-gray-100">
                        {row.parsed.name}
                      </td>
                      <td className="py-1 text-gray-600 dark:text-gray-400">
                        {row.parsed.catalog_number ?? ''}
                      </td>
                      <td className="py-1 text-gray-600 dark:text-gray-400">
                        {row.parsed.host_species ?? ''}
                      </td>
                      <td className="py-1 text-gray-600 dark:text-gray-400">
                        {row.parsed.conjugate ?? ''}
                      </td>
                      <td className="py-1 text-gray-600 dark:text-gray-400">
                        {row.parsed.manufacturer ?? ''}
                      </td>
                      <td className="py-1">
                        {row.missing_fields.length > 0 && (
                          <span className="inline-flex items-center rounded-full bg-amber-100 dark:bg-amber-900/30 px-2 py-0.5 text-xs text-amber-700 dark:text-amber-300">
                            {row.missing_fields.length}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex justify-between">
              <button
                onClick={() => setStep('upload')}
                className="rounded border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                Back
              </button>
              <button
                onClick={() => setStep('review')}
                disabled={selectedIndices.size === 0}
                className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                Next: Review ({selectedIndices.size})
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Review & Edit */}
        {step === 'review' && (
          <div>
            <p className="mb-3 text-sm text-gray-600 dark:text-gray-400">
              Review {selectedRows.length} antibodies. Click a row to expand and
              edit. Fields highlighted in amber are missing.
            </p>

            <div className="max-h-[450px] overflow-y-auto space-y-1">
              {selectedRows.map((row) => {
                const p = getEdited(row)
                const isExpanded = expandedRow === row.csv_row_index

                return (
                  <div
                    key={row.csv_row_index}
                    className="rounded border border-gray-200 dark:border-gray-700"
                  >
                    <div
                      className="flex cursor-pointer items-center justify-between px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-800"
                      onClick={() =>
                        setExpandedRow(isExpanded ? null : row.csv_row_index)
                      }
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-gray-400">
                          {isExpanded ? '\u25BC' : '\u25B6'}
                        </span>
                        <span className="text-sm font-medium dark:text-gray-100">
                          {p.name}
                        </span>
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          {p.catalog_number ?? ''}
                        </span>
                      </div>
                      {row.missing_fields.length > 0 && (
                        <span className="text-xs text-amber-600 dark:text-amber-400">
                          {row.missing_fields.length} missing
                        </span>
                      )}
                    </div>

                    {isExpanded && (
                      <div className="border-t border-gray-200 dark:border-gray-700 p-3">
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="mb-0.5 block text-xs text-gray-500 dark:text-gray-400">
                              Name
                            </label>
                            <input
                              className={inputClass}
                              value={p.name ?? ''}
                              onChange={(e) =>
                                updateField(
                                  row.csv_row_index,
                                  'name',
                                  e.target.value
                                )
                              }
                            />
                          </div>
                          <div>
                            <label className="mb-0.5 block text-xs text-gray-500 dark:text-gray-400">
                              Catalog #
                            </label>
                            <input
                              className={
                                row.missing_fields.includes('catalog_number')
                                  ? missingClass
                                  : inputClass
                              }
                              value={p.catalog_number ?? ''}
                              onChange={(e) =>
                                updateField(
                                  row.csv_row_index,
                                  'catalog_number',
                                  e.target.value
                                )
                              }
                            />
                          </div>
                          <div>
                            <label className="mb-0.5 block text-xs text-gray-500 dark:text-gray-400">
                              Host Species
                            </label>
                            <select
                              className={
                                row.missing_fields.includes('host_species')
                                  ? missingClass
                                  : inputClass
                              }
                              value={p.host_species ?? ''}
                              onChange={(e) =>
                                updateField(
                                  row.csv_row_index,
                                  'host_species',
                                  e.target.value || ''
                                )
                              }
                            >
                              <option value="">--</option>
                              {[
                                'Mouse',
                                'Rabbit',
                                'Goat',
                                'Chicken',
                                'Rat',
                                'Donkey',
                                'Sheep',
                                'Armenian Hamster',
                                'Guinea Pig',
                              ].map((h) => (
                                <option key={h} value={h}>
                                  {h}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="mb-0.5 block text-xs text-gray-500 dark:text-gray-400">
                              Isotype
                            </label>
                            <select
                              className={inputClass}
                              value={p.isotype ?? ''}
                              onChange={(e) =>
                                updateField(
                                  row.csv_row_index,
                                  'isotype',
                                  e.target.value || ''
                                )
                              }
                            >
                              <option value="">--</option>
                              {['IgG', 'IgG1', 'IgG2a', 'IgG2b', 'IgG3'].map(
                                (iso) => (
                                  <option key={iso} value={iso}>
                                    {iso}
                                  </option>
                                )
                              )}
                            </select>
                          </div>
                          <div>
                            <label className="mb-0.5 block text-xs text-gray-500 dark:text-gray-400">
                              Conjugate
                            </label>
                            <input
                              className={
                                row.missing_fields.includes('conjugate')
                                  ? missingClass
                                  : inputClass
                              }
                              value={p.conjugate ?? ''}
                              onChange={(e) =>
                                updateField(
                                  row.csv_row_index,
                                  'conjugate',
                                  e.target.value
                                )
                              }
                            />
                          </div>
                          <div>
                            <label className="mb-0.5 block text-xs text-gray-500 dark:text-gray-400">
                              Manufacturer
                            </label>
                            <input
                              className={
                                row.missing_fields.includes('manufacturer')
                                  ? missingClass
                                  : inputClass
                              }
                              value={p.manufacturer ?? ''}
                              onChange={(e) =>
                                updateField(
                                  row.csv_row_index,
                                  'manufacturer',
                                  e.target.value
                                )
                              }
                            />
                          </div>
                          <div>
                            <label className="mb-0.5 block text-xs text-gray-500 dark:text-gray-400">
                              Flow Dilution
                            </label>
                            <input
                              className={
                                row.missing_fields.includes('flow_dilution')
                                  ? missingClass
                                  : inputClass
                              }
                              value={p.flow_dilution ?? ''}
                              onChange={(e) =>
                                updateField(
                                  row.csv_row_index,
                                  'flow_dilution',
                                  e.target.value
                                )
                              }
                            />
                          </div>
                          <div>
                            <label className="mb-0.5 block text-xs text-gray-500 dark:text-gray-400">
                              Storage Temp
                            </label>
                            <select
                              className={
                                row.missing_fields.includes('storage_temp')
                                  ? missingClass
                                  : inputClass
                              }
                              value={p.storage_temp ?? ''}
                              onChange={(e) =>
                                updateField(
                                  row.csv_row_index,
                                  'storage_temp',
                                  e.target.value || ''
                                )
                              }
                            >
                              <option value="">--</option>
                              <option value="4C">4C</option>
                              <option value="-20C">-20C</option>
                            </select>
                          </div>
                          <div className="col-span-2">
                            <label className="mb-0.5 block text-xs text-gray-500 dark:text-gray-400">
                              Notes
                            </label>
                            <textarea
                              className={inputClass}
                              rows={2}
                              value={p.notes ?? ''}
                              onChange={(e) =>
                                updateField(
                                  row.csv_row_index,
                                  'notes',
                                  e.target.value
                                )
                              }
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            <div className="mt-4 flex justify-between">
              <button
                onClick={() => setStep('select')}
                className="rounded border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                Back
              </button>
              <button
                onClick={handleConfirm}
                disabled={confirmMutation.isPending}
                className="rounded bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
              >
                {confirmMutation.isPending
                  ? 'Importing...'
                  : `Import ${selectedRows.length} Antibodies`}
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Done */}
        {step === 'done' && importResult && (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="mb-4 rounded-full bg-green-100 dark:bg-green-900/30 p-3">
              <svg
                className="h-8 w-8 text-green-600 dark:text-green-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <h3 className="mb-2 text-lg font-semibold dark:text-gray-100">
              Import Complete
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Imported {importResult.imported} antibodies.
              {importResult.errors.length > 0 && (
                <span className="text-red-600">
                  {' '}
                  {importResult.errors.length} error(s).
                </span>
              )}
            </p>
            {importResult.errors.length > 0 && (
              <ul className="mt-2 text-xs text-red-500">
                {importResult.errors.map((err, i) => (
                  <li key={i}>
                    {err.name}: {err.error}
                  </li>
                ))}
              </ul>
            )}
            <button
              onClick={onClose}
              className="mt-6 rounded bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </Modal>
  )
}
