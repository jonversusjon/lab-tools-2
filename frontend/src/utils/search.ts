/**
 * Normalize a string for search comparison:
 * - Lowercase
 * - Strip hyphens, dots, parentheses, slashes
 * - Collapse whitespace
 *
 * "Alexa Fluor 700" → "alexa fluor 700"
 * "AF555" → "af555"
 * "anti-Mouse" → "antimouse"
 * "BV421 (BD)" → "bv421 bd"
 */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[-.()/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Tokenize a search query into individual terms.
 * Filters out empty strings.
 */
function tokenize(query: string): string[] {
  return normalize(query).split(' ').filter(Boolean)
}

/**
 * Check if ALL query tokens appear somewhere in the normalized target string.
 * Order-independent: "700 alexa" matches "Alexa Fluor 700".
 */
function allTokensMatch(tokens: string[], normalizedTarget: string): boolean {
  return tokens.every((token) => normalizedTarget.includes(token))
}

export interface SearchableField {
  value: string | null | undefined
  /** Higher weight = this field contributes more to ranking. Default: 1 */
  weight?: number
}

export interface SearchResult<T> {
  item: T
  score: number
}

/**
 * Score a single item against a set of query tokens.
 * Returns 0 if any token fails to match across ALL fields combined.
 * Returns a positive score based on field weights and match quality.
 */
export function scoreItem(tokens: string[], fields: SearchableField[]): number {
  if (tokens.length === 0) return 1

  const allText = fields
    .map((f) => normalize(f.value ?? ''))
    .join(' ')
  if (!allTokensMatch(tokens, allText)) return 0

  let score = 0
  for (const field of fields) {
    const norm = normalize(field.value ?? '')
    if (!norm) continue
    const weight = field.weight ?? 1

    for (const token of tokens) {
      const idx = norm.indexOf(token)
      if (idx === -1) continue

      score += weight

      if (idx === 0 || norm[idx - 1] === ' ') {
        score += weight * 0.5
      }

      if (norm === token) {
        score += weight * 2
      }
    }
  }

  return score
}

/**
 * Filter and rank a list of items by a search query.
 *
 * Each token must appear somewhere across the combined fields (AND logic).
 * Results are sorted by score descending. Items with score 0 are excluded.
 *
 * Usage:
 *   tokenSearch(antibodies, query, (ab) => [
 *     { value: ab.target, weight: 3 },
 *     { value: ab.name, weight: 2 },
 *     { value: ab.vendor, weight: 1 },
 *   ])
 */
export function tokenSearch<T>(
  items: T[],
  query: string,
  getFields: (item: T) => SearchableField[]
): T[] {
  const tokens = tokenize(query)
  if (tokens.length === 0) return items

  const scored: SearchResult<T>[] = []
  for (const item of items) {
    const s = scoreItem(tokens, getFields(item))
    if (s > 0) {
      scored.push({ item, score: s })
    }
  }

  scored.sort((a, b) => b.score - a.score)
  return scored.map((r) => r.item)
}
