/**
 * Cross-reactivity / promiscuous binding checker for immunostaining panels.
 *
 * Detects off-target binding conflicts between antibodies and secondaries
 * in a multiplexed staining panel. Pure functions, no React, no side effects.
 *
 * Conflict classes (obtrusive — amber warnings):
 *   1. same_host_no_isotype      — Multiple primaries from same host needing secondary detection,
 *                                   without distinguishable isotypes
 *   2. same_host_same_isotype    — Multiple primaries sharing both host AND isotype
 *   3. generic_secondary_isotype — Pan-species secondary (e.g. anti-Mouse with no isotype)
 *                                   alongside isotype-specific mouse primaries
 *   4. secondary_host_xr         — Secondary's target_species matches another secondary's host
 *   5. secondary_binds_direct    — Species-mode secondary binds a directly-conjugated primary
 *
 * Conflict class (unobtrusive — info):
 *   6. closely_related_species   — Primaries from closely related species (Mouse/Rat, Goat/Sheep)
 *
 * Usage:
 *   import { buildParticipants, checkCrossReactivity } from '@/utils/crossReactivity'
 *   const participants = buildParticipants(targets, antibodyMap, secondaries)
 *   const conflicts = checkCrossReactivity(participants)
 */

import type { PanelTarget, Antibody, SecondaryAntibody } from '@/types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StainingParticipant {
  targetId: string
  antibodyName: string | null
  antibodyTarget: string | null
  primaryHost: string | null
  primaryIsotype: string | null
  /** True when primary is directly conjugated (has fluorophore_id) */
  isDirect: boolean
  secondary: {
    id: string
    name: string
    host: string
    targetSpecies: string
    targetIsotype: string | null
    bindingMode: 'species' | 'conjugate'
  } | null
}

export type ConflictSeverity = 'warning' | 'info'

export type CrossReactivityConflictType =
  | 'same_host_no_isotype'
  | 'same_host_same_isotype'
  | 'generic_secondary_isotype_conflict'
  | 'secondary_host_cross_reactivity'
  | 'secondary_binds_direct_primary'
  | 'closely_related_species'

