/**
 * Context-dependent right rail for the experiment page.
 *
 * Collapsed, it is a thin spine. When a flow panel block is the active block,
 * a spectral icon appears on the spine; clicking it (or, if the rail's open
 * preference is set, automatically) expands the rail to show that panel's
 * spectra + spillover. Switching to another panel auto-updates the content;
 * clicking a non-panel block collapses the rail again.
 *
 * The rail is a pure computed view over the live editor doc — it reads the
 * active panel's node attrs and recomputes; it never writes panel state.
 */

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useEditorInstance } from '@/blocks-tiptap/EditorContext'
import { useActivePanelBlock } from '@/hooks/useActivePanelBlock'
import type { ActivePanelBlock } from '@/hooks/useActivePanelBlock'
import { useSpectralRailOpen } from '@/hooks/useSpectralRailOpen'
import { useInstruments } from '@/hooks/useInstruments'
import { useAntibodies } from '@/hooks/useAntibodies'
import { useSecondaries } from '@/hooks/useSecondaries'
import { useFluorophores, useBatchSpectra } from '@/hooks/useFluorophores'
import {
  buildRowFluorophoreMap,
  buildPanelSpectralModel,
} from '@/utils/panelSpectralModel'
import PanelSpectraByLaser from '@/components/panels/PanelSpectraByLaser'
import SpilloverHeatmap from '@/components/panels/SpilloverHeatmap'
import type {
  Antibody,
  FluorophoreWithSpectra,
  PanelAssignment,
  PanelTarget,
} from '@/types'

function SpectrumIcon({ className }: { className?: string }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M3 13c2-7 4-7 5 0s3 9 5 0 3-5 4-2 2 4 0 4" />
    </svg>
  )
}

function SpilloverIcon({ className }: { className?: string }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <rect x="3" y="3" width="18" height="18" rx="1" />
      <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
    </svg>
  )
}

/**
 * Open/close toggle, positioned at the top of the rail symmetric to the left
 * sidebar's collapse chevron. The chevron rotates 180° between states with the
 * same 200ms ease-in-out transition the sidebar uses, so the two rails feel
 * identical. Points right (›) when expanded — collapse toward the edge — and
 * rotates to point left (‹) when collapsed — pull the rail back open.
 */
function RailToggle({ expanded, onToggle }: { expanded: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      title={expanded ? 'Collapse spectra rail' : 'Expand spectra rail'}
      aria-label={expanded ? 'Collapse spectra rail' : 'Expand spectra rail'}
      aria-expanded={expanded}
      className="flex shrink-0 items-center justify-center rounded p-1 text-foreground-muted hover:bg-hover hover:text-foreground transition-colors duration-150"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-4 w-4"
        style={{
          transform: expanded ? 'rotate(0deg)' : 'rotate(180deg)',
          transition: 'transform 200ms ease-in-out',
        }}
        aria-hidden="true"
      >
        <path d="M9 18l6-6-6-6" />
      </svg>
    </button>
  )
}

export default function ExperimentRail() {
  const editor = useEditorInstance()
  const active = useActivePanelBlock(editor)
  const { isOpen, setOpen } = useSpectralRailOpen()

  // Render into the Shell's right-rail slot so the rail is a sibling of the
  // sidebar and stretches full height. Resolved after mount (Shell renders
  // first, so the node exists by the time this effect runs).
  const [slot, setSlot] = useState<HTMLElement | null>(null)
  useEffect(() => {
    setSlot(document.getElementById('right-rail-slot'))
  }, [])

  // IF panels render no spectra/spillover yet — flow panels only for now.
  const isSpectralPanel = active?.blockType === 'flow_panel'
  const expanded = isOpen && isSpectralPanel

  // Same width-slide animation the left sidebar uses (transition-all duration-200
  // ease-in-out). overflow-hidden clips the wider content while the rail collapses.
  // h-full fills the slot, which stretches top-to-bottom like the sidebar.
  const baseClass =
    'flex h-full shrink-0 flex-col ' +
    'overflow-hidden border-l border-border bg-surface ' +
    'transition-all duration-200 ease-in-out print:hidden '

  if (!slot) return null

  // No spectral panel active: a thin, empty spine (nothing to toggle yet).
  if (!isSpectralPanel || !active) {
    return createPortal(
      <aside className={baseClass + 'w-11'} aria-hidden="true" />,
      slot,
    )
  }

  const panelName = (active.attrs.name as string | undefined)?.trim()

  return createPortal(
    <aside className={baseClass + (expanded ? 'w-[360px]' : 'w-11')}>
      {/* Toggle header — the open/close arrow sits at the top, symmetric to the
          left sidebar's collapse chevron (arrow on the edge adjacent to the page
          content; title on the outer edge). */}
      <div
        className={
          'flex items-center border-b border-border ' +
          (expanded ? 'justify-between gap-2 px-2 py-2' : 'justify-center px-2 py-2')
        }
      >
        <RailToggle expanded={expanded} onToggle={() => setOpen(!expanded)} />
        {expanded && (
          <div className="min-w-0 flex-1 text-right">
            <div className="text-[10px] font-medium uppercase tracking-wide text-foreground-subtle">
              Panel spectra
            </div>
            <div className="truncate text-sm font-semibold text-foreground" title={panelName || undefined}>
              {panelName || 'Untitled panel'}
            </div>
          </div>
        )}
      </div>

      {expanded ? (
        <SpectralRailContent active={active} />
      ) : (
        /* Relevant sections symbolized as icons while collapsed. */
        <div className="flex flex-col items-center gap-1 py-3">
          <button
            type="button"
            onClick={() => setOpen(true)}
            title="Panel spectra"
            aria-label="Show panel spectra and spillover"
            className="flex items-center justify-center rounded p-2 text-foreground-muted hover:bg-hover hover:text-foreground"
          >
            <SpectrumIcon />
          </button>
          <button
            type="button"
            onClick={() => setOpen(true)}
            title="Spillover matrix"
            aria-label="Show spillover matrix"
            className="flex items-center justify-center rounded p-2 text-foreground-muted hover:bg-hover hover:text-foreground"
          >
            <SpilloverIcon />
          </button>
        </div>
      )}
    </aside>,
    slot,
  )
}

