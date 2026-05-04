/**
 * Tree-walk JSON filter. Retains any node whose key or string value
 * contains the filter substring (case-insensitive), and retains parents
 * of any matching descendant.
 *
 * Returns null if nothing in the tree matches.
 */
export function filterJsonTree(value: unknown, filter: string): unknown {
  if (!filter) return value

  const UNMATCHED = Symbol('unmatched')

  function walk(node: unknown, parentKey?: string): unknown | symbol {
    if (node === null || typeof node !== 'object') {
      const asString = String(node).toLowerCase()
      if (asString.includes(filter)) return node
      if (parentKey && parentKey.toLowerCase().includes(filter)) return node
      return UNMATCHED
    }

    if (Array.isArray(node)) {
      const result: unknown[] = []
      let anyMatched = false
      for (const item of node) {
        const r = walk(item, parentKey)
        if (r !== UNMATCHED) {
          result.push(r)
          anyMatched = true
        }
      }
      return anyMatched ? result : UNMATCHED
    }

    const result: Record<string, unknown> = {}
    let anyMatched = false
    for (const [key, val] of Object.entries(node as Record<string, unknown>)) {
      const keyMatches = key.toLowerCase().includes(filter)
      const r = walk(val, key)
      if (keyMatches) {
        // Key matched — retain the entire subtree under this key
        result[key] = val
        anyMatched = true
      } else if (r !== UNMATCHED) {
        result[key] = r
        anyMatched = true
      }
    }
    return anyMatched ? result : UNMATCHED
  }

  const r = walk(value)
  return r === UNMATCHED ? null : r
}
