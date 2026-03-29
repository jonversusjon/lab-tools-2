/**
 * Canonical dilution representation.
 * Always stored as the denominator N in "1:N".
 * Display as "1:N".
 * For calculations, the dilution factor = 1/N.
 */
export interface ParsedDilution {
  /** The denominator N in 1:N */
  denominator: number
  /** Original text before parsing (preserved for display/audit) */
  raw: string
  /** Whether parsing was confident */
  confident: boolean
}

/**
 * Parse messy dilution text into structured form.
 * Supports formats:
 *   "1:100", "1/100", "1 to 100"  -> { denominator: 100 }
 *   "100"                          -> { denominator: 100 }
 *   "1:50-1:100"                   -> { denominator: 50 } (takes the more concentrated)
 *   "1:100 (flow)"                 -> { denominator: 100 } (strips parenthetical notes)
 *   ""  or unparseable             -> null
 */
export function parseDilution(text: string | null | undefined): ParsedDilution | null {
  if (!text || !text.trim()) return null
  const raw = text.trim()

  // Strip parenthetical notes: "1:100 (flow)" -> "1:100"
  const cleaned = raw.replace(/\s*\(.*?\)\s*/g, '').trim()

  // Range format: "1:50-1:100" or "1:50 - 1:100" -> take the lower N (more concentrated)
  const rangeMatch = cleaned.match(/1\s*[:/]\s*(\d+)\s*[-\u2013]\s*1\s*[:/]\s*(\d+)/)
  if (rangeMatch) {
    const a = parseInt(rangeMatch[1])
    const b = parseInt(rangeMatch[2])
    return { denominator: Math.min(a, b), raw, confident: true }
  }

  // Standard formats: "1:N", "1/N"
  const stdMatch = cleaned.match(/1\s*[:/]\s*(\d+)/)
  if (stdMatch) {
    return { denominator: parseInt(stdMatch[1]), raw, confident: true }
  }

  // "1 to N"
  const toMatch = cleaned.match(/1\s+to\s+(\d+)/i)
  if (toMatch) {
    return { denominator: parseInt(toMatch[1]), raw, confident: true }
  }

  // Bare number: "100" -> assume 1:100
  const bareMatch = cleaned.match(/^(\d+)$/)
  if (bareMatch) {
    return { denominator: parseInt(bareMatch[1]), raw, confident: false }
  }

  return null
}

/**
 * Format a denominator for display as "1:N".
 */
export function formatDilution(denominator: number | null | undefined): string {
  if (denominator == null) return ''
  return '1:' + denominator
}

/**
 * Format for input field: just show the number.
 */
export function dilutionToInputValue(denominator: number | null | undefined): string {
  if (denominator == null) return ''
  return String(denominator)
}
