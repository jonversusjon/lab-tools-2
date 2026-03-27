import { useMemo, useState } from 'react'
import { useFluorophores, useFluorophoreSpectra, useBatchSpectra } from '@/hooks/useFluorophores'
import SpectraViewer from '@/components/spectra/SpectraViewer'
import FpbaseFetchModal from './FpbaseFetchModal'

type SortKey = 'name' | 'excitation_max_nm' | 'emission_max_nm' | 'source'
type SortDir = 'asc' | 'desc'

export default function FluorophoreTable() {
  const { data, isLoading, error } = useFluorophores(0, 500)
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [showOverlay, setShowOverlay] = useState(false)
  const [showFpbaseModal, setShowFpbaseModal] = useState(false)

  const { data: spectraData } = useFluorophoreSpectra(selectedId ?? '')

  const items = data?.items ?? []

  const sorted = useMemo(() => {
    const copy = [...items]
    copy.sort((a, b) => {
      const av = a[sortKey]
      const bv = b[sortKey]
      if (typeof av === 'string' && typeof bv === 'string') {
        return sortDir === 'asc'
          ? av.localeCompare(bv)
          : bv.localeCompare(av)
      }
      return sortDir === 'asc'
        ? (av as number) - (bv as number)
        : (bv as number) - (av as number)
    })
    return copy
  }, [items, sortKey, sortDir])

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const toggleCheck = (id: string) => {
    const next = new Set(checked)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setChecked(next)
    if (next.size < 2) setShowOverlay(false)
  }

  const overlayFluorophores = useMemo(() => {
    if (!showOverlay) return []
    return items
      .filter((f) => checked.has(f.id))
      .map((f) => ({
        name: f.name,
        id: f.id,
      }))
  }, [showOverlay, items, checked])

  if (isLoading) return <p className="text-gray-500">Loading fluorophores...</p>
  if (error) return <p className="text-red-600">Failed to load fluorophores.</p>

  const sortArrow = (key: SortKey) => {
    if (key !== sortKey) return ''
    return sortDir === 'asc' ? ' \u25B2' : ' \u25BC'
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Fluorophores</h1>
        <div className="flex gap-2">
          {checked.size >= 2 && (
            <button
              onClick={() => setShowOverlay(true)}
              className="rounded bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700"
            >
              View Overlay ({checked.size})
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

      <table className="w-full border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-gray-500">
            <th className="w-8 py-2" />
            <th
              className="cursor-pointer py-2 font-medium hover:text-gray-800"
              onClick={() => handleSort('name')}
            >
              Name{sortArrow('name')}
            </th>
            <th
              className="cursor-pointer py-2 font-medium hover:text-gray-800"
              onClick={() => handleSort('excitation_max_nm')}
            >
              Ex Max (nm){sortArrow('excitation_max_nm')}
            </th>
            <th
              className="cursor-pointer py-2 font-medium hover:text-gray-800"
              onClick={() => handleSort('emission_max_nm')}
            >
              Em Max (nm){sortArrow('emission_max_nm')}
            </th>
            <th
              className="cursor-pointer py-2 font-medium hover:text-gray-800"
              onClick={() => handleSort('source')}
            >
              Source{sortArrow('source')}
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 && (
            <tr>
              <td colSpan={5} className="py-6 text-center text-gray-400">
                No fluorophores found.
              </td>
            </tr>
          )}
          {sorted.map((fl) => (
            <tr
              key={fl.id}
              className={
                'border-b border-gray-100 hover:bg-gray-50' +
                (selectedId === fl.id ? ' bg-blue-50' : '')
              }
            >
              <td className="py-2 text-center">
                <input
                  type="checkbox"
                  checked={checked.has(fl.id)}
                  onChange={() => toggleCheck(fl.id)}
                  onClick={(e) => e.stopPropagation()}
                />
              </td>
              <td
                className="cursor-pointer py-2 font-medium text-gray-900"
                onClick={() =>
                  setSelectedId(selectedId === fl.id ? null : fl.id)
                }
              >
                {fl.name}
              </td>
              <td className="py-2 text-gray-600">{fl.excitation_max_nm}</td>
              <td className="py-2 text-gray-600">{fl.emission_max_nm}</td>
              <td className="py-2 text-gray-500">{fl.source}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {selectedId && spectraData?.spectra && (
        <div className="mt-4 rounded border border-gray-200 bg-white p-4">
          <h3 className="mb-2 text-sm font-semibold text-gray-700">
            {spectraData.name} — Spectra
          </h3>
          <SpectraViewer
            fluorophores={[
              {
                name: spectraData.name,
                spectra: spectraData.spectra,
              },
            ]}
            mode="single"
          />
        </div>
      )}

      {showOverlay && overlayFluorophores.length >= 2 && (
        <OverlayPanel
          fluorophoreIds={overlayFluorophores.map((f) => f.id)}
          fluorophoreNames={overlayFluorophores.map((f) => f.name)}
          onClose={() => setShowOverlay(false)}
        />
      )}

      {showFpbaseModal && (
        <FpbaseFetchModal onClose={() => setShowFpbaseModal(false)} />
      )}
    </div>
  )
}

function OverlayPanel({
  fluorophoreIds,
  fluorophoreNames,
  onClose,
}: {
  fluorophoreIds: string[]
  fluorophoreNames: string[]
  onClose: () => void
}) {
  const { data: batchData } = useBatchSpectra(fluorophoreIds)

  if (!batchData) return <p className="mt-4 text-sm text-gray-500">Loading spectra...</p>

  const fluorophores = fluorophoreIds
    .map((id, i) => {
      const spectra = batchData[id]
      if (!spectra) return null
      return { name: fluorophoreNames[i], spectra }
    })
    .filter((f): f is NonNullable<typeof f> => f !== null)

  return (
    <div className="mt-4 rounded border border-gray-200 bg-white p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">
          Spectra Overlay ({fluorophores.length} fluorophores)
        </h3>
        <button
          onClick={onClose}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          Close
        </button>
      </div>
      <SpectraViewer fluorophores={fluorophores} mode="overlay" />
    </div>
  )
}
