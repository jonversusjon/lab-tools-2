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

    const sortChanged = beforeRow.sort_order !== afterRow.sort_order
    const parentChanged = beforeRow.parent_id !== afterRow.parent_id
    if (sortChanged || parentChanged) {
      topologyChanged.push(afterRow)
    }
  }

  return { created, deleted, contentChanged, topologyChanged }
}
