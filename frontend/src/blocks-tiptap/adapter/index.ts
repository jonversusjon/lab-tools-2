import type { JSONContent } from '@tiptap/core'
import type { ExperimentBlock } from '@/types'

export type TiptapDoc = JSONContent

export function rowsToTiptapDoc(_rows: ExperimentBlock[]): TiptapDoc {
  throw new Error('Phase 3: not yet implemented')
}

export function tiptapDocToRows(_doc: TiptapDoc, _experimentId: string): ExperimentBlock[] {
  throw new Error('Phase 3: not yet implemented')
}
