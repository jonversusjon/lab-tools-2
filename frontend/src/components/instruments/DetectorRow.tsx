interface DetectorFormData {
  filter_midpoint: number
  filter_width: number
  name: string
}

interface DetectorRowProps {
  detector: DetectorFormData
  onChange: (updated: DetectorFormData) => void
  onRemove: () => void
}

export default function DetectorRow({ detector, onChange, onRemove }: DetectorRowProps) {
  const low = detector.filter_midpoint - Math.floor(detector.filter_width / 2)
  const high = detector.filter_midpoint + Math.floor(detector.filter_width / 2)

  return (
    <div className="flex items-center gap-3 py-1.5">
      <div className="flex items-center gap-1.5">
        <input
          type="number"
          value={detector.filter_midpoint || ''}
          onChange={(e) =>
            onChange({ ...detector, filter_midpoint: parseInt(e.target.value) || 0 })
          }
          placeholder="Midpoint"
          className="w-20 rounded border border-gray-300 px-2 py-1 text-sm"
          min={1}
        />
        <span className="text-gray-400">/</span>
        <input
          type="number"
          value={detector.filter_width || ''}
          onChange={(e) =>
            onChange({ ...detector, filter_width: parseInt(e.target.value) || 0 })
          }
          placeholder="Width"
          className="w-16 rounded border border-gray-300 px-2 py-1 text-sm"
          min={1}
        />
      </div>
      <input
        type="text"
        value={detector.name}
        onChange={(e) => onChange({ ...detector, name: e.target.value })}
        placeholder="Name (optional)"
        className="w-32 rounded border border-gray-300 px-2 py-1 text-sm"
      />
      {detector.filter_midpoint > 0 && detector.filter_width > 0 && (
        <span className="text-xs text-gray-400" data-testid="bandpass-range">
          {low}&ndash;{high} nm
        </span>
      )}
      <button
        onClick={onRemove}
        className="ml-auto text-sm text-red-500 hover:text-red-700"
        aria-label="Remove detector"
      >
        Remove
      </button>
    </div>
  )
}

export type { DetectorFormData }
