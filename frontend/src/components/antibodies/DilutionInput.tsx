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
      <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
        {label}
      </label>
      <div className="flex items-center gap-0">
        <span className="rounded-l border border-r-0 border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-600 px-2 py-2 text-sm text-gray-500 dark:text-gray-300">
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
            'w-full rounded-r border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-2 py-2 text-sm dark:text-gray-100 focus:border-blue-500 focus:outline-none' +
            (parseError ? ' border-red-400 dark:border-red-500' : '')
          }
        />
        {showRawHint && (
          <span
            className="ml-1 text-gray-400 cursor-help"
            title={'Original: ' + rawText}
          >
            &#9432;
          </span>
        )}
      </div>
      {parseError && (
        <p className="mt-0.5 text-xs text-red-500">Could not parse dilution</p>
      )}
    </div>
  )
}
