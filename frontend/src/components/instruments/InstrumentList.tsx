import { useNavigate } from 'react-router-dom'
import { useInstruments } from '@/hooks/useInstruments'

export default function InstrumentList() {
  const { data, isLoading, error } = useInstruments()
  const navigate = useNavigate()

  if (isLoading) return <p className="text-gray-500">Loading instruments...</p>
  if (error) return <p className="text-red-600">Failed to load instruments.</p>

  const instruments = data?.items ?? []

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Instruments</h1>
        <button
          onClick={() => navigate('/instruments/new')}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          New Instrument
        </button>
      </div>

      {instruments.length === 0 ? (
        <p className="text-gray-500">No instruments yet.</p>
      ) : (
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-gray-500">
              <th className="py-2 font-medium">Name</th>
              <th className="py-2 font-medium">Lasers</th>
              <th className="py-2 font-medium">Detectors</th>
            </tr>
          </thead>
          <tbody>
            {instruments.map((inst) => {
              const totalDetectors = inst.lasers.reduce(
                (sum, l) => sum + l.detectors.length,
                0
              )
              return (
                <tr
                  key={inst.id}
                  onClick={() => navigate('/instruments/' + inst.id)}
                  className="cursor-pointer border-b border-gray-100 hover:bg-gray-50"
                >
                  <td className="py-3 font-medium text-gray-900">{inst.name}</td>
                  <td className="py-3 text-gray-600">{inst.lasers.length}</td>
                  <td className="py-3 text-gray-600">{totalDetectors}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}
