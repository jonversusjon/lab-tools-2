export const NON_FLUORESCENT_CONJUGATES = new Set([
  'biotin', 'hrp', 'ap', 'alkaline phosphatase',
  'dig', 'digoxigenin', 'gold', 'agarose',
])

/**
 * Conjugates that have well-known complementary binding reagents
 * (e.g. streptavidin for biotin). Maps conjugate name (lowercase)
 * to a human-readable label for the binding partner category.
 */
export const CONJUGATE_BINDING_PARTNERS: Record<string, string> = {
  biotin: 'Streptavidin / Anti-Biotin',
  dig: 'Anti-DIG',
  digoxigenin: 'Anti-DIG',
}

export function isNonFluorescentConjugate(conjugate: string | null | undefined): boolean {
  if (!conjugate) return true
  return NON_FLUORESCENT_CONJUGATES.has(conjugate.toLowerCase())
}

export type DetectionStrategy =
  | { type: 'direct' }
  | { type: 'species' }
  | { type: 'conjugate'; conjugate: string; label: string }
  | { type: 'both'; conjugate: string; label: string }

/**
 * Determine how this primary antibody should be detected.
 * Returns the detection strategy which drives SecondaryOmnibox filtering.
 */
export function getDetectionStrategy(antibody: {
  fluorophore_id: string | null
  conjugate: string | null
  host: string | null
}): DetectionStrategy {
  // Already has a fluorophore — direct detection
  if (antibody.fluorophore_id) {
    return { type: 'direct' }
  }

  const conjLower = antibody.conjugate?.toLowerCase().trim() ?? null
  const hasNonFluorescentConj = conjLower !== null && NON_FLUORESCENT_CONJUGATES.has(conjLower)
  const hasHost = !!antibody.host

  if (hasNonFluorescentConj && hasHost) {
    const label = CONJUGATE_BINDING_PARTNERS[conjLower!] ?? `Anti-${antibody.conjugate}`
    return { type: 'both', conjugate: conjLower!, label }
  }

  if (hasNonFluorescentConj) {
    const label = CONJUGATE_BINDING_PARTNERS[conjLower!] ?? `Anti-${antibody.conjugate}`
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
