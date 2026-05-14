import { useState } from 'react'
import { useBlockFramesConfig } from '@/hooks/useBlockFramesConfig'
import type { BlockFramesConfig, FrameMode } from '@/types'

interface BlockTypeRow {
  key: keyof BlockFramesConfig
  label: string
}

const VISIBLE_BLOCK_TYPES: BlockTypeRow[] = [
  { key: 'heading', label: 'Heading' },
  { key: 'paragraph', label: 'Paragraph' },
  { key: 'bulletList', label: 'Bulleted list' },
  { key: 'orderedList', label: 'Numbered list' },
  { key: 'horizontalRule', label: 'Divider' },
  { key: 'callout', label: 'Callout' },
  { key: 'column_list', label: 'Column layout' },
  { key: 'column', label: 'Column' },
  { key: 'flow_panel', label: 'Flow panel' },
  { key: 'if_panel', label: 'IF panel' },
  { key: 'table', label: 'Table' },
]

interface ModeOption {
  value: FrameMode
  label: string
  disabled?: boolean
  tooltip?: string
}

const MODES: ModeOption[] = [
  { value: 'always', label: 'Always' },
  { value: 'empty', label: 'Empty' },
  { value: 'clean', label: 'Clean', disabled: true, tooltip: 'Available in a future version' },
  { value: 'never', label: 'Never' },
]

type RowErrors = Partial<Record<keyof BlockFramesConfig, string | null>>

export default function BlockFramesSection() {
  const { config, setConfig, isLoading } = useBlockFramesConfig()
  const [errors, setErrors] = useState<RowErrors>({})

  const handleClick = async (key: keyof BlockFramesConfig, value: FrameMode) => {
    try {
      await setConfig(key, value)
      setErrors((prev) => ({ ...prev, [key]: null }))
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save'
      setErrors((prev) => ({ ...prev, [key]: message }))
    }
  }

  return (
    <div className="mt-6 space-y-4 rounded-lg border border-border bg-elevated p-6 shadow-sm">
      <div>
        <h2 className="text-lg font-medium text-foreground">Editor block frames</h2>
        <p className="mt-1 text-sm text-foreground-muted">
          Control when the editor draws an outlined frame around each block type. "Always"
          shows a frame at all times, "Empty" only frames blocks with no content, and "Never"
          hides the frame entirely.
        </p>
      </div>

      {isLoading ? (
        <div className="py-4 text-center text-sm text-foreground-subtle">Loading...</div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-foreground-muted">
              <th className="py-2">Block type</th>
              <th className="py-2">Frame mode</th>
            </tr>
          </thead>
          <tbody>
            {VISIBLE_BLOCK_TYPES.map(({ key, label }) => {
              const active = config[key]
              const rowError = errors[key]
              return (
                <tr key={key} className="border-b border-border">
                  <td className="py-2 pr-3 text-foreground font-medium align-top">{label}</td>
                  <td className="py-2">
                    <div role="group" aria-label={label + ' frame mode'} className="inline-flex gap-1">
                      {MODES.map((mode) => {
                        const isActive = active === mode.value
                        const baseClass =
                          'rounded px-2.5 py-1 text-xs font-medium border'
                        let stateClass: string
                        if (mode.disabled) {
                          stateClass =
                            'bg-surface text-foreground-subtle border-border opacity-50 cursor-not-allowed'
                        } else if (isActive) {
                          stateClass = 'bg-accent text-accent-foreground border-accent'
                        } else {
                          stateClass =
                            'bg-surface text-foreground border-border hover:bg-hover'
                        }
                        return (
                          <button
                            key={mode.value}
                            type="button"
                            disabled={mode.disabled}
                            title={mode.tooltip}
                            aria-pressed={isActive}
                            onClick={() => handleClick(key, mode.value)}
                            className={baseClass + ' ' + stateClass}
                          >
                            {mode.label}
                          </button>
                        )
                      })}
                    </div>
                    {rowError && (
                      <p className="mt-1 text-xs text-danger" role="alert">
                        {rowError}
                      </p>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}