export interface CrossReactivityConflict {
  /** Deterministic key for deduplication and React rendering */
  id: string
  severity: ConflictSeverity
  type: CrossReactivityConflictType
  /** One-line summary shown in the banner */
  message: string
  /** Expanded explanation (shown on click/hover) */
  detail: string
  /** Which panel target IDs are involved — used for highlighting rows */
  involvedTargetIds: string[]
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Species pairs with high IgG structural homology.
 * Even cross-adsorbed secondaries may exhibit residual cross-reactivity.
 */
const CLOSELY_RELATED_PAIRS: [string, string][] = [
  ['mouse', 'rat'],
  ['goat', 'sheep'],
  ['human', 'monkey'],
  ['human', 'cynomolgus'],
  ['human', 'rhesus'],
  ['human', 'non-human primate'],
  ['human', 'nhp'],
  ['human', 'chimpanzee'],
]

const MOUSE_IGG_SUBTYPES = new Set([
  'igg1',
  'igg2a',
  'igg2b',
  'igg3',
])

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function norm(s: string | null | undefined): string {
  return (s ?? '').trim().toLowerCase()
}

function speciesMatch(a: string | null, b: string | null): boolean {
  const na = norm(a)
  const nb = norm(b)
  return na !== '' && na === nb
}

function areCloselyRelated(a: string | null, b: string | null): boolean {
  const na = norm(a)
  const nb = norm(b)
  if (!na || !nb || na === nb) return false
  return CLOSELY_RELATED_PAIRS.some(
    ([x, y]) => (na.includes(x) && nb.includes(y)) || (na.includes(y) && nb.includes(x))
  )
}

function isMouseSubtype(isotype: string | null): boolean {
  return MOUSE_IGG_SUBTYPES.has(norm(isotype))
}

/** Produce a deterministic dedup key from sorted parts */
function conflictKey(...parts: string[]): string {
  return parts.sort().join('::')
}

function targetLabel(p: StainingParticipant): string {
  return p.antibodyTarget ?? p.antibodyName ?? '(unnamed)'
}

// ---------------------------------------------------------------------------
// Adapter: build participants from PanelDesigner's existing data structures
// ---------------------------------------------------------------------------

/**
 * Convert the panel's targets + lookup maps into the flat participant array
 * that `checkCrossReactivity` consumes.
 *
 * Call this inside a `useMemo` in any consuming component.
 */
export function buildParticipants(
  targets: PanelTarget[],
  antibodyMap: Map<string, Antibody>,
  secondaryList: SecondaryAntibody[],
): StainingParticipant[] {
  const secondaryMap = new Map<string, SecondaryAntibody>()
  for (const sec of secondaryList) {
    secondaryMap.set(sec.id, sec)
  }

  return targets
    .filter((t) => t.antibody_id !== null)
    .map((t) => {
      const ab = antibodyMap.get(t.antibody_id!)
      const sec = t.secondary_antibody_id
        ? secondaryMap.get(t.secondary_antibody_id) ?? null
        : null

      return {
        targetId: t.id,
        antibodyName: ab?.name ?? t.antibody_name ?? null,
        antibodyTarget: ab?.target ?? t.antibody_target ?? null,
        primaryHost: ab?.host ?? null,
        primaryIsotype: ab?.isotype ?? null,
        isDirect: !!ab?.fluorophore_id,
        secondary: sec
          ? {
              id: sec.id,
              name: sec.name,
              host: sec.host,
              targetSpecies: sec.target_species,
              targetIsotype: sec.target_isotype,
              bindingMode: sec.binding_mode,
            }
          : null,
      }
    })
}

// ---------------------------------------------------------------------------
// Main checker
// ---------------------------------------------------------------------------

export function checkCrossReactivity(
  participants: StainingParticipant[],
): CrossReactivityConflict[] {
  const conflicts: CrossReactivityConflict[] = []
  const seen = new Set<string>()

  function add(conflict: CrossReactivityConflict): void {
    if (seen.has(conflict.id)) return
    seen.add(conflict.id)
    conflicts.push(conflict)
  }

  // Partition
  const needsSecondary = participants.filter((p) => !p.isDirect && p.primaryHost)
  const directParticipants = participants.filter((p) => p.isDirect && p.primaryHost)
  const withSecondary = participants.filter((p) => p.secondary !== null)

  // Obtrusive checks
  checkSameHostConflicts(needsSecondary, add)
  checkSecondaryHostCrossReactivity(withSecondary, add)
  checkSecondaryBindsDirectPrimary(withSecondary, directParticipants, add)
  checkGenericMouseIsotypeConflict(participants, add)

  // Unobtrusive check
  checkCloselyRelatedSpecies(needsSecondary, add)

  return conflicts
}

// ---------------------------------------------------------------------------
// Rule 1: Same-host primaries needing secondary detection
// ---------------------------------------------------------------------------

function checkSameHostConflicts(
  needsSecondary: StainingParticipant[],
  add: (c: CrossReactivityConflict) => void,
): void {
  const byHost = new Map<string, StainingParticipant[]>()
  for (const p of needsSecondary) {
    const h = norm(p.primaryHost)
    if (!h) continue
    const group = byHost.get(h) ?? []
    group.push(p)
    byHost.set(h, group)
  }

  for (const [host, group] of byHost) {
    if (group.length < 2) continue

    // Mouse special case: subtypes can resolve the conflict
    if (host === 'mouse') {
      const withoutSubtype = group.filter((p) => !isMouseSubtype(p.primaryIsotype))

      if (withoutSubtype.length > 0) {
        const names = group.map(targetLabel).join(', ')
        add({
          id: conflictKey('same_host', host, ...group.map((p) => p.targetId)),
          severity: 'warning',
          type: 'same_host_no_isotype',
          message: 'Multiple Mouse primaries without distinct IgG subtypes',
          detail:
            'Targets: ' + names + '. ' +
            'Mouse primaries can share a panel when each has a distinct IgG subtype ' +
            '(IgG1, IgG2a, IgG2b, IgG3) paired with a matched isotype-specific secondary. ' +
            withoutSubtype.length + ' target(s) lack a subtype designation.',
          involvedTargetIds: group.map((p) => p.targetId),
        })
        continue
      }

      // All have subtypes — check for duplicate isotypes
      const byIsotype = new Map<string, StainingParticipant[]>()
      for (const p of group) {
        const iso = norm(p.primaryIsotype)
        const arr = byIsotype.get(iso) ?? []
        arr.push(p)
        byIsotype.set(iso, arr)
      }

      let hasDuplicateIsotype = false
      for (const [iso, isoGroup] of byIsotype) {
        if (isoGroup.length < 2) continue
        hasDuplicateIsotype = true
        const names = isoGroup.map(targetLabel).join(', ')
        const displayIso = isoGroup[0].primaryIsotype ?? iso
        add({
          id: conflictKey('same_isotype', host, iso, ...isoGroup.map((p) => p.targetId)),
          severity: 'warning',
          type: 'same_host_same_isotype',
          message: 'Multiple Mouse ' + displayIso + ' primaries in panel',
          detail:
            'Targets: ' + names + '. ' +
            'These share both host species and isotype — no secondary antibody can distinguish them.',
          involvedTargetIds: isoGroup.map((p) => p.targetId),
        })
      }

      // If all mouse subtypes are unique, the panel is resolvable — no warning
      if (!hasDuplicateIsotype) continue
      continue
    }

    // Non-mouse: same host is always a conflict for species-mode detection
    const hostDisplay = group[0].primaryHost ?? host
    const names = group.map(targetLabel).join(', ')
    add({
      id: conflictKey('same_host', host, ...group.map((p) => p.targetId)),
      severity: 'warning',
      type: 'same_host_no_isotype',
      message: 'Multiple ' + hostDisplay + ' primaries require secondary detection',
      detail:
        'Targets: ' + names + '. ' +
        'An anti-' + hostDisplay + ' secondary would bind all of these indiscriminately.',
      involvedTargetIds: group.map((p) => p.targetId),
    })
  }
}

// ---------------------------------------------------------------------------
// Rule 2: Secondary-host ↔ secondary-target cross-reactivity
// ---------------------------------------------------------------------------

function checkSecondaryHostCrossReactivity(
  withSecondary: StainingParticipant[],
  add: (c: CrossReactivityConflict) => void,
): void {
  const speciesSecondaries = withSecondary.filter(
    (p) => p.secondary?.bindingMode === 'species',
  )

  for (let i = 0; i < speciesSecondaries.length; i++) {
    for (let j = i + 1; j < speciesSecondaries.length; j++) {
      const a = speciesSecondaries[i]
      const b = speciesSecondaries[j]
      const secA = a.secondary!
      const secB = b.secondary!

      // Does A target the species that B is hosted in?
      if (speciesMatch(secA.targetSpecies, secB.host)) {
        add({
          id: conflictKey('sec_host_xr', a.targetId, b.targetId, 'a>b'),
          severity: 'warning',
          type: 'secondary_host_cross_reactivity',
          message: secA.name + ' will bind ' + secB.name,
          detail:
            secA.name + ' targets ' + secA.targetSpecies + ' immunoglobulins, but ' +
            secB.name + ' is a ' + secB.host + '-hosted antibody. ' +
            'The anti-' + secA.targetSpecies + ' secondary will bind it as an off-target.',
          involvedTargetIds: [a.targetId, b.targetId],
        })
      }

      // Reverse direction
      if (speciesMatch(secB.targetSpecies, secA.host)) {
        add({
          id: conflictKey('sec_host_xr', b.targetId, a.targetId, 'b>a'),
          severity: 'warning',
          type: 'secondary_host_cross_reactivity',
          message: secB.name + ' will bind ' + secA.name,
          detail:
            secB.name + ' targets ' + secB.targetSpecies + ' immunoglobulins, but ' +
            secA.name + ' is a ' + secA.host + '-hosted antibody. ' +
            'The anti-' + secB.targetSpecies + ' secondary will bind it as an off-target.',
          involvedTargetIds: [b.targetId, a.targetId],
        })
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Rule 3: Species-mode secondary binds a directly-conjugated primary
// ---------------------------------------------------------------------------

function checkSecondaryBindsDirectPrimary(
  withSecondary: StainingParticipant[],
  directParticipants: StainingParticipant[],
  add: (c: CrossReactivityConflict) => void,
): void {
  const speciesSecondaries = withSecondary.filter(
    (p) => p.secondary?.bindingMode === 'species',
  )

  for (const indirect of speciesSecondaries) {
    for (const direct of directParticipants) {
      if (!speciesMatch(indirect.secondary!.targetSpecies, direct.primaryHost)) continue

      // Mouse isotype escape: isotype-specific secondary won't bind a primary
      // of a different subtype
      if (
        norm(indirect.secondary!.targetSpecies) === 'mouse' &&
        indirect.secondary!.targetIsotype &&
        direct.primaryIsotype &&
        norm(indirect.secondary!.targetIsotype) !== norm(direct.primaryIsotype)
      ) {
        continue
      }

      const secName = indirect.secondary!.name
      const directLabel = targetLabel(direct)
      add({
        id: conflictKey('sec_direct', indirect.targetId, direct.targetId),
        severity: 'warning',
        type: 'secondary_binds_direct_primary',
        message: secName + ' will also bind directly-conjugated ' + directLabel,
        detail:
          secName + ' targets ' + indirect.secondary!.targetSpecies + ' immunoglobulins. ' +
          directLabel + ' is a directly-conjugated ' + (direct.primaryHost ?? '') + ' primary — ' +
          'it will also be bound by this secondary, producing off-target signal in the ' +
          secName + ' channel.',
        involvedTargetIds: [indirect.targetId, direct.targetId],
      })
    }
  }
}

// ---------------------------------------------------------------------------
// Rule 4: Generic (pan) anti-mouse secondary + isotype-specific mouse primaries
// ---------------------------------------------------------------------------

function checkGenericMouseIsotypeConflict(
  participants: StainingParticipant[],
  add: (c: CrossReactivityConflict) => void,
): void {
  // Find secondaries that target "mouse" without specifying an isotype
  const genericAntiMouse = participants.filter(
    (p) =>
      p.secondary?.bindingMode === 'species' &&
      norm(p.secondary.targetSpecies) === 'mouse' &&
      !p.secondary.targetIsotype,
  )

  if (genericAntiMouse.length === 0) return

  // Find all OTHER mouse primaries with specific isotypes
  const genericIds = new Set(genericAntiMouse.map((p) => p.targetId))
  const specificMousePrimaries = participants.filter(
    (p) =>
      norm(p.primaryHost) === 'mouse' &&
      isMouseSubtype(p.primaryIsotype) &&
      !genericIds.has(p.targetId),
  )

  if (specificMousePrimaries.length === 0) return

  for (const generic of genericAntiMouse) {
    const secName = generic.secondary!.name
    const targetNames = specificMousePrimaries
      .map((p) => targetLabel(p) + ' (' + (p.primaryIsotype ?? '?') + ')')
      .join(', ')

    add({
      id: conflictKey(
        'generic_mouse',
        generic.targetId,
        ...specificMousePrimaries.map((p) => p.targetId),
      ),
      severity: 'warning',
      type: 'generic_secondary_isotype_conflict',
      message: secName + ' (pan anti-Mouse) will cross-react with isotype-specific targets',
      detail:
        secName + ' lacks isotype specificity and will bind all mouse immunoglobulins, including: ' +
        targetNames + '. ' +
        'Use isotype-specific secondaries (anti-IgG1, anti-IgG2a, etc.) to resolve.',
      involvedTargetIds: [
        generic.targetId,
        ...specificMousePrimaries.map((p) => p.targetId),
      ],
    })
  }
}

// ---------------------------------------------------------------------------
// Rule 5 (info): Closely related host species
// ---------------------------------------------------------------------------

function checkCloselyRelatedSpecies(
  needsSecondary: StainingParticipant[],
  add: (c: CrossReactivityConflict) => void,
): void {
  for (let i = 0; i < needsSecondary.length; i++) {
    for (let j = i + 1; j < needsSecondary.length; j++) {
      const a = needsSecondary[i]
      const b = needsSecondary[j]
      if (!areCloselyRelated(a.primaryHost, b.primaryHost)) continue

      const hostA = a.primaryHost ?? '?'
      const hostB = b.primaryHost ?? '?'
      add({
        id: conflictKey('related_species', a.targetId, b.targetId),
        severity: 'info',
        type: 'closely_related_species',
        message: hostA + ' and ' + hostB + ' primaries may cross-react',
        detail:
          hostA + ' and ' + hostB + ' immunoglobulins share high structural homology. ' +
          'Even cross-adsorbed secondary antibodies may exhibit residual cross-reactivity between these species. ' +
          'Consider validating with single-stain controls or switching one target to a directly-conjugated antibody.',
        involvedTargetIds: [a.targetId, b.targetId],
      })
    }
  }
}