function SpectralRailContent({ active }: { active: ActivePanelBlock }) {
  const targets = (active.attrs.targets as PanelTarget[] | undefined) ?? []
  const assignments =
    (active.attrs.assignments as PanelAssignment[] | undefined) ?? []

  const instrumentAttr = active.attrs.instrument as { id?: string } | null | undefined
  const instrumentId = instrumentAttr?.id ?? null

  const { data: instrumentsData } = useInstruments(0, 500)
  const { data: antibodiesData } = useAntibodies({ skip: 0, limit: 2000 })
  const { data: secondariesData } = useSecondaries()
  const { data: fluorophoreData } = useFluorophores({
    skip: 0,
    limit: 2000,
    has_spectra: true,
  })
  const { data: allFluorophoreData } = useFluorophores({ skip: 0, limit: 2000 })

  const instrument = useMemo(
    () => (instrumentsData?.items ?? []).find((i) => i.id === instrumentId) ?? null,
    [instrumentsData, instrumentId]
  )
  const antibodies = antibodiesData?.items ?? []
  const secondaries = secondariesData?.items ?? []
  const fluorophoreList = fluorophoreData?.items ?? []
  const allFluorophores = allFluorophoreData?.items ?? []

  // Batch spectra for the assignable set + anything already assigned.
  const fluorophoreIdsToFetch = useMemo(() => {
    const ids = new Set(fluorophoreList.map((f) => f.id))
    for (const a of assignments) {
      if (a?.fluorophore_id) ids.add(a.fluorophore_id)
    }
    return Array.from(ids)
  }, [fluorophoreList, assignments])

  const { data: spectraCache } = useBatchSpectra(fluorophoreIdsToFetch)

  const allFluorophoresForScoring: FluorophoreWithSpectra[] = useMemo(
    () => allFluorophores.map((fl) => ({ ...fl, spectra: spectraCache?.[fl.id] ?? null })),
    [allFluorophores, spectraCache]
  )

  const antibodyMap = useMemo(() => {
    const map = new Map<string, Antibody>()
    for (const ab of antibodies) map.set(ab.id, ab)
    return map
  }, [antibodies])

  const rowFluorophoreMap = useMemo(
    () =>
      buildRowFluorophoreMap({
        targets,
        assignments,
        antibodyMap,
        secondaries,
      }),
    [targets, assignments, antibodyMap, secondaries]
  )

  const spectraReady = spectraCache != null || fluorophoreIdsToFetch.length === 0

  const model = useMemo(
    () =>
      buildPanelSpectralModel({
        instrument,
        targets,
        assignments,
        allFluorophoresForScoring,
        rowFluorophoreMap,
        spectraReady,
      }),
    [instrument, targets, assignments, allFluorophoresForScoring, rowFluorophoreMap, spectraReady]
  )

  return (
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
        {!instrument ? (
          <p className="text-sm text-foreground-muted">
            Select an instrument on this panel to see its spectra and spillover.
          </p>
        ) : (
          <>
            <div className="rounded border border-border bg-elevated p-3">
              <div className="mb-2 text-xs font-semibold text-foreground">
                Panel Spectra
                <span className="ml-1 font-normal text-foreground-subtle">
                  ({model.activeTargets.length} fluorophore{model.activeTargets.length !== 1 ? 's' : ''})
                </span>
              </div>
              <PanelSpectraByLaser
                instrument={instrument}
                activeTargets={model.activeTargets}
                allFluorophoresForScoring={allFluorophoresForScoring}
                activeDetectors={model.activeDetectors}
              />
            </div>
            <SpilloverHeatmap
              labels={model.spillover.labels}
              matrix={model.spillover.matrix}
              missingSpectraWarnings={model.missingSpectraWarnings}
            />
          </>
        )}
    </div>
  )
}
