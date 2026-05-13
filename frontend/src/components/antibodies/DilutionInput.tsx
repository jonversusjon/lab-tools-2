import { useState, useEffect } from 'react'
import { parseDilution, formatDilution } from '@/utils/dilutions'

interface DilutionInputProps {
  label: string
  value: number | null
  rawText: string | null
  onChange: (denominator: number | null) => void
}

export default function DilutionInput({
  label,
  value,
  rawText,
  onChange,
}: DilutionInputProps) {
  const [inputValue, setInputValue] = useState(value != null ? String(value) : '')
  const [parseError, setParseError] = useState(false)

  useEffect(() => {
    setInputValue(value != null ? String(value) : '')
    setParseError(false)
  }, [value])

  const handleBlur = () => {
    const text = inputValue.trim()
    if (!text) {
      onChange(null)
      setParseError(false)
      return
    }
    const parsed = parseDilution(text)
    if (parsed) {
      onChange(parsed.denominator)
      setInputValue(String(parsed.denominator))
      setParseError(false)
    } else {
      setParseError(true)
    }
  }

  const showRawHint = rawText && rawText !== formatDilution(value)

  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-foreground-muted">
        {label}
      </label>
      <div className="flex items-center gap-0">
        <span className="rounded-l border border-r-0 border-border-strong bg-surface px-2 py-2 text-sm text-foreground-muted">
          1:
        </span>
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleBlur()
          }}
          placeholder="e.g. 100"
          className={
            'w-full rounded-r border border-border bg-elevated text-foreground px-2 py-2 text-sm focus:border-blue-500 focus:outline-none' +
            (parseError ? ' border-danger' : '')
          }
        />
        {showRawHint && (
          <span
            className="ml-1 text-foreground-subtle cursor-help"
            title={'Original: ' + rawText}
          >
            &#9432;
          </span>
        )}
      </div>
      {parseError && (
        <p className="mt-0.5 text-xs text-danger">Could not parse dilution</p>
      )}
    </div>
  )
}
