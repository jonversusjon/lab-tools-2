import { useState, useRef, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  useMicroscopes,
  useUpdateMicroscope,
  useDeleteMicroscope,
  useImportMicroscope,
  useToggleMicroscopeFavorite,
} from '@/hooks/useMicroscopes'
import { exportMicroscope } from '@/api/microscopes'
import Modal from '@/components/layout/Modal'
import HoverActionsRow from '@/components/layout/HoverActionsRow'
import FavoriteButton from '@/components/antibodies/FavoriteButton'
import type { MicroscopeCreate } from '@/types'

interface ImportProgress {
  total: number
  done: number
  errors: string[]
}

export default function MicroscopeList() {
  const { data, isLoading, error } = useMicroscopes()
  const updateMutation = useUpdateMicroscope()
  const deleteMutation = useDeleteMicroscope()
  const importMutation = useImportMicroscope()
  const favoriteMutation = useToggleMicroscopeFavorite()
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dragCounterRef = useRef(0)

  const [editingMicroscope, setEditingMicroscope] = useState<{id: string, name: string} | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [isDragOver, setIsDragOver] = useState(false)
  const [importProgress, setImportProgress] = useState<ImportProgress | null>(null)

  // Filter state
  const [search, setSearch] = useState('')
  const [laserFilter, setLaserFilter] = useState('')
  const [filterFilter, setFilterFilter] = useState('')
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false)
  const [locationFilter, setLocationFilter] = useState('')

  const microscopes = data?.items ?? []

  // Derive unique laser wavelengths and filter midpoints for dropdowns
  const uniqueLaserWavelengths = useMemo(() => {
    const wls = new Set<number>()
    microscopes.forEach((m) => m.lasers.forEach((l) => wls.add(l.wavelength_nm)))
    return Array.from(wls).sort((a, b) => a - b)
  }, [microscopes])

  const uniqueFilterMidpoints = useMemo(() => {
    const mps = new Set<number>()
    microscopes.forEach((m) =>
      m.lasers.forEach((l) => l.filters.forEach((f) => mps.add(f.filter_midpoint)))
    )
    return Array.from(mps).sort((a, b) => a - b)
  }, [microscopes])

  const uniqueLocations = useMemo(() => {
    const locs = new Set<string>()
    microscopes.forEach((m) => {
      if (m.location) locs.add(m.location)
    })
    return Array.from(locs).sort((a, b) => a.localeCompare(b))
  }, [microscopes])

  // Filtered + sorted list
  const filtered = useMemo(() => {
    let result = microscopes.slice().sort((a, b) => a.name.localeCompare(b.name))
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter((m) => m.name.toLowerCase().includes(q))
    }
    if (laserFilter) {
      const wl = Number(laserFilter)
      result = result.filter((m) => m.lasers.some((l) => l.wavelength_nm === wl))
    }
    if (filterFilter) {
      const mp = Number(filterFilter)
      result = result.filter((m) =>
        m.lasers.some((l) => l.filters.some((f) => f.filter_midpoint === mp))
      )
    }
    if (showFavoritesOnly) {
      result = result.filter((m) => m.is_favorite)
    }
    if (locationFilter) {
      result = result.filter((m) => m.location === locationFilter)
    }
    return result
  }, [microscopes, search, laserFilter, filterFilter, showFavoritesOnly, locationFilter])

  const hasActiveFilters = search.trim() || laserFilter || filterFilter || showFavoritesOnly || locationFilter

  const handleRename = () => {
    if (!editingMicroscope || !renameValue.trim() || renameValue.trim() === editingMicroscope.name) {
      setEditingMicroscope(null)
      return
    }
    updateMutation.mutate(
      { id: editingMicroscope.id, data: { name: renameValue.trim() } as MicroscopeCreate },
      {
        onSuccess: () => {
          setEditingMicroscope(null)
          setRenameValue('')
        },
      }
    )
  }

  const handleDelete = (id: string, name: string) => {
    if (!confirm('Delete microscope "' + name + '"? This cannot be undone.')) return
    deleteMutation.mutate(id)
  }

  const handleExport = async (id: string, name: string) => {
    try {
      const data = await exportMicroscope(id)
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = name.replace(/[^a-zA-Z0-9_\- ]/g, '').replace(/\s+/g, '_') + '.json'
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      alert('Failed to export microscope.')
    }
  }

  const runImport = useCallback(
    (files: FileList | File[]) => {
      const fileArray = Array.from(files).filter((f) => f.name.endsWith('.json'))
      if (fileArray.length === 0) {
        setImportProgress({ total: 0, done: 0, errors: ['No .json files found.'] })
        return
      }

      const progress: ImportProgress = { total: fileArray.length, done: 0, errors: [] }
      setImportProgress({ ...progress })

      for (const file of fileArray) {
        const reader = new FileReader()
        reader.onload = (ev) => {
          const finish = (errMsg?: string) => {
            setImportProgress((prev) => {
              if (!prev) return prev
              const errors = errMsg ? [...prev.errors, errMsg] : prev.errors
              return { ...prev, done: prev.done + 1, errors }
            })
          }

          try {
            const parsed = JSON.parse(ev.target?.result as string) as MicroscopeCreate
            if (!parsed.name || !Array.isArray(parsed.lasers)) {
              finish(file.name + ': missing name or lasers array')
              return
            }
            importMutation.mutate(parsed, {
              onSuccess: () => finish(),
              onError: () => finish(file.name + ': server rejected import'),
            })
          } catch {
            finish(file.name + ': invalid JSON')
          }
        }
        reader.readAsText(file)
      }
    },
    [importMutation]
  )

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    runImport(files)
    e.target.value = ''
  }

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounterRef.current++
    if (e.dataTransfer.types.includes('Files')) setIsDragOver(true)
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounterRef.current--
    if (dragCounterRef.current === 0) setIsDragOver(false)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      dragCounterRef.current = 0
      setIsDragOver(false)
      if (e.dataTransfer.files.length > 0) runImport(e.dataTransfer.files)
    },
    [runImport]
  )

  const importDone = importProgress !== null && importProgress.done === importProgress.total
  const importSucceeded = importDone ? importProgress.done - importProgress.errors.length : 0
  const progressPct = importProgress && importProgress.total > 0
    ? Math.round((importProgress.done / importProgress.total) * 100)
    : 0

  if (isLoading) return <p className="text-gray-500 dark:text-gray-400">Loading microscopes...</p>
  if (error) return <p className="text-red-600">Failed to load microscopes.</p>

  return (
    <div
      className="relative min-h-full"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag-over overlay */}
      {isDragOver && (
        <div className="absolute inset-0 z-50 flex items-center justify-center rounded-lg border-2 border-dashed border-blue-400 bg-blue-50/85 dark:bg-blue-900/50 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3 text-center">
            <svg className="h-14 w-14 text-blue-500 dark:text-blue-400 drop-shadow" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 16V4m0 0l-4 4m4-4l4 4M4 14v4a2 2 0 002 2h12a2 2 0 002-2v-4" />
            </svg>
            <p className="text-xl font-semibold text-blue-700 dark:text-blue-200">
              Drop microscope configs here to add new microscopes
            </p>
            <p className="text-sm text-blue-500 dark:text-blue-400">
              Accepts one or more .json microscope configuration files
            </p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold dark:text-gray-100">Microscopes</h1>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            multiple
            onChange={handleImportFile}
            className="hidden"
          />
          <button
            onClick={() => { setImportProgress(null); fileInputRef.current?.click() }}
            className="rounded border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            Import
          </button>
          <button
            onClick={() => navigate('/if-ihc/microscopes/new')}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            New Microscope
          </button>
        </div>
      </div>

      {/* Import progress */}
      {importProgress !== null && (
        <div className={`mb-4 rounded-lg border px-4 py-3 text-sm ${
          importDone && importProgress.errors.length === 0
            ? 'border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20'
            : importDone && importProgress.errors.length > 0 && importSucceeded === 0
              ? 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20'
              : 'border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20'
        }`}>
          <div className="flex items-center justify-between mb-2">
            <span className={`font-medium ${
              importDone && importProgress.errors.length === 0
                ? 'text-green-700 dark:text-green-300'
                : importDone && importSucceeded === 0
                  ? 'text-red-700 dark:text-red-300'
                  : 'text-blue-700 dark:text-blue-300'
            }`}>
              {!importDone
                ? 'Importing ' + importProgress.total + (importProgress.total === 1 ? ' file' : ' files') + '…'
                : importProgress.errors.length === 0
                  ? 'Imported ' + importSucceeded + (importSucceeded === 1 ? ' microscope' : ' microscopes') + ' successfully'
                  : importSucceeded > 0
                    ? importSucceeded + ' imported, ' + importProgress.errors.length + ' failed'
                    : 'Import failed — ' + importProgress.errors.length + (importProgress.errors.length === 1 ? ' error' : ' errors')}
            </span>
            {importDone && (
              <button
                onClick={() => setImportProgress(null)}
                className="ml-4 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                Dismiss
              </button>
            )}
          </div>
          {/* Progress bar */}
          <div className="h-1.5 w-full rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                importDone && importProgress.errors.length === 0
                  ? 'bg-green-500'
                  : importDone && importSucceeded === 0
                    ? 'bg-red-500'
                    : importDone
                      ? 'bg-amber-500'
                      : 'bg-blue-500'
              }`}
              style={{ width: progressPct + '%' }}
            />
          </div>
          <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            {importProgress.done} / {importProgress.total} processed
          </div>
          {importProgress.errors.length > 0 && (
            <ul className="mt-2 space-y-0.5">
              {importProgress.errors.map((err, i) => (
                <li key={i} className="text-xs text-red-600 dark:text-red-400">{err}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="mb-4 space-y-2">
        <input
          type="text"
          placeholder="Search by name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm dark:text-gray-100 focus:border-blue-500 focus:outline-none"
        />
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={laserFilter}
            onChange={(e) => setLaserFilter(e.target.value)}
            className="rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-2 py-1.5 text-xs dark:text-gray-100 focus:outline-none"
          >
            <option value="">All laser wavelengths</option>
            {uniqueLaserWavelengths.map((wl) => (
              <option key={wl} value={String(wl)}>{wl} nm</option>
            ))}
          </select>

          <select
            value={filterFilter}
            onChange={(e) => setFilterFilter(e.target.value)}
            className="rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-2 py-1.5 text-xs dark:text-gray-100 focus:outline-none"
          >
            <option value="">All filter wavelengths</option>
            {uniqueFilterMidpoints.map((mp) => (
              <option key={mp} value={String(mp)}>{mp} nm</option>
            ))}
          </select>

          {uniqueLocations.length > 0 && (
            <select
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value)}
              className="rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-2 py-1.5 text-xs dark:text-gray-100 focus:outline-none"
            >
              <option value="">All locations</option>
              {uniqueLocations.map((loc) => (
                <option key={loc} value={loc}>{loc}</option>
              ))}
            </select>
          )}

          <button
            onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
            className={`rounded border px-3 py-1.5 text-xs ${
              showFavoritesOnly
                ? 'border-yellow-400 bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-300'
                : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}
          >
            ★ Favorites
          </button>

          {hasActiveFilters && (
            <button
              onClick={() => { setSearch(''); setLaserFilter(''); setFilterFilter(''); setShowFavoritesOnly(false); setLocationFilter('') }}
              className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Table / empty state */}
      {microscopes.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 py-20 text-center">
          <svg className="mb-3 h-10 w-10 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 16V4m0 0l-4 4m4-4l4 4M4 14v4a2 2 0 002 2h12a2 2 0 002-2v-4" />
          </svg>
          <p className="text-gray-500 dark:text-gray-400">No microscopes yet.</p>
          <p className="mt-1 text-sm text-gray-400 dark:text-gray-500">
            Drag and drop .json files here or click Import above.
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-400 dark:text-gray-500">
          No microscopes match your filters.
        </p>
      ) : (
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400">
              <th className="w-8 py-2" />
              <th className="py-2 font-medium">Name</th>
              <th className="py-2 font-medium">Location</th>
              <th className="py-2 font-medium">Lasers</th>
              <th className="py-2 font-medium">Filters</th>
              <th className="w-16 py-2" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((m) => {
              const totalFilters = m.lasers.reduce(
                (sum, l) => sum + l.filters.length,
                0
              )
              return (
                <HoverActionsRow
                  key={m.id}
                  as="tr"
                  onClick={() => navigate('/if-ihc/microscopes/' + m.id)}
                  className="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"
                  actions={{
                    onRename: () => {
                      setEditingMicroscope({ id: m.id, name: m.name })
                      setRenameValue(m.name)
                    },
                    onDuplicate: undefined,
                    onDelete: () => handleDelete(m.id, m.name),
                    extraActions: (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleExport(m.id, m.name)
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
                  <td className="py-3 pr-1">
                    <FavoriteButton
                      isFavorite={m.is_favorite}
                      onClick={() =>
                        favoriteMutation.mutate({ id: m.id, is_favorite: !m.is_favorite })
                      }
                    />
                  </td>
                  <td className="py-3 font-medium text-gray-900 dark:text-gray-100">
                    {m.name}
                    {laserFilter && (
                      <span className="ml-2 inline-flex gap-1">
                        {m.lasers
                          .filter((l) => l.wavelength_nm === Number(laserFilter))
                          .map((l) => (
                            <span key={l.id} className="rounded-full bg-blue-100 dark:bg-blue-900/40 px-1.5 py-0.5 text-xs text-blue-700 dark:text-blue-300">
                              {l.wavelength_nm} nm
                            </span>
                          ))}
                      </span>
                    )}
                  </td>
                  <td className="py-3 text-gray-600 dark:text-gray-400">{m.location ?? '—'}</td>
                  <td className="py-3 text-gray-600 dark:text-gray-400">{m.lasers.length}</td>
                  <td className="py-3 text-gray-600 dark:text-gray-400">{totalFilters}</td>
                </HoverActionsRow>
              )
            })}
          </tbody>
        </table>
      )}

      {/* Rename modal */}
      <Modal
        isOpen={!!editingMicroscope}
        onClose={() => {
          setEditingMicroscope(null)
          setRenameValue('')
        }}
        title="Rename Microscope"
      >
        <div className="space-y-4">
          <div>
            <label htmlFor="rename-microscope" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Microscope Name
            </label>
            <input
              id="rename-microscope"
              type="text"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleRename() }}
              className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm dark:text-gray-100 focus:border-blue-500 focus:outline-none"
              autoFocus
            />
          </div>
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => { setEditingMicroscope(null); setRenameValue('') }}
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
