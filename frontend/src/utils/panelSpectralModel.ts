/**
 * Pure derivation of a panel's spectral model: which fluorophore each target
 * row resolves to, which detectors are "active" (assigned or compatible), and
 * the spillover matrix for the assigned set.
 *
 * Extracted verbatim from PanelDesignerView so the experiment-page spectral
 * rail and the standalone panel designer compute identical results from the
 * same inputs. Keep this free of React/UI state — the only optional UI input
 * is `overrides` (the designer's raw-fluorophore overrides), which the rail
 * does not have (it reads persisted node attrs only).
 */

import { computeSpilloverMatrix } from '@/utils/spillover'
import { rankChannels } from '@/utils/spectra'
import type { RankChannelsResult } from '@/utils/spectra'
import type {
  Antibody,
  FluorophoreWithSpectra,
  Instrument,
  PanelAssignment,
  PanelTarget,
  SecondaryAntibody,
} from '@/types'

export interface SpectralActiveTarget {
  id: string
  fluorophore_id: string
  detector_id: string | null
}

export interface PanelSpectralModel {
  /** rowId (antibody_id or dye_label_id) → resolved fluorophore_id. */
  rowChannelScores: Map<string, RankChannelsResult>
  activeTargets: SpectralActiveTarget[]
  activeDetectors: Set<string>
  spillover: { labels: string[]; matrix: (number | null)[][] }
  missingSpectraWarnings: string[]
}

/**
 * Resolve the fluorophore for each target row. Mirrors the precedence used by
 * the panel designer: live assignment → secondary's fluorophore → raw override
 * (designer-only) → antibody's pre-conjugated fluorophore; dye rows resolve
 * from their assignment or baked dye fluorophore.
 */
export function buildRowFluorophoreMap(params: {
  targets: PanelTarget[]
  assignments: (PanelAssignment | null | undefined)[]
  antibodyMap: Map<string, Antibody>
  secondaries: SecondaryAntibody[]
  overrides?: Map<string, string>
}): Map<string, string> {
  const { targets, assignments, antibodyMap, secondaries, overrides } = params

  const assignmentByAntibody = new Map<string, PanelAssignment>()
  const assignmentByDyeLabel = new Map<string, PanelAssignment>()
  for (const a of assignments) {
    if (!a) continue
    if (a.antibody_id) assignmentByAntibody.set(a.antibody_id, a)
    if (a.dye_label_id) assignmentByDyeLabel.set(a.dye_label_id, a)
  }

  const map = new Map<string, string>()
  for (const t of targets) {
    if (t.dye_label_id) {
      const existing = assignmentByDyeLabel.get(t.dye_label_id)
      if (existing) {
        map.set(t.dye_label_id, existing.fluorophore_id)
      } else if (t.dye_label_fluorophore_id) {
        map.set(t.dye_label_id, t.dye_label_fluorophore_id)
      }
      continue
    }
    if (!t.antibody_id) continue
    const ab = antibodyMap.get(t.antibody_id)
    if (!ab) continue
    const existing = assignmentByAntibody.get(t.antibody_id)
    if (existing) {
      map.set(t.antibody_id, existing.fluorophore_id)
    } else if (t.secondary_antibody_id) {
      const sec = secondaries.find((s) => s.id === t.secondary_antibody_id)
      if (sec?.fluorophore_id) {
        map.set(t.antibody_id, sec.fluorophore_id)
      }
    } else if (overrides?.has(t.antibody_id)) {
      map.set(t.antibody_id, overrides.get(t.antibody_id)!)
    } else if (ab.fluorophore_id) {
      map.set(t.antibody_id, ab.fluorophore_id)
    }
  }
  return map
}

/**
 * Build the full spectral model (channel scores, active targets/detectors,
 * spillover) from a panel's persisted state plus a precomputed
 * rowFluorophoreMap (see buildRowFluorophoreMap).
 *
 * `spectraReady` guards spillover against rendering an empty/partial matrix
 * before batch spectra have loaded — the designer passes the same condition it
 * used inline; when false, spillover is returned empty.
 */
