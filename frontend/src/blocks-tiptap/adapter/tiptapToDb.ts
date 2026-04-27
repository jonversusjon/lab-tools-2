import type { JSONContent } from '@tiptap/core'
import type { ExperimentBlock } from '@/types'

function newId(): string {
  return crypto.randomUUID()
}

function nowIso(): string {
  return new Date().toISOString()
}

function extractText(node: JSONContent): string {
  const content = node.content
  if (!content || content.length === 0) {
    return ''
  }
  let out = ''
  for (const child of content) {
    if (child.type === 'text' && typeof child.text === 'string') {
      out += child.text
    }
  }
  return out
}

function extractListItemText(listItem: JSONContent): string {
  const content = listItem.content
  if (!content || content.length === 0) {
    return ''
  }
  for (const child of content) {
    if (child.type === 'paragraph') {
      return extractText(child)
    }
  }
  return ''
}

function listItemChildren(listItem: JSONContent): JSONContent[] {
  const content = listItem.content
  if (!content || content.length === 0) {
    return []
  }
  const out: JSONContent[] = []
  let seenFirstParagraph = false
  for (const child of content) {
    if (!seenFirstParagraph && child.type === 'paragraph') {
      seenFirstParagraph = true
      continue
    }
    out.push(child)
  }
  return out
}

export function tiptapDocToRows(doc: JSONContent, experimentId: string): ExperimentBlock[] {
  const rows: ExperimentBlock[] = []

  function emitRow(
    blockType: string,
    content: Record<string, unknown>,
    parentId: string | null,
    sortOrder: number
  ): ExperimentBlock {
    const row: ExperimentBlock = {
      id: newId(),
      experiment_id: experimentId,
      block_type: blockType,
      content,
      sort_order: sortOrder,
      parent_id: parentId,
      created_at: nowIso(),
      updated_at: nowIso(),
    }
    rows.push(row)
    return row
  }

  function walkContent(nodes: JSONContent[] | undefined, parentId: string | null): void {
    if (!nodes || nodes.length === 0) return
    let sortOrder = 0
    for (const node of nodes) {
      sortOrder = handleNode(node, parentId, sortOrder)
    }
  }

  // Returns the next sortOrder for siblings at this level.
  function handleNode(node: JSONContent, parentId: string | null, sortOrder: number): number {
    const type = node.type
    if (type === 'paragraph') {
      emitRow('paragraph', { text: extractText(node) }, parentId, sortOrder)
      return sortOrder + 1
    }
    if (type === 'heading') {
      const rawLevel = (node.attrs?.['level'] as number | undefined) ?? 3
      const level = rawLevel === 1 || rawLevel === 2 || rawLevel === 3 ? rawLevel : 3
      emitRow('heading_' + String(level), { text: extractText(node) }, parentId, sortOrder)
      return sortOrder + 1
    }
    if (type === 'horizontalRule') {
      emitRow('divider', {}, parentId, sortOrder)
      return sortOrder + 1
    }
    if (type === 'callout') {
      const attrs = (node.attrs ?? {}) as Record<string, unknown>
      emitRow(
        'callout',
        {
          text: typeof attrs['text'] === 'string' ? attrs['text'] : '',
          icon: typeof attrs['icon'] === 'string' ? attrs['icon'] : '💡',
          color: typeof attrs['color'] === 'string' ? attrs['color'] : 'gray',
        },
        parentId,
        sortOrder
      )
      return sortOrder + 1
    }
    if (type === 'flow_panel') {
      const attrs = (node.attrs ?? {}) as Record<string, unknown>
      emitRow('flow_panel', { ...attrs }, parentId, sortOrder)
      return sortOrder + 1
    }
    if (type === 'if_panel') {
      const attrs = (node.attrs ?? {}) as Record<string, unknown>
      emitRow('if_panel', { ...attrs }, parentId, sortOrder)
      return sortOrder + 1
    }
    if (type === 'column_list') {
      const attrs = (node.attrs ?? {}) as Record<string, unknown>
      const row = emitRow(
        'column_list',
        { column_count: typeof attrs['column_count'] === 'number' ? attrs['column_count'] : 2 },
        parentId,
        sortOrder
      )
      walkContent(node.content, row.id)
      return sortOrder + 1
    }
    if (type === 'column') {
      const attrs = (node.attrs ?? {}) as Record<string, unknown>
      const row = emitRow(
        'column',
        { column_index: typeof attrs['column_index'] === 'number' ? attrs['column_index'] : 0 },
        parentId,
        sortOrder
      )
      walkContent(node.content, row.id)
      return sortOrder + 1
    }
    if (type === 'bulletList' || type === 'orderedList') {
      const itemBlockType =
        type === 'bulletList' ? 'bulleted_list_item' : 'numbered_list_item'
      const items = node.content ?? []
      let nextSort = sortOrder
      for (const item of items) {
        if (item.type !== 'listItem') continue
        const row = emitRow(
          itemBlockType,
          { text: extractListItemText(item) },
          parentId,
          nextSort
        )
        nextSort += 1
        const children = listItemChildren(item)
        if (children.length > 0) {
          walkContent(children, row.id)
        }
      }
      return nextSort
    }
    if (type === 'listItem') {
      // Defensive: should only be reached via bulletList/orderedList.
      throw new Error('Unexpected listItem outside of list wrapper')
    }
    throw new Error('Unknown Tiptap node type: ' + String(type))
  }

  walkContent(doc.content, null)
  return rows
}
