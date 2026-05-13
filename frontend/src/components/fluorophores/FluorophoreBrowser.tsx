import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  useFluorophores,
  useFluorophoreSpectra,
  useInstrumentCompatibility,
  useMicroscopeCompatibility,
  useBatchSpectra,
  useToggleFluorophoreFavorite,
} from '@/hooks/useFluorophores'
import { useRecentInstruments, useRecordInstrumentView } from '@/hooks/useInstruments'
import { useRecentMicroscopes, useRecordMicroscopeView } from '@/hooks/useMicroscopes'
import { tokenSearch } from '@/utils/search'
import SpectraViewer from '@/components/spectra/SpectraViewer'
import FpbaseFetchModal from './FpbaseFetchModal'
import FluorophoreImportWizard from './FluorophoreImportWizard'
import FavoriteButton from '@/components/antibodies/FavoriteButton'
import type { Fluorophore, InstrumentCompatibility, MicroscopeCompatibility, SpectraData } from '@/types'

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
  const toggleFavorite = useToggleFluorophoreFavorite()
  const [showFpbaseModal, setShowFpbaseModal] = useState(false)
  const [showImportWizard, setShowImportWizard] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search)
      setPage(0)
    }, 300)
    return () => clearTimeout(t)
  }, [search])

  useEffect(() => { setPage(0) }, [typeFilter, hasSpectraOnly])

  const isSearching = debouncedSearch.trim().length > 0

  const { data, isLoading, error } = useFluorophores({
    skip: isSearching ? 0 : page * PAGE_SIZE,
    limit: isSearching ? 2000 : PAGE_SIZE,
    type: typeFilter !== 'all' ? typeFilter : undefined,
    has_spectra: hasSpectraOnly ? true : undefined,
  })

  const items = useMemo(() => {
    const fetched = data?.items ?? []
    if (!isSearching) return fetched
    return tokenSearch(fetched, debouncedSearch, (fl) => [
      { value: fl.name, weight: 3 },
      { value: fl.fluor_type, weight: 1 },
      { value: fl.source, weight: 0.5 },
      { value: fl.ex_max_nm != null ? String(fl.ex_max_nm) : null, weight: 0.5 },
      { value: fl.em_max_nm != null ? String(fl.em_max_nm) : null, weight: 0.5 },
    ])
  }, [data?.items, isSearching, debouncedSearch])

  const total = isSearching ? items.length : (data?.total ?? 0)
  const totalPages = isSearching ? 1 : Math.ceil(total / PAGE_SIZE)

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

  return (
    <div className="flex items-start gap-6">
      {/* ── Left: table area ─────────────────────────────────────── */}
      <div className="min-w-0 flex-1">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-foreground">Fluorophores</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowImportWizard(true)}
              className="rounded border border-border-strong px-4 py-2 text-sm font-medium text-foreground hover:bg-hover"
            >
              Import CSV / JSON
            </button>
            <button
              onClick={() => setShowFpbaseModal(true)}
              className="rounded bg-accent hover:bg-accent-hover text-accent-foreground px-4 py-2 text-sm font-medium"
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
            className="rounded border border-border-strong bg-elevated px-3 py-1.5 text-sm text-foreground w-52"
          />
          <div className="flex rounded border border-border-strong overflow-hidden text-sm">
            {(['all', 'protein', 'dye'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTypeFilter(t)}
                className={
                  'px-3 py-1.5 capitalize ' +
                  (typeFilter === t
                    ? 'bg-accent text-accent-foreground'
                    : 'bg-elevated text-foreground hover:bg-hover')
                }
              >
                {t}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-1.5 text-sm text-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={hasSpectraOnly}
              onChange={(e) => setHasSpectraOnly(e.target.checked)}
            />
            Has spectra
          </label>
          <span className="text-xs text-foreground-subtle ml-auto">
            {total.toLocaleString()} fluorophores
          </span>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-border text-foreground-muted text-xs uppercase tracking-wide">
                <th className="w-8 py-2" />
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
              {isLoading ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-foreground-subtle">
                    Loading fluorophores...
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-danger">
                    Failed to load fluorophores.
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-foreground-subtle">
                    No fluorophores found.
                  </td>
                </tr>
              ) : null}
              {!isLoading && !error && items.map((fl) => (
                <React.Fragment key={fl.id}>
                  <tr
                    className={
                      'border-b border-border cursor-pointer hover:bg-hover' +
                      (expandedId === fl.id ? ' bg-accent-soft' : '')
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
                    <td className="py-2 text-center" onClick={(e) => e.stopPropagation()}>
                      <FavoriteButton
                        isFavorite={fl.is_favorite}
                        onClick={() =>
                          toggleFavorite.mutate({ id: fl.id, is_favorite: !fl.is_favorite })
                        }
                      />
                    </td>
                    <td className="py-2 font-medium text-foreground">
                      {fl.name}
                      {fl.has_spectra && (
                        <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-success" title="Has spectra" />
                      )}
                    </td>
                    <td className="py-2 text-foreground-muted capitalize">
                      {fl.fluor_type ?? '—'}
                    </td>
                    <td className="py-2 text-foreground-muted">
                      {fl.ex_max_nm !== null && fl.ex_max_nm !== undefined ? fl.ex_max_nm.toFixed(0) + ' nm' : '—'}
                    </td>
                    <td className="py-2 text-foreground-muted">
                      {fl.em_max_nm !== null && fl.em_max_nm !== undefined ? fl.em_max_nm.toFixed(0) + ' nm' : '—'}
                    </td>
                    <td className="py-2 text-foreground-muted">
                      {fl.ext_coeff !== null && fl.ext_coeff !== undefined ? fl.ext_coeff.toLocaleString() : '—'}
                    </td>
                    <td className="py-2 text-foreground-muted">
                      {fl.qy !== null && fl.qy !== undefined ? fl.qy.toFixed(2) : '—'}
                    </td>
                    <td className="py-2 text-foreground-muted">{fl.source}</td>
                  </tr>

                  {expandedId === fl.id && (
                    <tr>
                      <td colSpan={9} className="p-0">
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
              className="rounded border border-border-strong px-3 py-1 text-foreground-muted hover:bg-hover disabled:opacity-40"
            >
              Previous
            </button>
            <span className="text-foreground-muted">
              Page {page + 1} of {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="rounded border border-border-strong px-3 py-1 text-foreground-muted hover:bg-hover disabled:opacity-40"
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
      {showImportWizard && (
        <FluorophoreImportWizard onClose={() => setShowImportWizard(false)} />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Detail panel shown when a row is expanded
// ---------------------------------------------------------------------------

function InstrumentCompatibilityCard({ compat }: { compat: InstrumentCompatibility }) {
  const exByWl = new Map(
    compat.laser_lines.map((l) => [l.wavelength_nm, l.excitation_efficiency])
  )
  let bestDet: typeof compat.detectors[0] | null = null
  let bestExEff = 0
  let bestScore = -1
  for (const d of compat.detectors) {
    const exEff = exByWl.get(d.laser_wavelength_nm) ?? 0
    const score = exEff * d.collection_efficiency
    if (score > bestScore) {
      bestScore = score
      bestDet = d
      bestExEff = exEff
    }
  }
  return (
    <tr className="border-b border-border">
      <td className="py-1 pr-4 text-foreground">
        {compat.instrument_name}
      </td>
      <td className="py-1 pr-4 text-foreground-muted">
        {bestDet ? bestDet.laser_wavelength_nm + ' nm' : '—'}
      </td>
      <td className="py-1 pr-4 text-foreground-muted">
        {bestDet ? (bestExEff * 100).toFixed(1) + '%' : '—'}
      </td>
      <td className="py-1 pr-4 text-foreground-muted">
        {bestDet ? (bestDet.name ?? bestDet.center_nm + '/' + bestDet.bandwidth_nm) : '—'}
      </td>
      <td className="py-1 text-foreground-muted">
        {bestDet ? (bestDet.collection_efficiency * 100).toFixed(1) + '%' : '—'}
      </td>
    </tr>
  )
}

function getBestInstrumentScore(compat: InstrumentCompatibility) {
  const exByWl = new Map(
    compat.laser_lines.map((l) => [l.wavelength_nm, l.excitation_efficiency])
  )
  let bestScore = -1
  for (const d of compat.detectors) {
    const exEff = exByWl.get(d.laser_wavelength_nm) ?? 0
    const score = exEff * d.collection_efficiency
    if (score > bestScore) {
      bestScore = score
    }
  }
  return bestScore
}

function TieredCompatibilityTable({ compatibilities }: { compatibilities: InstrumentCompatibility[] }) {
  const { data: recentIds = [] } = useRecentInstruments()
  const recordView = useRecordInstrumentView()
  const [showAll, setShowAll] = useState(false)

  const recentIdSet = useMemo(() => new Set(recentIds), [recentIds])

  const { favorites, recents, others } = useMemo(() => {
    const favs: InstrumentCompatibility[] = []
    const recs: InstrumentCompatibility[] = []
    const rest: InstrumentCompatibility[] = []
    for (const compat of compatibilities) {
      if (compat.is_favorite) {
        favs.push(compat)
      } else if (recentIdSet.has(compat.instrument_id)) {
        recs.push(compat)
      } else {
        rest.push(compat)
      }
    }

    const sortByScoreDesc = (a: InstrumentCompatibility, b: InstrumentCompatibility) => {
      return getBestInstrumentScore(b) - getBestInstrumentScore(a)
    }

    favs.sort(sortByScoreDesc)
    recs.sort(sortByScoreDesc)
    rest.sort(sortByScoreDesc)

    return { favorites: favs, recents: recs, others: rest }
  }, [compatibilities, recentIdSet])

  const tableHeader = (
    <thead>
      <tr className="border-b border-border-strong text-foreground-muted">
        <th className="py-1 text-left font-medium pr-4">Instrument</th>
        <th className="py-1 text-left font-medium pr-4">Best Laser</th>
        <th className="py-1 text-left font-medium pr-4">Ex Eff.</th>
        <th className="py-1 text-left font-medium pr-4">Best Detector</th>
        <th className="py-1 text-left font-medium">Coll. Eff.</th>
      </tr>
    </thead>
  )

  const noTiers = favorites.length === 0 && recents.length === 0

  if (noTiers) {
    return (
      <div className="overflow-x-auto">
        <table className="text-xs w-full border-collapse">
          {tableHeader}
          <tbody>
            {others.map((c) => (
              <InstrumentCompatibilityCard key={c.instrument_id} compat={c} />
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      {favorites.length > 0 && (
        <>
          <div className="mb-1 text-xs font-semibold text-foreground-muted uppercase tracking-wide">
            Favorites
          </div>
          <table className="text-xs w-full border-collapse">
            {tableHeader}
            <tbody>
              {favorites.map((c) => (
                <InstrumentCompatibilityCard key={c.instrument_id} compat={c} />
              ))}
            </tbody>
          </table>
        </>
      )}

      {favorites.length > 0 && recents.length > 0 && (
        <hr className="my-3 border-border" />
      )}

      {recents.length > 0 && (
        <>
          <div className="mb-1 text-xs font-semibold text-foreground-muted uppercase tracking-wide">
            Recent
          </div>
          <table className="text-xs w-full border-collapse">
            {tableHeader}
            <tbody>
              {recents.map((c) => (
                <InstrumentCompatibilityCard
                  key={c.instrument_id}
                  compat={c}
                />
              ))}
            </tbody>
          </table>
        </>
      )}

      {others.length > 0 && (
        <>
          <hr className="my-3 border-border" />
          <button
            onClick={() => {
              setShowAll(!showAll)
              if (!showAll) {
                others.forEach((c) => recordView.mutate(c.instrument_id))
              }
            }}
            className="flex items-center gap-1.5 text-xs text-accent hover:text-accent-hover"
          >
            <span>{showAll ? '▼' : '▶'}</span>
            {showAll ? 'Hide' : 'Show'} all instruments ({others.length})
          </button>
          {showAll && (
            <div className="mt-2">
              <table className="text-xs w-full border-collapse">
                {tableHeader}
                <tbody>
                  {others.map((c) => (
                    <InstrumentCompatibilityCard key={c.instrument_id} compat={c} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function MicroscopeCompatibilityCard({ compat }: { compat: MicroscopeCompatibility }) {
  const exByWl = new Map(
    compat.laser_lines.map((l) => [l.wavelength_nm, l.excitation_efficiency])
  )
  let bestFilter: typeof compat.filters[0] | null = null
  let bestExEff = 0
  let bestScore = -1
  for (const f of compat.filters) {
    const exEff = exByWl.get(f.laser_wavelength_nm) ?? 0
    const score = exEff * f.collection_efficiency
    if (score > bestScore) {
      bestScore = score
      bestFilter = f
      bestExEff = exEff
    }
  }
  return (
    <tr className="border-b border-border">
      <td className="py-1 pr-4 text-foreground">
        {compat.microscope_name}
      </td>
      <td className="py-1 pr-4 text-foreground-muted">
        {bestFilter ? bestFilter.laser_wavelength_nm + ' nm' : '—'}
      </td>
      <td className="py-1 pr-4 text-foreground-muted">
        {bestFilter ? (bestExEff * 100).toFixed(1) + '%' : '—'}
      </td>
      <td className="py-1 pr-4 text-foreground-muted">
        {bestFilter ? (bestFilter.name ?? bestFilter.center_nm + '/' + bestFilter.bandwidth_nm) : '—'}
      </td>
      <td className="py-1 text-foreground-muted">
        {bestFilter ? (bestFilter.collection_efficiency * 100).toFixed(1) + '%' : '—'}
      </td>
    </tr>
  )
}

function getBestMicroscopeScore(compat: MicroscopeCompatibility) {
  const exByWl = new Map(
    compat.laser_lines.map((l) => [l.wavelength_nm, l.excitation_efficiency])
  )
  let bestScore = -1
  for (const f of compat.filters) {
    const exEff = exByWl.get(f.laser_wavelength_nm) ?? 0
    const score = exEff * f.collection_efficiency
    if (score > bestScore) bestScore = score
  }
  return bestScore
}

function TieredMicroscopeCompatibilityTable({ compatibilities }: { compatibilities: MicroscopeCompatibility[] }) {
  const { data: recentIds = [] } = useRecentMicroscopes()
  const recordView = useRecordMicroscopeView()
  const [showAll, setShowAll] = useState(false)

  const recentIdSet = useMemo(() => new Set(recentIds), [recentIds])

  const { favorites, recents, others } = useMemo(() => {
    const favs: MicroscopeCompatibility[] = []
    const recs: MicroscopeCompatibility[] = []
    const rest: MicroscopeCompatibility[] = []
    for (const compat of compatibilities) {
      if (compat.is_favorite) favs.push(compat)
      else if (recentIdSet.has(compat.microscope_id)) recs.push(compat)
      else rest.push(compat)
    }
    const sortByScoreDesc = (a: MicroscopeCompatibility, b: MicroscopeCompatibility) =>
      getBestMicroscopeScore(b) - getBestMicroscopeScore(a)
    favs.sort(sortByScoreDesc)
    recs.sort(sortByScoreDesc)
    rest.sort(sortByScoreDesc)
    return { favorites: favs, recents: recs, others: rest }
  }, [compatibilities, recentIdSet])

  const tableHeader = (
    <thead>
      <tr className="border-b border-border-strong text-foreground-muted">
        <th className="py-1 text-left font-medium pr-4">Microscope</th>
        <th className="py-1 text-left font-medium pr-4">Best Laser</th>
        <th className="py-1 text-left font-medium pr-4">Ex Eff.</th>
        <th className="py-1 text-left font-medium pr-4">Best Filter</th>
        <th className="py-1 text-left font-medium">Coll. Eff.</th>
      </tr>
    </thead>
  )

  const noTiers = favorites.length === 0 && recents.length === 0

  if (noTiers) {
    return (
      <div className="overflow-x-auto">
        <table className="text-xs w-full border-collapse">
          {tableHeader}
          <tbody>
            {others.map((c) => (
              <MicroscopeCompatibilityCard key={c.microscope_id} compat={c} />
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      {favorites.length > 0 && (
        <>
          <div className="mb-1 text-xs font-semibold text-foreground-muted uppercase tracking-wide">
            Favorites
          </div>
          <table className="text-xs w-full border-collapse">
            {tableHeader}
            <tbody>
              {favorites.map((c) => (
                <MicroscopeCompatibilityCard key={c.microscope_id} compat={c} />
              ))}
            </tbody>
          </table>
        </>
      )}

      {favorites.length > 0 && recents.length > 0 && (
        <hr className="my-3 border-border" />
      )}

      {recents.length > 0 && (
        <>
          <div className="mb-1 text-xs font-semibold text-foreground-muted uppercase tracking-wide">
            Recent
          </div>
          <table className="text-xs w-full border-collapse">
            {tableHeader}
            <tbody>
              {recents.map((c) => (
                <MicroscopeCompatibilityCard key={c.microscope_id} compat={c} />
              ))}
            </tbody>
          </table>
        </>
      )}

      {others.length > 0 && (
        <>
          <hr className="my-3 border-border" />
          <button
            onClick={() => {
              setShowAll(!showAll)
              if (!showAll) {
                others.forEach((c) => recordView.mutate(c.microscope_id))
              }
            }}
            className="flex items-center gap-1.5 text-xs text-accent hover:text-accent-hover"
          >
            <span>{showAll ? '▼' : '▶'}</span>
            {showAll ? 'Hide' : 'Show'} all microscopes ({others.length})
          </button>
          {showAll && (
            <div className="mt-2">
              <table className="text-xs w-full border-collapse">
                {tableHeader}
                <tbody>
                  {others.map((c) => (
                    <MicroscopeCompatibilityCard key={c.microscope_id} compat={c} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function FluorophoreDetail({ fluorophore }: { fluorophore: Fluorophore }) {
  const { data: spectraData, isLoading: spectraLoading } = useFluorophoreSpectra(
    fluorophore.has_spectra ? fluorophore.id : ''
  )
  const { data: compatData, isLoading: compatLoading } = useInstrumentCompatibility(
    fluorophore.id
  )
  const { data: microscopeCompatData, isLoading: microscopeCompatLoading } = useMicroscopeCompatibility(
    fluorophore.id
  )

  return (
    <div className="bg-surface border-b border-border px-6 py-4">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Metadata card */}
        <div>
          <h4 className="mb-2 text-sm font-semibold text-foreground">
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
          <h4 className="mb-2 text-sm font-semibold text-foreground">Spectra</h4>
          {!fluorophore.has_spectra ? (
            <p className="text-xs text-foreground-subtle">No spectral data available.</p>
          ) : spectraLoading ? (
            <p className="text-xs text-foreground-subtle">Loading spectra...</p>
          ) : spectraData && Object.keys(spectraData.spectra).length > 0 ? (
            <>
              {/* TODO: Add toggleable Ex / Em curve controls above this chart.
                  Both curves should be shown by default, with small toggle buttons
                  (similar to the TypeToggle in the overlay sidebar) letting the user
                  turn the excitation curve and/or emission curve on or off
                  independently. */}
              <SpectraViewer
                fluorophores={[{ name: spectraData.name, spectra: spectraData.spectra }]}
                mode="single"
              />
            </>
          ) : (
            <p className="text-xs text-foreground-subtle">Spectra unavailable.</p>
          )}
        </div>
      </div>

      {/* Instrument compatibility */}
      <div className="mt-6">
        <h3 className="mb-4 text-base font-semibold text-foreground border-b border-border pb-2">
          Instrument Compatibility
        </h3>

        {/* Cytometers */}
        <div className="mb-6">
          <h4 className="mb-2 text-sm font-semibold text-foreground-muted uppercase tracking-wide">
            Flow Cytometers
          </h4>
          {compatLoading ? (
            <p className="text-xs text-foreground-subtle">Loading...</p>
          ) : compatData && compatData.instrument_compatibilities.length === 0 ? (
            <p className="text-xs text-foreground-subtle">
              No cytometers in database.
            </p>
          ) : compatData ? (
            <TieredCompatibilityTable compatibilities={compatData.instrument_compatibilities} />
          ) : null}
        </div>

        <hr className="border-border mb-6" />

        {/* Microscopes */}
        <div>
          <h4 className="mb-2 text-sm font-semibold text-foreground-muted uppercase tracking-wide">
            Microscopes
          </h4>
          {microscopeCompatLoading ? (
            <p className="text-xs text-foreground-subtle">Loading...</p>
          ) : microscopeCompatData && microscopeCompatData.microscope_compatibilities.length === 0 ? (
            <p className="text-xs text-foreground-subtle">
              No microscopes in database.
            </p>
          ) : microscopeCompatData ? (
            <TieredMicroscopeCompatibilityTable compatibilities={microscopeCompatData.microscope_compatibilities} />
          ) : null}
        </div>
      </div>
    </div>
  )
}

function MetaRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <>
      <dt className="text-foreground-muted">{label}</dt>
      <dd className="text-foreground">{value ?? '—'}</dd>
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
    <div className="flex rounded border border-border-strong overflow-hidden text-xs">
      {(['EX', 'EM', 'both'] as VisibleTypes[]).map((t) => (
        <button
          key={t}
          onClick={() => onChange(t)}
          className={
            'px-2 py-0.5 ' +
            (value === t
              ? 'bg-accent text-accent-foreground'
              : 'bg-elevated text-foreground-muted hover:bg-hover')
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
        <p className="text-xs text-foreground-subtle py-1">
          Select {2 - ids.length} more to compare.
        </p>
      )
    }
    if (isLoading) {
      return <p className="text-xs text-foreground-subtle py-1">Loading spectra...</p>
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
      <p className="text-xs text-foreground-subtle py-1">
        Spectra unavailable for selected fluorophores.
      </p>
    )
  }

  return (
    <>
      <div className="rounded-lg border border-border bg-elevated shadow-sm overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h3 className="text-sm font-semibold text-foreground">
            Spectra Overlay
          </h3>
          <div className="flex items-center gap-2">
            <TypeToggle value={visibleTypes} onChange={setVisibleTypes} />
            <button
              onClick={() => setIsFullscreen(true)}
              title="Fullscreen"
              className="rounded p-0.5 text-foreground-subtle hover:text-foreground-muted transition-colors"
              aria-label="Expand to fullscreen"
            >
              {/* expand icon */}
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4h4M20 8V4h-4M4 16v4h4M20 16v4h-4" />
              </svg>
            </button>
            <button
              onClick={onClear}
              className="text-xs text-foreground-subtle hover:text-foreground-muted transition-colors"
            >
              Clear all
            </button>
          </div>
        </div>

        {/* Selected fluorophore chips */}
        <ul className="border-b border-border px-4 py-2 space-y-1">
          {ids.map((id) => (
            <li key={id} className="flex items-center justify-between gap-2 text-xs">
              <span className="truncate text-foreground">
                {overlayMap.get(id)}
              </span>
              <button
                onClick={() => onRemove(id)}
                className="shrink-0 rounded px-1 text-foreground-subtle hover:text-danger transition-colors"
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
              className="w-full max-w-5xl rounded-xl border border-border bg-elevated shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal header */}
              <div className="flex items-center justify-between border-b border-border px-6 py-3">
                <h3 className="text-sm font-semibold text-foreground">
                  Spectra Overlay
                </h3>
                <div className="flex items-center gap-3">
                  <TypeToggle value={visibleTypes} onChange={setVisibleTypes} />
                  <button
                    onClick={() => setIsFullscreen(false)}
                    className="rounded p-0.5 text-foreground-subtle hover:text-foreground-muted transition-colors"
                    aria-label="Close fullscreen"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Chip list */}
              <div className="flex flex-wrap gap-2 px-6 py-3 border-b border-border">
                {ids.map((id) => (
                  <span
                    key={id}
                    className="inline-flex items-center gap-1 rounded-full bg-surface px-2.5 py-0.5 text-xs text-foreground"
                  >
                    {overlayMap.get(id)}
                    <button
                      onClick={() => onRemove(id)}
                      className="text-foreground-subtle hover:text-danger"
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
