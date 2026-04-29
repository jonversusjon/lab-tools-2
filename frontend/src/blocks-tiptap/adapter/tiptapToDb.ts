import type { JSONContent } from '@tiptap/core'
import type { ExperimentBlock } from '@/types'

function newId(): string {
  return crypto.randomUUID()
}

function nowIso(): string {
  return new Date().toISOString()
}

function rowIdFromAttrs(attrs: Record<string, unknown> | undefined | null): string {
  const value = attrs?.['_rowId']
  return typeof value === 'string' && value.length > 0 ? value : newId()
}

function stripRowId(attrs: Record<string, unknown>): Record<string, unknown> {
  const { _rowId: _ignored, ...rest } = attrs
  return rest
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

function extractCellText(cellNode: JSONContent): string {
  const paragraphs: string[] = []
  for (const child of cellNode.content ?? []) {
    if (child.type === 'paragraph') {
      paragraphs.push(extractText(child))
    }
  }
  return paragraphs.join('\n')
}

function extractTableContent(tableNode: JSONContent): Record<string, unknown> {
  const tableRows = tableNode.content ?? []
  const firstRow = tableRows[0]?.content ?? []
  const tableWidth = firstRow.length
  const hasColumnHeader = firstRow.length > 0 && firstRow.every((c) => c.type === 'tableHeader')
  const col0Types = tableRows.map((r) => (r.content ?? [])[0]?.type ?? 'tableCell')
  const hasRowHeader = col0Types.length > 0 && col0Types.every((t) => t === 'tableHeader')
  const rows = tableRows.map((tableRow) => {
    const cells = tableRow.content ?? []
    const paddedCells: string[] = []
    for (let i = 0; i < Math.max(tableWidth, cells.length); i++) {
      paddedCells.push(i < cells.length ? extractCellText(cells[i]) : '')
    }
    return paddedCells
  })
  return { table_width: tableWidth, has_column_header: hasColumnHeader, has_row_header: hasRowHeader, rows }
}

export function tiptapDocToRows(doc: JSONContent, experimentId: string): ExperimentBlock[] {
  const rows: ExperimentBlock[] = []

  function emitRow(
    id: string,
    blockType: string,
    content: Record<string, unknown>,
    parentId: string | null,
    sortOrder: number
  ): ExperimentBlock {
    const row: ExperimentBlock = {
      id,
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
    const attrs = (node.attrs ?? {}) as Record<string, unknown>
    const id = rowIdFromAttrs(attrs)
    if (type === 'paragraph') {
      emitRow(id, 'paragraph', { text: extractText(node) }, parentId, sortOrder)
      return sortOrder + 1
    }
    if (type === 'heading') {
      const rawLevel = (attrs['level'] as number | undefined) ?? 3
      const level = rawLevel === 1 || rawLevel === 2 || rawLevel === 3 ? rawLevel : 3
      emitRow(id, 'heading_' + String(level), { text: extractText(node) }, parentId, sortOrder)
      return sortOrder + 1
    }
    if (type === 'horizontalRule') {
      emitRow(id, 'divider', {}, parentId, sortOrder)
      return sortOrder + 1
    }
    if (type === 'callout') {
      emitRow(
        id,
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
      emitRow(id, 'flow_panel', stripRowId(attrs), parentId, sortOrder)
      return sortOrder + 1
    }
    if (type === 'if_panel') {
      emitRow(id, 'if_panel', stripRowId(attrs), parentId, sortOrder)
      return sortOrder + 1
    }
    if (type === 'column_list') {
      const row = emitRow(
        id,
        'column_list',
        { column_count: typeof attrs['column_count'] === 'number' ? attrs['column_count'] : 2 },
        parentId,
        sortOrder
      )
      walkContent(node.content, row.id)
      return sortOrder + 1
    }
    if (type === 'column') {
      const widthPct = typeof attrs['width_pct'] === 'number' ? attrs['width_pct'] : null
      const content: Record<string, unknown> = widthPct !== null ? { width_pct: widthPct } : {}
      const row = emitRow(id, 'column', content, parentId, sortOrder)
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
        const itemAttrs = (item.attrs ?? {}) as Record<string, unknown>
        const itemId = rowIdFromAttrs(itemAttrs)
        const row = emitRow(
          itemId,
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
    if (type === 'table') {
      emitRow(id, 'table', extractTableContent(node), parentId, sortOrder)
      return sortOrder + 1
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
