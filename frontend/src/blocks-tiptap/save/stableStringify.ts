/**
 * JSON.stringify with deterministic key order. Used by the transaction
 * inspector to compare baseline content (from server, in wire order)
 * vs current content (from tiptapDocToRows, in addAttributes order).
 *
 * Without stable ordering, key-order differences produce phantom
 * "contentChanged" diffs on every page load.
 *
 * Recurses into nested objects. Arrays preserve order (semantic).
 */
export function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return JSON.stringify(value)
  if (typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) {
    return '[' + value.map(stableStringify).join(',') + ']'
  }
  const obj = value as Record<string, unknown>
  const keys = Object.keys(obj).sort()
  const pairs = keys.map((k) => JSON.stringify(k) + ':' + stableStringify(obj[k]))
  return '{' + pairs.join(',') + '}'
}
