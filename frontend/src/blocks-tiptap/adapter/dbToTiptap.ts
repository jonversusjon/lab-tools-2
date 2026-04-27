import type { JSONContent } from '@tiptap/core'
import type { ExperimentBlock } from '@/types'
import { UnsupportedBlockTypeError } from '@/blocks-tiptap/adapter/errors'

type ListBlockType = 'bulleted_list_item' | 'numbered_list_item'

function isListBlockType(blockType: string): blockType is ListBlockType {
  return blockType === 'bulleted_list_item' || blockType === 'numbered_list_item'
}

function textContent(text: unknown): JSONContent[] | undefined {
  if (typeof text !== 'string' || text === '') {
    return undefined
  }
  return [{ type: 'text', text }]
}

function getContentField<T>(row: ExperimentBlock, key: string, fallback: T): T {
  const content = row.content
  if (content && typeof content === 'object' && key in content) {
    const value = (content as Record<string, unknown>)[key]
    if (value !== undefined) {
      return value as T
    }
  }
  return fallback
}

export function rowsToTiptapDoc(rows: ExperimentBlock[]): JSONContent {
  const byParent = new Map<string | null, ExperimentBlock[]>()
  for (const row of rows) {
    const key = row.parent_id ?? null
    const existing = byParent.get(key)
    if (existing) {
      existing.push(row)
    } else {
      byParent.set(key, [row])
    }
  }
  for (const list of byParent.values()) {
    list.sort((a, b) => a.sort_order - b.sort_order)
  }

  function walkSiblings(parentId: string | null): JSONContent[] {
    const siblings = byParent.get(parentId) ?? []
    const output: JSONContent[] = []
    let i = 0
    while (i < siblings.length) {
      const row = siblings[i]
      if (isListBlockType(row.block_type)) {
        const groupType = row.block_type
        const group: ExperimentBlock[] = []
        while (i < siblings.length && siblings[i].block_type === groupType) {
          group.push(siblings[i])
          i += 1
        }
        output.push(buildListNode(groupType, group))
      } else {
        output.push(buildSingleNode(row))
        i += 1
      }
    }
    return output
  }

  function buildListNode(groupType: ListBlockType, items: ExperimentBlock[]): JSONContent {
    const wrapperType = groupType === 'bulleted_list_item' ? 'bulletList' : 'orderedList'
    const listItems = items.map((item) => buildListItem(item))
    return { type: wrapperType, content: listItems }
  }

  function buildListItem(item: ExperimentBlock): JSONContent {
    const text = getContentField<string>(item, 'text', '')
    const paragraphContent = textContent(text)
    const paragraph: JSONContent =
      paragraphContent === undefined
        ? { type: 'paragraph' }
        : { type: 'paragraph', content: paragraphContent }
    const children = walkSiblings(item.id)
    return { type: 'listItem', content: [paragraph, ...children] }
  }

  function buildTableCell(text: string, isHeader: boolean): JSONContent {
    const cellContent: JSONContent = text === '' ? { type: 'paragraph' } : {
      type: 'paragraph',
      content: [{ type: 'text', text }],
    }
    return { type: isHeader ? 'tableHeader' : 'tableCell', content: [cellContent] }
  }

  function buildTableRow(
    rowIndex: number,
    rowData: string[],
    hasColHeader: boolean,
    hasRowHeader: boolean
  ): JSONContent {
    const cells = rowData.map((cellText, colIndex) => {
      const isHeader =
        (rowIndex === 0 && hasColHeader) || (colIndex === 0 && hasRowHeader)
      return buildTableCell(cellText, isHeader)
    })
    return { type: 'tableRow', content: cells }
  }

  function buildTableNode(row: ExperimentBlock): JSONContent {
    const hasColHeader = getContentField<boolean>(row, 'has_column_header', false)
    const hasRowHeader = getContentField<boolean>(row, 'has_row_header', false)
    const rows = getContentField<string[][]>(row, 'rows', [])
    const tableRows = rows.map((rowData, rowIndex) =>
      buildTableRow(rowIndex, rowData, hasColHeader, hasRowHeader)
    )
    return { type: 'table', content: tableRows }
  }

  function buildSingleNode(row: ExperimentBlock): JSONContent {
    const blockType = row.block_type
    if (blockType === 'paragraph') {
      const inline = textContent(getContentField<string>(row, 'text', ''))
      return inline === undefined
        ? { type: 'paragraph' }
        : { type: 'paragraph', content: inline }
    }
    if (blockType === 'heading_1' || blockType === 'heading_2' || blockType === 'heading_3') {
      const level = Number(blockType.slice(-1))
      const inline = textContent(getContentField<string>(row, 'text', ''))
      const node: JSONContent = { type: 'heading', attrs: { level } }
      if (inline !== undefined) {
        node.content = inline
      }
      return node
    }
    if (blockType === 'heading_4') {
      console.warn(
        'rowsToTiptapDoc: demoting heading_4 (block id: ' + row.id + ') to heading_3'
      )
      const inline = textContent(getContentField<string>(row, 'text', ''))
      const node: JSONContent = { type: 'heading', attrs: { level: 3 } }
      if (inline !== undefined) {
        node.content = inline
      }
      return node
    }
    if (blockType === 'divider') {
      return { type: 'horizontalRule' }
    }
    if (blockType === 'callout') {
      return {
        type: 'callout',
        attrs: {
          icon: getContentField<string>(row, 'icon', '💡'),
          color: getContentField<string>(row, 'color', 'gray'),
          text: getContentField<string>(row, 'text', ''),
        },
      }
    }
    if (blockType === 'column_list') {
      return {
        type: 'column_list',
        attrs: { column_count: getContentField<number>(row, 'column_count', 2) },
        content: walkSiblings(row.id),
      }
    }
    if (blockType === 'column') {
      return {
        type: 'column',
        attrs: { column_index: getContentField<number>(row, 'column_index', 0) },
        content: walkSiblings(row.id),
      }
    }
    if (blockType === 'flow_panel') {
      return {
        type: 'flow_panel',
        attrs: { ...(row.content as Record<string, unknown>) },
      }
    }
    if (blockType === 'if_panel') {
      return {
        type: 'if_panel',
        attrs: { ...(row.content as Record<string, unknown>) },
      }
    }
    if (blockType === 'table') {
      return buildTableNode(row)
    }
    throw new UnsupportedBlockTypeError(blockType, row.id)
  }

  const topLevel = walkSiblings(null)
  return {
    type: 'doc',
    content: topLevel.length === 0 ? [{ type: 'paragraph' }] : topLevel,
  }
}
