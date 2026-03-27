import { useEffect, useState } from 'react'
import {
  useFluorophores,
  useFluorophoreSpectra,
  useInstrumentCompatibility,
  useBatchSpectra,
} from '@/hooks/useFluorophores'
import SpectraViewer from '@/components/spectra/SpectraViewer'
import FpbaseFetchModal from './FpbaseFetchModal'
import type { Fluorophore } from '@/types'

const PAGE_SIZE = 50

export default function FluorophoreBrowser() {
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<'all' | 'protein' | 'dye'>('all')
  const [hasSpectraOnly, setHasSpectraOnly] = useState(false)
  const [page, setPage] = useState(0)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [overlayIds, setOverlayIds] = useState<Set<string>>(new Set())
  const [showOverlay, setShowOverlay] = useState(false)
  const [showFpbaseModal, setShowFpbaseModal] = useState(false)

  // Debounce search input
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search)
      setPage(0)
    }, 300)
    return () => clearTimeout(t)
  }, [search])

  // Reset page when filters change
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

  const toggleOverlay = (id: string) => {
    setOverlayIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
    setShowOverlay(false)
  }

  const handleRowClick = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id))
  }

  if (isLoading) {
    return <p className="text-gray-500 dark:text-gray-400">Loading fluorophores...</p>
  }
  if (error) {
    return <p className="text-red-600">Failed to load fluorophores.</p>
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold dark:text-gray-100">Fluorophores</h1>
        <div className="flex gap-2">
          {overlayIds.size >= 2 && (
            <button
              onClick={() => setShowOverlay(true)}
              className="rounded bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700"
            >
              View Overlay ({overlayIds.size})
            </button>
          )}
          <button
            onClick={() => setShowFpbaseModal(true)}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Fetch from FPbase
          </button>
        </div>
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
              <>
                <tr
                  key={fl.id}
                  className={
                    'border-b border-gray-100 dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800' +
                    (expandedId === fl.id ? ' bg-blue-50 dark:bg-blue-900/20' : '')
                  }
                  onClick={() => handleRowClick(fl.id)}
                >
                  <td className="py-2 text-center" onClick={(e) => e.stopPropagation()}>
                    {fl.has_spectra && (
                      <input
                        type="checkbox"
                        checked={overlayIds.has(fl.id)}
                        onChange={() => toggleOverlay(fl.id)}
                        title="Add to overlay"
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
                    {fl.ex_max_nm !== null ? fl.ex_max_nm.toFixed(0) + ' nm' : '—'}
                  </td>
                  <td className="py-2 text-gray-600 dark:text-gray-400">
                    {fl.em_max_nm !== null ? fl.em_max_nm.toFixed(0) + ' nm' : '—'}
                  </td>
                  <td className="py-2 text-gray-600 dark:text-gray-400">
                    {fl.ext_coeff !== null ? fl.ext_coeff.toLocaleString() : '—'}
                  </td>
                  <td className="py-2 text-gray-600 dark:text-gray-400">
                    {fl.qy !== null ? fl.qy.toFixed(2) : '—'}
                  </td>
                  <td className="py-2 text-gray-500 dark:text-gray-400">{fl.source}</td>
                </tr>

                {expandedId === fl.id && (
                  <tr key={fl.id + '-detail'}>
                    <td colSpan={8} className="p-0">
                      <FluorophoreDetail fluorophore={fl} />
                    </td>
                  </tr>
                )}
              </>
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

      {/* Spectra overlay panel */}
      {showOverlay && overlayIds.size >= 2 && (
        <OverlayPanel
          ids={Array.from(overlayIds)}
          names={items
            .filter((f) => overlayIds.has(f.id))
            .map((f) => f.name)}
          onClose={() => setShowOverlay(false)}
        />
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
              value={fluorophore.ex_max_nm !== null ? fluorophore.ex_max_nm.toFixed(0) + ' nm' : null}
            />
            <MetaRow
              label="Em Max"
              value={fluorophore.em_max_nm !== null ? fluorophore.em_max_nm.toFixed(0) + ' nm' : null}
            />
            <MetaRow
              label="Ext Coeff"
              value={fluorophore.ext_coeff !== null ? fluorophore.ext_coeff.toLocaleString() + ' M\u207bcm\u207b' : null}
            />
            <MetaRow
              label="Quantum Yield"
              value={fluorophore.qy !== null ? fluorophore.qy.toFixed(3) : null}
            />
            <MetaRow
              label="Lifetime"
              value={fluorophore.lifetime_ns !== null ? fluorophore.lifetime_ns.toFixed(2) + ' ns' : null}
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
// Overlay panel for comparing emission spectra
// ---------------------------------------------------------------------------

function OverlayPanel({
  ids,
  names,
  onClose,
}: {
  ids: string[]
  names: string[]
  onClose: () => void
}) {
  const { data: batchData } = useBatchSpectra(ids)

  if (!batchData) {
    return <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">Loading spectra...</p>
  }

  const fluorophores = ids
    .map((id, i) => {
      const spectra = batchData[id]
      if (!spectra) return null
      return { name: names[i] ?? id, spectra }
    })
    .filter((f): f is NonNullable<typeof f> => f !== null)

  return (
    <div className="mt-4 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
          Emission Overlay ({fluorophores.length} fluorophores)
        </h3>
        <button
          onClick={onClose}
          className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
        >
          Close
        </button>
      </div>
      <SpectraViewer fluorophores={fluorophores} mode="overlay" />
    </div>
  )
}
