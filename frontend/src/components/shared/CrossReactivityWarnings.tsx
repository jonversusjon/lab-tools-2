/**
 * CrossReactivityWarnings — drop-in banner component for any immunostaining view.
 *
 * Accepts the raw panel data (targets, antibodyMap, secondaries) and internally
 * builds participants + runs the checker. Renders nothing when no conflicts exist.
 * Warnings auto-clear when the offending targets/secondaries are removed.
 *
 * Usage in PanelDesigner:
 *
 *   <CrossReactivityWarnings
 *     targets={state.targets}
 *     antibodyMap={antibodyMap}
 *     secondaries={secondaries}
 *   />
 */

import { useState, useMemo } from 'react'
import type { PanelTarget, Antibody, SecondaryAntibody } from '@/types'
import {
  buildParticipants,
  checkCrossReactivity,
} from '@/utils/crossReactivity'
import type { CrossReactivityConflict } from '@/utils/crossReactivity'

interface CrossReactivityWarningsProps {
  targets: PanelTarget[]
  antibodyMap: Map<string, Antibody>
  secondaries: SecondaryAntibody[]
  /** Optional callback to highlight/scroll-to a target row */
  onHighlightTarget?: (targetId: string) => void
}

export default function CrossReactivityWarnings({
  targets,
  antibodyMap,
  secondaries,
  onHighlightTarget,
}: CrossReactivityWarningsProps) {
  const participants = useMemo(
    () => buildParticipants(targets, antibodyMap, secondaries),
    [targets, antibodyMap, secondaries],
  )

  const conflicts = useMemo(
    () => checkCrossReactivity(participants),
    [participants],
  )

  const warnings = useMemo(
    () => conflicts.filter((c) => c.severity === 'warning'),
    [conflicts],
  )

  const infos = useMemo(
    () => conflicts.filter((c) => c.severity === 'info'),
    [conflicts],
  )

  if (conflicts.length === 0) return null

  return (
    <div className="space-y-2 mb-4">
      {warnings.length > 0 && (
        <ConflictBanner
          variant="warning"
          title="Cross-reactivity detected"
          conflicts={warnings}
          onHighlightTarget={onHighlightTarget}
        />
      )}
      {infos.length > 0 && (
        <ConflictBanner
          variant="info"
          title="Species similarity note"
          conflicts={infos}
          onHighlightTarget={onHighlightTarget}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Internal sub-components
// ---------------------------------------------------------------------------

function ConflictBanner({
  variant,
  title,
  conflicts,
  onHighlightTarget,
}: {
  variant: 'warning' | 'info'
  title: string
  conflicts: CrossReactivityConflict[]
  onHighlightTarget?: (targetId: string) => void
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const wrapperClass =
    variant === 'warning'
      ? 'rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-600/50 dark:bg-amber-950/30 px-4 py-3'
      : 'rounded-lg border border-sky-200 bg-sky-50 dark:border-sky-700/40 dark:bg-sky-950/20 px-4 py-3'

  const iconColor =
    variant === 'warning'
      ? 'text-amber-600 dark:text-amber-400'
      : 'text-sky-500 dark:text-sky-400'

  const titleColor =
    variant === 'warning'
      ? 'text-amber-800 dark:text-amber-300'
      : 'text-sky-700 dark:text-sky-300'

  const bodyColor =
    variant === 'warning'
      ? 'text-amber-700 dark:text-amber-300/80'
      : 'text-sky-600 dark:text-sky-300/70'

  const detailColor =
    variant === 'warning'
      ? 'text-amber-600/80 dark:text-amber-400/60'
      : 'text-sky-500/80 dark:text-sky-400/50'

  return (
    <div className={wrapperClass}>
      {/* Header */}
      <div className="flex items-center gap-2 mb-1.5">
        {variant === 'warning' ? (
          <WarningIcon className={iconColor} />
        ) : (
          <InfoIcon className={iconColor} />
        )}
        <span className={'font-semibold text-sm ' + titleColor}>
          {title}
          <span className="font-normal ml-1 opacity-70">
            ({conflicts.length})
          </span>
        </span>
      </div>

      {/* Conflict list */}
      <ul className="space-y-1 ml-7">
        {conflicts.map((c) => {
          const isExpanded = expandedId === c.id
          return (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => setExpandedId(isExpanded ? null : c.id)}
                className={
                  'text-left text-sm leading-snug cursor-pointer hover:underline ' +
                  bodyColor
                }
              >
                <span className="mr-1">{isExpanded ? '▾' : '▸'}</span>
                {c.message}
              </button>

              {isExpanded && (
                <div className={'text-xs mt-1 ml-4 leading-relaxed ' + detailColor}>
                  <p>{c.detail}</p>
                  {onHighlightTarget && (
                    <p className="mt-1">
                      {c.involvedTargetIds.map((tid, i) => (
                        <button
                          key={tid}
                          type="button"
                          onClick={() => onHighlightTarget(tid)}
                          className={
                            'underline decoration-dotted hover:decoration-solid ' +
                            (variant === 'warning'
                              ? 'text-amber-700 dark:text-amber-300'
                              : 'text-sky-600 dark:text-sky-300')
                          }
                        >
                          {i > 0 ? ', ' : ''}
                          Jump to row
                        </button>
                      ))}
                    </p>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Icons (inline SVG to avoid external dependency)
// ---------------------------------------------------------------------------

function WarningIcon({ className }: { className?: string }) {
  return (
    <svg
      className={'h-5 w-5 shrink-0 ' + (className ?? '')}
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.168 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 6a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 6zm0 9a1 1 0 100-2 1 1 0 000 2z"
        clipRule="evenodd"
      />
    </svg>
  )
}

function InfoIcon({ className }: { className?: string }) {
  return (
    <svg
      className={'h-5 w-5 shrink-0 ' + (className ?? '')}
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z"
        clipRule="evenodd"
      />
    </svg>
  )
}
