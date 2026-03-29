export const NON_FLUORESCENT_CONJUGATES = new Set([
  'biotin', 'hrp', 'ap', 'alkaline phosphatase',
  'dig', 'digoxigenin', 'gold', 'agarose',
])

export function isNonFluorescentConjugate(conjugate: string | null | undefined): boolean {
  if (!conjugate) return true
  return NON_FLUORESCENT_CONJUGATES.has(conjugate.toLowerCase())
}

export function needsSecondary(antibody: { fluorophore_id: string | null; conjugate: string | null }): boolean {
  if (antibody.fluorophore_id) return false
  return true
}
