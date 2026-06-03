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

import { useMemo } from 'react'
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

export default function ExperimentRail() {
  const editor = useEditorInstance()
  const active = useActivePanelBlock(editor)
  const { isOpen, setOpen } = useSpectralRailOpen()

  // IF panels render no spectra/spillover yet — flow panels only for now.
  const isSpectralPanel = active?.blockType === 'flow_panel'
  const expanded = isOpen && isSpectralPanel

  if (expanded && active) {
    return (
      <aside className="flex w-[360px] shrink-0 flex-col border-l border-border bg-surface print:hidden">
        <SpectralRailContent active={active} onCollapse={() => setOpen(false)} />
      </aside>
    )
  }

  return (
    <aside className="flex w-11 shrink-0 flex-col items-center border-l border-border bg-surface py-3 print:hidden">
      {isSpectralPanel && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          title="Show panel spectra & spillover"
          aria-label="Show panel spectra and spillover"
          className="flex flex-col items-center gap-2 rounded p-2 text-foreground-muted hover:bg-hover hover:text-foreground"
        >
          <SpectrumIcon />
          <span
            className="text-[10px] font-medium uppercase tracking-wide text-foreground-subtle"
            style={{ writingMode: 'vertical-rl' }}
          >
            Spectra
          </span>
        </button>
      )}
    </aside>
  )
}

function SpectralRailContent({
  active,
  onCollapse,
}: {
  active: ActivePanelBlock
  onCollapse: () => void
}) {
  const targets = (active.attrs.targets as PanelTarget[] | undefined) ?? []
  const assignments =
    (active.attrs.assignments as PanelAssignment[] | undefined) ?? []
  const panelName = (active.attrs.name as string | undefined)?.trim()

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
    <>
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="min-w-0">
          <div className="text-[10px] font-medium uppercase tracking-wide text-foreground-subtle">
            Panel spectra
          </div>
          <div className="truncate text-sm font-semibold text-foreground" title={panelName || undefined}>
            {panelName || 'Untitled panel'}
          </div>
        </div>
        <button
          type="button"
          onClick={onCollapse}
          title="Collapse"
          aria-label="Collapse spectra rail"
          className="rounded p-1 text-foreground-muted hover:bg-hover hover:text-foreground"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9 18l6-6-6-6" />
          </svg>
        </button>
      </div>

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
    </>
  )
}
