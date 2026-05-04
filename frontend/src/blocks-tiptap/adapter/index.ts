import type { JSONContent } from '@tiptap/core'

export type TiptapDoc = JSONContent

export { rowsToTiptapDoc } from '@/blocks-tiptap/adapter/dbToTiptap'
export { tiptapDocToRows } from '@/blocks-tiptap/adapter/tiptapToDb'
export { UnsupportedBlockTypeError } from '@/blocks-tiptap/adapter/errors'
