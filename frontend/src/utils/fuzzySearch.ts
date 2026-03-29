/**
 * Fuzzy search utility for antibody omnibox.
 *
 * Features:
 *  - Normalization: strips hyphens, dots, parens, slashes → "cfos" matches "c-Fos"
 *  - Tokenized: "rabbit TH" matches TH with host=Rabbit (AND across tokens, order-invariant)
 *  - Ranked: target matches score highest, then name/clone, then other fields
 *  - Lightweight: no external deps, O(n × tokens × fields) per keystroke
 */

/** Strip non-alphanumeric except spaces, lowercase */
function normalize(s: string): string {
  return s.replace(/[^a-zA-Z0-9\s]/g, '').toLowerCase()
}

interface SearchableRecord {
  /** High-priority fields: target, name, clone */
  primary: string[]
  /** Medium-priority: catalog_number */
  secondary: string[]
  /** Low-priority: host, vendor, conjugate, fluorophore_name */
  tertiary: string[]
}

const SCORE_PRIMARY_PREFIX = 100
const SCORE_PRIMARY_CONTAINS = 60
const SCORE_SECONDARY = 40
const SCORE_TERTIARY = 20

/**
 * Score a single token against a record.
 * Returns 0 if the token doesn't match any field.
 */
function scoreToken(token: string, normToken: string, record: SearchableRecord): number {
  let best = 0

  for (const raw of record.primary) {
    const norm = normalize(raw)
    // Prefix match on normalized field is highest
    if (norm.startsWith(normToken)) {
      return SCORE_PRIMARY_PREFIX
    }
    // Substring on normalized
    if (norm.includes(normToken)) {
      best = Math.max(best, SCORE_PRIMARY_CONTAINS)
    }
    // Also try raw lowercase for exact substring (preserves hyphens etc)
    if (raw.toLowerCase().includes(token)) {
      best = Math.max(best, SCORE_PRIMARY_CONTAINS)
    }
  }

  if (best >= SCORE_PRIMARY_CONTAINS) return best

  for (const raw of record.secondary) {
    const norm = normalize(raw)
    if (norm.includes(normToken) || raw.toLowerCase().includes(token)) {
      best = Math.max(best, SCORE_SECONDARY)
    }
  }

  if (best >= SCORE_SECONDARY) return best

  for (const raw of record.tertiary) {
    const norm = normalize(raw)
    if (norm.includes(normToken) || raw.toLowerCase().includes(token)) {
      best = Math.max(best, SCORE_TERTIARY)
    }
  }

  return best
}

export interface ScoredResult<T> {
  item: T
  score: number
}

/**
 * Fuzzy-filter and rank a list of antibodies against a search query.
 *
 * Each whitespace-delimited token must match at least one field (AND logic).
 * Results are sorted by total score descending.
 */
export function fuzzyFilterAntibodies<T extends {
  target: string
  name?: string | null
  clone?: string | null
  catalog_number?: string | null
  host?: string | null
  vendor?: string | null
  conjugate?: string | null
  fluorophore_name?: string | null
}>(
  items: T[],
  query: string,
  excludeIds?: Set<string>,
  idAccessor?: (item: T) => string
): T[] {
  const trimmed = query.trim()
  if (!trimmed) {
    if (!excludeIds || !idAccessor) return items
    return items.filter((item) => !excludeIds.has(idAccessor(item)))
  }

  const tokens = trimmed.toLowerCase().split(/\s+/).filter(Boolean)
  const normTokens = tokens.map(normalize)

  const scored: ScoredResult<T>[] = []

  for (const item of items) {
    if (excludeIds && idAccessor && excludeIds.has(idAccessor(item))) {
      continue
    }

    const record: SearchableRecord = {
      primary: [
        item.target,
        item.name ?? '',
        item.clone ?? '',
      ].filter(Boolean),
      secondary: [
        item.catalog_number ?? '',
      ].filter(Boolean),
      tertiary: [
        item.host ?? '',
        item.vendor ?? '',
        item.conjugate ?? '',
        item.fluorophore_name ?? '',
      ].filter(Boolean),
    }

    let totalScore = 0
    let allMatch = true

    for (let i = 0; i < tokens.length; i++) {
      const s = scoreToken(tokens[i], normTokens[i], record)
      if (s === 0) {
        allMatch = false
        break
      }
      totalScore += s
    }

    if (allMatch) {
      scored.push({ item, score: totalScore })
    }
  }

  // Sort: highest score first, then alphabetical by target as tiebreaker
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    return a.item.target.localeCompare(b.item.target)
  })

  return scored.map((s) => s.item)
}
