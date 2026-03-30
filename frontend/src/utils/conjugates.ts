import type { ConjugateChemistry } from '@/types'

/**
 * Hardcoded fallback set — used only when API data hasn't loaded yet.
 * Once ConjugateChemistry data is fetched, the dynamic versions are used instead.
 */
export const DEFAULT_NON_FLUORESCENT_CONJUGATES = new Set([
  'biotin', 'hrp', 'ap', 'alkaline phosphatase',
  'dig', 'digoxigenin', 'gold', 'agarose',
])

export const DEFAULT_CONJUGATE_BINDING_PARTNERS: Record<string, string> = {
  biotin: 'Streptavidin / Anti-Biotin',
  dig: 'Anti-DIG',
  digoxigenin: 'Anti-DIG',
}

/**
 * Build the non-fluorescent conjugate set from API data.
 */
export function buildConjugateSet(chemistries: ConjugateChemistry[]): Set<string> {
  if (chemistries.length === 0) return DEFAULT_NON_FLUORESCENT_CONJUGATES
  return new Set(chemistries.map((c) => c.name.toLowerCase()))
}

/**
 * Build the binding partners map from API data.
 */
export function buildBindingPartners(chemistries: ConjugateChemistry[]): Record<string, string> {
  if (chemistries.length === 0) return DEFAULT_CONJUGATE_BINDING_PARTNERS
  const map: Record<string, string> = {}
  for (const c of chemistries) {
    map[c.name.toLowerCase()] = c.label
  }
  return map
}

export function isNonFluorescentConjugate(
  conjugate: string | null | undefined,
  conjugateSet?: Set<string>,
): boolean {
  if (!conjugate) return true
  const set = conjugateSet ?? DEFAULT_NON_FLUORESCENT_CONJUGATES
  return set.has(conjugate.toLowerCase())
}

export type DetectionStrategy =
  | { type: 'direct' }
  | { type: 'species' }
  | { type: 'conjugate'; conjugate: string; label: string }
  | { type: 'both'; conjugate: string; label: string }

/**
 * Determine how this primary antibody should be detected.
 * Returns the detection strategy which drives SecondaryOmnibox filtering.
 *
 * Pass conjugateSet and bindingPartners from the API for dynamic behaviour,
 * or omit them to use the hardcoded defaults.
 */
export function getDetectionStrategy(
  antibody: {
    fluorophore_id: string | null
    conjugate: string | null
    host: string | null
  },
  conjugateSet?: Set<string>,
  bindingPartners?: Record<string, string>,
): DetectionStrategy {
  // Already has a fluorophore — direct detection
  if (antibody.fluorophore_id) {
    return { type: 'direct' }
  }

  const set = conjugateSet ?? DEFAULT_NON_FLUORESCENT_CONJUGATES
  const partners = bindingPartners ?? DEFAULT_CONJUGATE_BINDING_PARTNERS

  const conjLower = antibody.conjugate?.toLowerCase().trim() ?? null
  const hasNonFluorescentConj = conjLower !== null && set.has(conjLower)
  const hasHost = !!antibody.host

  if (hasNonFluorescentConj && hasHost) {
    const label = partners[conjLower!] ?? `Anti-${antibody.conjugate}`
    return { type: 'both', conjugate: conjLower!, label }
  }

  if (hasNonFluorescentConj) {
    const label = partners[conjLower!] ?? `Anti-${antibody.conjugate}`
    return { type: 'conjugate', conjugate: conjLower!, label }
  }

  // Unconjugated or unknown conjugate — species secondary
  return { type: 'species' }
}

/**
 * Legacy compat: does this antibody need any kind of secondary/reagent?
 */
export function needsSecondary(antibody: { fluorophore_id: string | null; conjugate: string | null }): boolean {
  return !antibody.fluorophore_id
}
