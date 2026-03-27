import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  useFluorophores,
  useFluorophoreSpectra,
  useInstrumentCompatibility,
  useBatchSpectra,
} from '@/hooks/useFluorophores'
import SpectraViewer from '@/components/spectra/SpectraViewer'
import FpbaseFetchModal from './FpbaseFetchModal'
import type { Fluorophore, SpectraData } from '@/types'

const PAGE_SIZE = 50

export default function FluorophoreBrowser() {
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<'all' | 'protein' | 'dye'>('all')
  const [hasSpectraOnly, setHasSpectraOnly] = useState(false)
  const [page, setPage] = useState(0)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  // Map of fluorophore id → name for all items currently in the overlay
  const [overlayMap, setOverlayMap] = useState<Map<string, string>>(new Map())
  const [showFpbaseModal, setShowFpbaseModal] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search)
      setPage(0)
    }, 300)
    return () => clearTimeout(t)
  }, [search])

  useEffect(() => { setPage(0) }, [typeFilter, hasSpectraOnly])

  const { data, isLoading, error } = useFluorophores({
    skip: page * PAGE_SIZE,
    limit: PAGE_SIZE,
    type: typeFilter !== 'all' ? typeFilter : undefined,
    search: debouncedSearch || undefined,
    has_spectra: hasSpectraOnly ? true : undefined,
  })

  const items = data?.items ?? []
  const total = data?.total ?? 0
  const totalPages = Math.ceil(total / PAGE_SIZE)

  const toggleOverlay = (fl: Fluorophore) => {
    setOverlayMap((prev) => {
      const next = new Map(prev)
      if (next.has(fl.id)) next.delete(fl.id)
      else next.set(fl.id, fl.name)
      return next
    })
  }

  const removeFromOverlay = (id: string) => {
    setOverlayMap((prev) => {
      const next = new Map(prev)
      next.delete(id)
      return next
    })
  }

  if (isLoading) {
    return <p className="text-gray-500 dark:text-gray-400">Loading fluorophores...</p>
  }
  if (error) {
    return <p className="text-red-600">Failed to load fluorophores.</p>
  }

  return (
    <div className="flex items-start gap-6">
      {/* ── Left: table area ─────────────────────────────────────── */}
      <div className="min-w-0 flex-1">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold dark:text-gray-100">Fluorophores</h1>
          <button
            onClick={() => setShowFpbaseModal(true)}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Fetch from FPbase
          </button>
        </div>

        {/* Filters */}
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name..."
            className="rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-1.5 text-sm dark:text-gray-100 w-52"
          />
          <div className="flex rounded border border-gray-300 dark:border-gray-600 overflow-hidden text-sm">
            {(['all', 'protein', 'dye'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTypeFilter(t)}
                className={
                  'px-3 py-1.5 capitalize ' +
                  (typeFilter === t
                    ? 'bg-blue-600 text-white'
                    : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600')
                }
              >
                {t}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-1.5 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
            <input
              type="checkbox"
              checked={hasSpectraOnly}
              onChange={(e) => setHasSpectraOnly(e.target.checked)}
            />
            Has spectra
          </label>
          <span className="text-xs text-gray-400 dark:text-gray-500 ml-auto">
            {total.toLocaleString()} fluorophores
          </span>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wide">
                <th className="w-8 py-2" />
                <th className="py-2 font-medium">Name</th>
                <th className="py-2 font-medium">Type</th>
                <th className="py-2 font-medium">Ex Max</th>
                <th className="py-2 font-medium">Em Max</th>
                <th className="py-2 font-medium">Ext Coeff</th>
                <th className="py-2 font-medium">QY</th>
                <th className="py-2 font-medium">Source</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-gray-400 dark:text-gray-500">
                    No fluorophores found.
                  </td>
                </tr>
              )}
              {items.map((fl) => (
                <React.Fragment key={fl.id}>
                  <tr
                    className={
                      'border-b border-gray-100 dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800' +
                      (expandedId === fl.id ? ' bg-blue-50 dark:bg-blue-900/20' : '')
                    }
                    onClick={() => setExpandedId((prev) => (prev === fl.id ? null : fl.id))}
                  >
                    <td className="py-2 text-center" onClick={(e) => e.stopPropagation()}>
                      {fl.has_spectra && (
                        <input
                          type="checkbox"
                          checked={overlayMap.has(fl.id)}
                          onChange={() => toggleOverlay(fl)}
                          title="Add to spectra overlay"
                        />
                      )}
                    </td>
                    <td className="py-2 font-medium text-gray-900 dark:text-gray-100">
                      {fl.name}
                      {fl.has_spectra && (
                        <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-green-400" title="Has spectra" />
                      )}
                    </td>
                    <td className="py-2 text-gray-500 dark:text-gray-400 capitalize">
                      {fl.fluor_type ?? '—'}
                    </td>
                    <td className="py-2 text-gray-600 dark:text-gray-400">
                      {fl.ex_max_nm !== null && fl.ex_max_nm !== undefined ? fl.ex_max_nm.toFixed(0) + ' nm' : '—'}
                    </td>
                    <td className="py-2 text-gray-600 dark:text-gray-400">
                      {fl.em_max_nm !== null && fl.em_max_nm !== undefined ? fl.em_max_nm.toFixed(0) + ' nm' : '—'}
                    </td>
                    <td className="py-2 text-gray-600 dark:text-gray-400">
                      {fl.ext_coeff !== null && fl.ext_coeff !== undefined ? fl.ext_coeff.toLocaleString() : '—'}
                    </td>
                    <td className="py-2 text-gray-600 dark:text-gray-400">
                      {fl.qy !== null && fl.qy !== undefined ? fl.qy.toFixed(2) : '—'}
                    </td>
                    <td className="py-2 text-gray-500 dark:text-gray-400">{fl.source}</td>
                  </tr>

                  {expandedId === fl.id && (
                    <tr>
                      <td colSpan={8} className="p-0">
                        <FluorophoreDetail fluorophore={fl} />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="mt-4 flex items-center justify-between text-sm">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="rounded border border-gray-300 dark:border-gray-600 px-3 py-1 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40"
            >
              Previous
            </button>
            <span className="text-gray-500 dark:text-gray-400">
              Page {page + 1} of {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="rounded border border-gray-300 dark:border-gray-600 px-3 py-1 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        )}
      </div>

      {/* ── Right: overlay sidebar (appears when ≥1 item selected) ── */}
      {overlayMap.size > 0 && (
        <div className="w-80 shrink-0 sticky top-6">
          <OverlaySidebar
            overlayMap={overlayMap}
            onRemove={removeFromOverlay}
            onClear={() => setOverlayMap(new Map())}
          />
        </div>
      )}

      {showFpbaseModal && <FpbaseFetchModal onClose={() => setShowFpbaseModal(false)} />}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Detail panel shown when a row is expanded
// ---------------------------------------------------------------------------

function FluorophoreDetail({ fluorophore }: { fluorophore: Fluorophore }) {
  const { data: spectraData, isLoading: spectraLoading } = useFluorophoreSpectra(
    fluorophore.has_spectra ? fluorophore.id : ''
  )
  const { data: compatData, isLoading: compatLoading } = useInstrumentCompatibility(
    fluorophore.id
  )

  return (
    <div className="bg-gray-50 dark:bg-gray-800/60 border-b border-gray-200 dark:border-gray-700 px-6 py-4">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Metadata card */}
        <div>
          <h4 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
            {fluorophore.name}
          </h4>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            <MetaRow label="Type" value={fluorophore.fluor_type} />
            <MetaRow label="Source" value={fluorophore.source} />
            <MetaRow
              label="Ex Max"
              value={fluorophore.ex_max_nm !== null && fluorophore.ex_max_nm !== undefined ? fluorophore.ex_max_nm.toFixed(0) + ' nm' : null}
            />
            <MetaRow
              label="Em Max"
              value={fluorophore.em_max_nm !== null && fluorophore.em_max_nm !== undefined ? fluorophore.em_max_nm.toFixed(0) + ' nm' : null}
            />
            <MetaRow
              label="Ext Coeff"
              value={fluorophore.ext_coeff !== null && fluorophore.ext_coeff !== undefined ? fluorophore.ext_coeff.toLocaleString() + ' M\u207bcm\u207b' : null}
            />
            <MetaRow
              label="Quantum Yield"
              value={fluorophore.qy !== null && fluorophore.qy !== undefined ? fluorophore.qy.toFixed(3) : null}
            />
            <MetaRow
              label="Lifetime"
              value={fluorophore.lifetime_ns !== null && fluorophore.lifetime_ns !== undefined ? fluorophore.lifetime_ns.toFixed(2) + ' ns' : null}
            />
            <MetaRow label="Oligomerization" value={fluorophore.oligomerization} />
            <MetaRow label="Switch Type" value={fluorophore.switch_type} />
            <MetaRow label="Has Spectra" value={fluorophore.has_spectra ? 'Yes' : 'No'} />
          </dl>
        </div>

        {/* Spectra chart */}
        <div>
          <h4 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300">Spectra</h4>
          {!fluorophore.has_spectra ? (
            <p className="text-xs text-gray-400 dark:text-gray-500">No spectral data available.</p>
          ) : spectraLoading ? (
            <p className="text-xs text-gray-400 dark:text-gray-500">Loading spectra...</p>
          ) : spectraData && Object.keys(spectraData.spectra).length > 0 ? (
            <SpectraViewer
              fluorophores={[{ name: spectraData.name, spectra: spectraData.spectra }]}
              mode="single"
            />
          ) : (
            <p className="text-xs text-gray-400 dark:text-gray-500">Spectra unavailable.</p>
          )}
        </div>
      </div>

      {/* Instrument compatibility */}
      <div className="mt-4">
        <h4 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
          Instrument Compatibility
        </h4>
        {compatLoading ? (
          <p className="text-xs text-gray-400 dark:text-gray-500">Loading compatibility...</p>
        ) : compatData && compatData.instrument_compatibilities.length === 0 ? (
          <p className="text-xs text-gray-400 dark:text-gray-500">
            No instruments in database. Add an instrument to see compatibility.
          </p>
        ) : compatData ? (
          <div className="overflow-x-auto">
            <table className="text-xs w-full border-collapse">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400">
                  <th className="py-1 text-left font-medium pr-4">Instrument</th>
                  <th className="py-1 text-left font-medium pr-4">Best Laser</th>
                  <th className="py-1 text-left font-medium pr-4">Ex Eff.</th>
                  <th className="py-1 text-left font-medium pr-4">Best Detector</th>
                  <th className="py-1 text-left font-medium">Coll. Eff.</th>
                </tr>
              </thead>
              <tbody>
                {compatData.instrument_compatibilities.map((inst) => {
                  const bestLaser = inst.laser_lines.reduce(
                    (best, l) =>
                      l.excitation_efficiency > (best?.excitation_efficiency ?? -1) ? l : best,
                    null as typeof inst.laser_lines[0] | null
                  )
                  const bestDet = inst.detectors.reduce(
                    (best, d) =>
                      d.collection_efficiency > (best?.collection_efficiency ?? -1) ? d : best,
                    null as typeof inst.detectors[0] | null
                  )
                  return (
                    <tr
                      key={inst.instrument_id}
                      className="border-b border-gray-100 dark:border-gray-700"
                    >
                      <td className="py-1 pr-4 text-gray-700 dark:text-gray-300">
                        {inst.instrument_name}
                      </td>
                      <td className="py-1 pr-4 text-gray-600 dark:text-gray-400">
                        {bestLaser ? bestLaser.wavelength_nm + ' nm' : '—'}
                      </td>
                      <td className="py-1 pr-4 text-gray-600 dark:text-gray-400">
                        {bestLaser
                          ? (bestLaser.excitation_efficiency * 100).toFixed(1) + '%'
                          : '—'}
                      </td>
                      <td className="py-1 pr-4 text-gray-600 dark:text-gray-400">
                        {bestDet
                          ? (bestDet.name ?? bestDet.center_nm + '/' + bestDet.bandwidth_nm)
                          : '—'}
                      </td>
                      <td className="py-1 text-gray-600 dark:text-gray-400">
                        {bestDet
                          ? (bestDet.collection_efficiency * 100).toFixed(1) + '%'
                          : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </div>
  )
}

function MetaRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <>
      <dt className="text-gray-500 dark:text-gray-400">{label}</dt>
      <dd className="text-gray-700 dark:text-gray-300">{value ?? '—'}</dd>
    </>
  )
}

// ---------------------------------------------------------------------------
// Right sidebar: spectra overlay comparison
// ---------------------------------------------------------------------------

type VisibleTypes = 'EX' | 'EM' | 'both'

function TypeToggle({
  value,
  onChange,
}: {
  value: VisibleTypes
  onChange: (v: VisibleTypes) => void
}) {
  return (
    <div className="flex rounded border border-gray-300 dark:border-gray-600 overflow-hidden text-xs">
      {(['EX', 'EM', 'both'] as VisibleTypes[]).map((t) => (
        <button
          key={t}
          onClick={() => onChange(t)}
          className={
            'px-2 py-0.5 ' +
            (value === t
              ? 'bg-blue-600 text-white'
              : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600')
          }
        >
          {t === 'both' ? 'Both' : t}
        </button>
      ))}
    </div>
  )
}

function OverlaySidebar({
  overlayMap,
  onRemove,
  onClear,
}: {
  overlayMap: Map<string, string>
  onRemove: (id: string) => void
  onClear: () => void
}) {
  const ids = Array.from(overlayMap.keys())
  const { data: batchData, isLoading } = useBatchSpectra(ids)
  const [visibleTypes, setVisibleTypes] = useState<VisibleTypes>('both')
  const [isFullscreen, setIsFullscreen] = useState(false)
  const escRef = useRef<((e: KeyboardEvent) => void) | null>(null)

  useEffect(() => {
    if (isFullscreen) {
      const handler = (e: KeyboardEvent) => {
        if (e.key === 'Escape') setIsFullscreen(false)
      }
      escRef.current = handler
      document.addEventListener('keydown', handler)
      return () => document.removeEventListener('keydown', handler)
    }
  }, [isFullscreen])

  const fluorophores = ids
    .map((id) => {
      const spectra = batchData?.[id] as SpectraData | undefined
      if (!spectra) return null
      return { name: overlayMap.get(id) ?? id, spectra }
    })
    .filter((f): f is { name: string; spectra: SpectraData } => f !== null)

  const chartSection = (fullscreen: boolean) => {
    if (ids.length < 2) {
      return (
        <p className="text-xs text-gray-400 dark:text-gray-500 py-1">
          Select {2 - ids.length} more to compare.
        </p>
      )
    }
    if (isLoading) {
      return <p className="text-xs text-gray-400 dark:text-gray-500 py-1">Loading spectra...</p>
    }
    if (fluorophores.length >= 2) {
      return (
        <SpectraViewer
          fluorophores={fluorophores}
          mode="overlay"
          visibleTypes={visibleTypes}
          className={fullscreen ? 'h-[55vh] w-full' : 'h-56 w-full'}
        />
      )
    }
    return (
      <p className="text-xs text-gray-400 dark:text-gray-500 py-1">
        Spectra unavailable for selected fluorophores.
      </p>
    )
  }

  return (
    <>
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 px-4 py-3">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">
            Spectra Overlay
          </h3>
          <div className="flex items-center gap-2">
            <TypeToggle value={visibleTypes} onChange={setVisibleTypes} />
            <button
              onClick={() => setIsFullscreen(true)}
              title="Fullscreen"
              className="rounded p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              aria-label="Expand to fullscreen"
            >
              {/* expand icon */}
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4h4M20 8V4h-4M4 16v4h4M20 16v4h-4" />
              </svg>
            </button>
            <button
              onClick={onClear}
              className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            >
              Clear all
            </button>
          </div>
        </div>

        {/* Selected fluorophore chips */}
        <ul className="border-b border-gray-100 dark:border-gray-700 px-4 py-2 space-y-1">
          {ids.map((id) => (
            <li key={id} className="flex items-center justify-between gap-2 text-xs">
              <span className="truncate text-gray-700 dark:text-gray-300">
                {overlayMap.get(id)}
              </span>
              <button
                onClick={() => onRemove(id)}
                className="shrink-0 rounded px-1 text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                title="Remove"
                aria-label={'Remove ' + overlayMap.get(id)}
              >
                ×
              </button>
            </li>
          ))}
        </ul>

        {/* Chart area */}
        <div className="px-4 py-3">{chartSection(false)}</div>
      </div>

      {/* Fullscreen modal */}
      {isFullscreen &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6"
            onClick={() => setIsFullscreen(false)}
          >
            <div
              className="w-full max-w-5xl rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal header */}
              <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 px-6 py-3">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                  Spectra Overlay
                </h3>
                <div className="flex items-center gap-3">
                  <TypeToggle value={visibleTypes} onChange={setVisibleTypes} />
                  <button
                    onClick={() => setIsFullscreen(false)}
                    className="rounded p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                    aria-label="Close fullscreen"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Chip list */}
              <div className="flex flex-wrap gap-2 px-6 py-3 border-b border-gray-100 dark:border-gray-700">
                {ids.map((id) => (
                  <span
                    key={id}
                    className="inline-flex items-center gap-1 rounded-full bg-gray-100 dark:bg-gray-700 px-2.5 py-0.5 text-xs text-gray-700 dark:text-gray-300"
                  >
                    {overlayMap.get(id)}
                    <button
                      onClick={() => onRemove(id)}
                      className="text-gray-400 hover:text-red-500 dark:hover:text-red-400"
                      aria-label={'Remove ' + overlayMap.get(id)}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>

              {/* Chart */}
              <div className="px-6 py-4">{chartSection(true)}</div>
            </div>
          </div>,
          document.body
        )}
    </>
  )
}
