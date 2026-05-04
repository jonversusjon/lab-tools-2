import { execSync } from 'child_process'

const DB_PATH =
  process.env.LAB_TOOLS_DB ??
  `${process.env.HOME}/proj/lab-tools-2/backend/panels.db`

const CK009_BACKUP =
  process.env.CK009_BACKUP ??
  `${process.env.HOME}/ck009-backup-20260502.sql`

export const CK009_ID = '6796af91-6847-4df3-9150-945fa1eac24d'
export const SANDBOX_NAME = 'Sandbox Test Experiment'

function sql(query: string): string {
  return execSync(`sqlite3 "${DB_PATH}" "${query}"`).toString().trim()
}

export function dbBlockCount(experimentId: string): number {
  return parseInt(
    sql(`SELECT COUNT(*) FROM experiment_blocks WHERE experiment_id='${experimentId}'`),
    10
  )
}

export function dbExperimentCount(name: string): number {
  return parseInt(
    sql(
      `SELECT COUNT(*) FROM experiments WHERE name='${name.replace(/'/g, "''")}'`
    ),
    10
  )
}

export function dbExperimentId(name: string): string | null {
  const result = sql(
    `SELECT id FROM experiments WHERE name='${name.replace(/'/g, "''")}' LIMIT 1`
  )
  return result || null
}

export function dbBlockTopology(experimentId: string): Array<{
  id: string
  block_type: string
  parent_id: string | null
  sort_order: number
}> {
  const result = sql(
    `SELECT id || '|' || block_type || '|' || COALESCE(parent_id, '') || '|' || sort_order ` +
      `FROM experiment_blocks WHERE experiment_id='${experimentId}' ORDER BY sort_order`
  )
  if (!result) return []
  return result.split('\n').map((line) => {
    const [id, block_type, parent_id, sort_order] = line.split('|')
    return {
      id,
      block_type,
      parent_id: parent_id || null,
      sort_order: parseFloat(sort_order),
    }
  })
}

export function restoreCK009(): void {
  sql(`DELETE FROM experiments WHERE id='${CK009_ID}'`)
  sql(`DELETE FROM experiment_blocks WHERE experiment_id='${CK009_ID}'`)
  execSync(`sqlite3 "${DB_PATH}" < "${CK009_BACKUP}"`)
}

export function deleteSandbox(): void {
  sql(`DELETE FROM experiments WHERE name='${SANDBOX_NAME}'`)
}

export function expectCK009Pristine(): void {
  const count = dbBlockCount(CK009_ID)
  if (count !== 1) {
    throw new Error(
      `cK009 has ${count} blocks, expected 1 — restore failed`
    )
  }
}
