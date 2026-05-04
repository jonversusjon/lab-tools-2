import type { ExperimentBlock } from '@/types'
import { stableStringify } from './stableStringify'

export interface TransactionDiff {
  created: ExperimentBlock[]
  deleted: ExperimentBlock[]
  contentChanged: ExperimentBlock[]
  topologyChanged: ExperimentBlock[]
}

function indexById(rows: ExperimentBlock[]): Map<string, ExperimentBlock> {
  const map = new Map<string, ExperimentBlock>()
  for (const row of rows) {
    map.set(row.id, row)
  }
  return map
}

// Returns the sorted sequence of IDs for blocks in a parent group, filtering
// to only blocks that also appear in referenceMap (i.e. exist in both snapshots).
// This isolates topology comparison from creates/deletes.
function sortedGroupIds(
  rows: ExperimentBlock[],
  parentId: string | null,
  referenceMap: Map<string, ExperimentBlock>
): string[] {
  return rows
    .filter((r) => (r.parent_id ?? null) === parentId && referenceMap.has(r.id))
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((r) => r.id)
}

export function inspectTransaction(
  before: ExperimentBlock[],
  after: ExperimentBlock[]
): TransactionDiff {
  const beforeMap = indexById(before)
  const afterMap = indexById(after)

  const created: ExperimentBlock[] = []
  const deleted: ExperimentBlock[] = []
  const contentChanged: ExperimentBlock[] = []
  const topologyChanged: ExperimentBlock[] = []

  for (const [id, row] of afterMap) {
    if (!beforeMap.has(id)) {
      created.push(row)
    }
  }

  for (const [id, row] of beforeMap) {
    if (!afterMap.has(id)) {
      deleted.push(row)
    }
  }

  for (const [id, afterRow] of afterMap) {
    const beforeRow = beforeMap.get(id)
    if (!beforeRow) continue

    const blockTypeChanged = beforeRow.block_type !== afterRow.block_type
    const contentDiffers =
      stableStringify(beforeRow.content) !== stableStringify(afterRow.content)
    if (blockTypeChanged || contentDiffers) {
      contentChanged.push(afterRow)
    }
  }

  // Topology detection uses relative order within parent groups rather than
  // absolute sort_order values. This prevents false positives when
  // tiptapDocToRows normalises sort_orders to 0, 1, 2 … while the server
  // stores the original float values (e.g. 1.0, 2.0). A genuine reorder
  // changes the sequence of block IDs within a group; mere normalisation
  // does not.
  const topologyChangedSet = new Set<string>()

  // Pass 1: detect parent_id changes (block moved to a different parent).
  for (const [id, afterRow] of afterMap) {
    const beforeRow = beforeMap.get(id)
    if (!beforeRow) continue
    if ((beforeRow.parent_id ?? null) !== (afterRow.parent_id ?? null)) {
      topologyChangedSet.add(id)
    }
  }

  // Pass 2: detect relative-order changes within each parent group.
  const allParentIds = new Set<string | null>()
  for (const row of before) allParentIds.add(row.parent_id ?? null)
  for (const row of after) allParentIds.add(row.parent_id ?? null)

  for (const pid of allParentIds) {
    const beforeSeq = sortedGroupIds(before, pid, afterMap)
    const afterSeq = sortedGroupIds(after, pid, beforeMap)
    if (beforeSeq.join('\0') !== afterSeq.join('\0')) {
      for (const id of afterSeq) topologyChangedSet.add(id)
    }
  }

  for (const id of topologyChangedSet) {
    const row = afterMap.get(id)
    if (row) topologyChanged.push(row)
  }

  return { created, deleted, contentChanged, topologyChanged }
}