export function buildPanelSpectralModel(params: {
  instrument: Instrument | null
  targets: PanelTarget[]
  assignments: (PanelAssignment | null | undefined)[]
  allFluorophoresForScoring: FluorophoreWithSpectra[]
  rowFluorophoreMap: Map<string, string>
  spectraReady?: boolean
}): PanelSpectralModel {
  const {
    instrument,
    targets,
    assignments,
    allFluorophoresForScoring,
    rowFluorophoreMap,
    spectraReady = true,
  } = params

  const assignmentList = assignments.filter(
    (a): a is PanelAssignment => Boolean(a)
  )

  const assignmentByAntibody = new Map<string, PanelAssignment>()
  const assignmentByDyeLabel = new Map<string, PanelAssignment>()
  const assignmentByDetector = new Map<string, PanelAssignment>()
  for (const a of assignmentList) {
    if (a.antibody_id) assignmentByAntibody.set(a.antibody_id, a)
    if (a.dye_label_id) assignmentByDyeLabel.set(a.dye_label_id, a)
    assignmentByDetector.set(a.detector_id, a)
  }

  // Channel scores per row fluorophore
  const rowChannelScores = new Map<string, RankChannelsResult>()
  if (instrument) {
    for (const [rowId, flId] of rowFluorophoreMap) {
      const fl = allFluorophoresForScoring.find((f) => f.id === flId)
      if (!fl) continue
      rowChannelScores.set(rowId, rankChannels(fl, instrument))
    }
  }

  // Active targets: every row that resolves to a fluorophore
  const activeTargets: SpectralActiveTarget[] = []
  for (const t of targets) {
    if (t.dye_label_id) {
      const flId = rowFluorophoreMap.get(t.dye_label_id)
      if (flId) {
        const assignment = assignmentByDyeLabel.get(t.dye_label_id)
        activeTargets.push({
          id: t.dye_label_id,
          fluorophore_id: flId,
          detector_id: assignment?.detector_id ?? null,
        })
      }
      continue
    }
    if (!t.antibody_id) continue
    const flId = rowFluorophoreMap.get(t.antibody_id)
    if (flId) {
      const assignment = assignmentByAntibody.get(t.antibody_id)
      activeTargets.push({
        id: t.antibody_id,
        fluorophore_id: flId,
        detector_id: assignment?.detector_id ?? null,
      })
    }
  }

  // Active detectors: assigned + compatible (score ≥ 0.01) for unassigned rows
  const assignedDetectorIds = new Set(Array.from(assignmentByDetector.keys()))
  let activeDetectors: Set<string>
  const unassignedTargets = activeTargets.filter((t) => !t.detector_id)
  if (unassignedTargets.length === 0) {
    activeDetectors = assignedDetectorIds
  } else {
    activeDetectors = new Set(assignedDetectorIds)
    for (const t of unassignedTargets) {
      const channelResult = rowChannelScores.get(t.id)
      if (!channelResult || channelResult.kind !== 'computed') continue
      for (const r of channelResult.rankings) {
        if (r.score >= 0.01 && !assignedDetectorIds.has(r.detectorId)) {
          activeDetectors.add(r.detectorId)
        }
      }
    }
  }

  // Detector geometry for spillover
  const detectorMap = new Map<
    string,
    { midpoint: number; width: number; laserWavelength: number }
  >()
  if (instrument) {
    for (const laser of instrument.lasers) {
      for (const det of laser.detectors) {
        detectorMap.set(det.id, {
          midpoint: det.filter_midpoint,
          width: det.filter_width,
          laserWavelength: laser.wavelength_nm,
        })
      }
    }
  }

  // Spillover matrix. Built by walking `activeTargets` (which preserves the
  // target-table order) and picking up each assigned row, rather than the raw
  // `assignmentList`, so reordering the target table reorders the matrix
  // rows/columns to match.
  let spillover: { labels: string[]; matrix: (number | null)[][] } = {
    labels: [],
    matrix: [],
  }
  const missingSpectraWarnings: string[] = []
  if (
    spectraReady &&
    assignmentList.length > 0 &&
    allFluorophoresForScoring.length > 0
  ) {
    const inputs: Array<{
      fluorophoreId: string
      fluorophoreName: string
      emissionSpectra: number[][]
      detectorMidpoint: number
      detectorWidth: number
    }> = []
    for (const t of activeTargets) {
      if (!t.detector_id) continue
      const fl = allFluorophoresForScoring.find((f) => f.id === t.fluorophore_id)
      const det = detectorMap.get(t.detector_id)
      if (!fl || !det) continue
      if (!fl.has_spectra || !fl.spectra?.EM?.length) {
        missingSpectraWarnings.push(fl.name)
      }
      inputs.push({
        fluorophoreId: fl.id,
        fluorophoreName: fl.name,
        emissionSpectra: fl.spectra?.EM ?? [],
        detectorMidpoint: det.midpoint,
        detectorWidth: det.width,
      })
    }
    spillover = computeSpilloverMatrix(inputs)
  }

  return {
    rowChannelScores,
    activeTargets,
    activeDetectors,
    spillover,
    missingSpectraWarnings,
  }
}
