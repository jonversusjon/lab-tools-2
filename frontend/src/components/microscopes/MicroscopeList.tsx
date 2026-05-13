import { useState, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  useMicroscopes,
  useUpdateMicroscope,
  useDeleteMicroscope,
  useToggleMicroscopeFavorite,
} from '@/hooks/useMicroscopes'
import { exportMicroscope } from '@/api/microscopes'
import { previewImport, readImportFile, type ImportPreviewResponse } from '@/api/exportImport'
import Modal from '@/components/layout/Modal'
import HoverActionsRow from '@/components/layout/HoverActionsRow'
import FavoriteButton from '@/components/antibodies/FavoriteButton'
import NestedImportDiffModal from '@/components/shared/NestedImportDiffModal'
import type { MicroscopeCreate } from '@/types'

export default function MicroscopeList() {
  const { data, isLoading, error } = useMicroscopes()
  const updateMutation = useUpdateMicroscope()
  const deleteMutation = useDeleteMicroscope()
  const favoriteMutation = useToggleMicroscopeFavorite()
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [editingMicroscope, setEditingMicroscope] = useState<{id: string, name: string} | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [importPreview, setImportPreview] = useState<ImportPreviewResponse<Record<string, unknown>> | null>(null)
  const [importModalOpen, setImportModalOpen] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [importSuccessMsg, setImportSuccessMsg] = useState<string | null>(null)

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

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setImportError(null)
    setImportSuccessMsg(null)
    try {
      const payload = await readImportFile(file)
      const preview = await previewImport('microscopes', payload)
      setImportPreview(preview)
      setImportModalOpen(true)
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Failed to read import file.')
    }
  }

  if (isLoading) return <p className="text-foreground-muted">Loading microscopes...</p>
  if (error) return <p className="text-danger">Failed to load microscopes.</p>

  return (
    <div className="relative min-h-full">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Microscopes</h1>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleImportFile}
            className="hidden"
          />
          <button
            onClick={() => { setImportError(null); setImportSuccessMsg(null); fileInputRef.current?.click() }}
            className="rounded border border-border-strong px-4 py-2 text-sm font-medium text-foreground-muted hover:bg-hover"
          >
            Import
          </button>
          <button
            onClick={() => navigate('/if-ihc/microscopes/new')}
            className="rounded bg-accent hover:bg-accent-hover text-accent-foreground px-4 py-2 text-sm font-medium"
          >
            New Microscope
          </button>
        </div>
      </div>

      {importError && (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-danger bg-danger-soft px-4 py-3 text-sm text-danger-soft-foreground">
          <span>{importError}</span>
          <button onClick={() => setImportError(null)} className="ml-4 text-xs text-foreground-subtle hover:text-foreground-muted">Dismiss</button>
        </div>
      )}

      {importSuccessMsg && (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-success bg-success-soft px-4 py-3 text-sm text-success-soft-foreground">
          <span>{importSuccessMsg}</span>
          <button onClick={() => setImportSuccessMsg(null)} className="ml-4 text-xs text-foreground-subtle hover:text-foreground-muted">Dismiss</button>
        </div>
      )}

      {/* Filters */}
      <div className="mb-4 space-y-2">
        <input
          type="text"
          placeholder="Search by name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded border border-border-strong bg-white dark:bg-gray-700 px-3 py-2 text-sm dark:text-gray-100 focus:border-blue-500 focus:outline-none"
        />
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={laserFilter}
            onChange={(e) => setLaserFilter(e.target.value)}
            className="rounded border border-border-strong bg-elevated text-foreground px-2 py-1.5 text-xs focus:outline-none"
          >
            <option value="">All laser wavelengths</option>
            {uniqueLaserWavelengths.map((wl) => (
              <option key={wl} value={String(wl)}>{wl} nm</option>
            ))}
          </select>

          <select
            value={filterFilter}
            onChange={(e) => setFilterFilter(e.target.value)}
            className="rounded border border-border-strong bg-elevated text-foreground px-2 py-1.5 text-xs focus:outline-none"
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
              className="rounded border border-border-strong bg-elevated text-foreground px-2 py-1.5 text-xs focus:outline-none"
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
                ? 'border-warning bg-warning-soft text-warning-soft-foreground'
                : 'border-border text-foreground-muted hover:bg-hover'
            }`}
          >
            ★ Favorites
          </button>

          {hasActiveFilters && (
            <button
              onClick={() => { setSearch(''); setLaserFilter(''); setFilterFilter(''); setShowFavoritesOnly(false); setLocationFilter('') }}
              className="text-xs text-accent hover:underline"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Table / empty state */}
      {microscopes.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-border-strong py-20 text-center">
          <svg className="mb-3 h-10 w-10 text-foreground-subtle" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 16V4m0 0l-4 4m4-4l4 4M4 14v4a2 2 0 002 2h12a2 2 0 002-2v-4" />
          </svg>
          <p className="text-foreground-muted">No microscopes yet.</p>
          <p className="mt-1 text-sm text-foreground-subtle">
            Click Import above or New Microscope to get started.
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <p className="py-6 text-center text-sm text-foreground-subtle">
          No microscopes match your filters.
        </p>
      ) : (
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-border text-foreground-muted">
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
                  className="border-b border-border hover:bg-hover"
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
                        className="p-1.5 rounded text-foreground-subtle hover:text-foreground hover:bg-hover"
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
                  <td className="py-3 font-medium text-foreground">
                    {m.name}
                    {laserFilter && (
                      <span className="ml-2 inline-flex gap-1">
                        {m.lasers
                          .filter((l) => l.wavelength_nm === Number(laserFilter))
                          .map((l) => (
                            <span key={l.id} className="rounded-full bg-accent-soft px-1.5 py-0.5 text-xs text-accent-soft-foreground">
                              {l.wavelength_nm} nm
                            </span>
                          ))}
                      </span>
                    )}
                  </td>
                  <td className="py-3 text-foreground-muted">{m.location ?? '—'}</td>
                  <td className="py-3 text-foreground-muted">{m.lasers.length}</td>
                  <td className="py-3 text-foreground-muted">{totalFilters}</td>
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
            <label htmlFor="rename-microscope" className="mb-1 block text-sm font-medium text-foreground-muted">
              Microscope Name
            </label>
            <input
              id="rename-microscope"
              type="text"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleRename() }}
              className="w-full rounded border border-border-strong bg-white dark:bg-gray-700 px-3 py-2 text-sm dark:text-gray-100 focus:border-blue-500 focus:outline-none"
              autoFocus
            />
          </div>
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => { setEditingMicroscope(null); setRenameValue('') }}
              className="rounded border border-border-strong px-4 py-2 text-sm text-foreground-muted hover:bg-hover"
            >
              Cancel
            </button>
            <button
              onClick={handleRename}
              className="rounded bg-accent hover:bg-accent-hover text-accent-foreground px-4 py-2 text-sm font-medium"
            >
              Save
            </button>
          </div>
        </div>
      </Modal>

      {/* Import preview/commit wizard */}
      <NestedImportDiffModal
        isOpen={importModalOpen}
        preview={importPreview}
        resource="microscopes"
        title="Import Microscopes"
        childKeys={['lasers']}
        labelFor={(r) => String(r.name ?? '')}
        onClose={() => { setImportModalOpen(false); setImportPreview(null) }}
        onCompleted={({ imported }) => {
          setImportModalOpen(false)
          setImportPreview(null)
          setImportSuccessMsg(
            'Imported ' + imported + ' microscope' + (imported === 1 ? '' : 's') + '.'
          )
        }}
      />
    </div>
  )
}
