import StarterKit from '@tiptap/starter-kit'
import { TableKit } from '@tiptap/extension-table'
import Placeholder from '@tiptap/extension-placeholder'
import { Callout } from '@/blocks-tiptap/nodes/callout'
import { ColumnList } from '@/blocks-tiptap/nodes/columnList'
import { Column } from '@/blocks-tiptap/nodes/column'
import { FlowPanel } from '@/blocks-tiptap/nodes/flowPanel'
import { IfPanel } from '@/blocks-tiptap/nodes/ifPanel'
import { RowIdExtension } from '@/blocks-tiptap/nodes/rowIdExtension'
import { BlockFramesExtension } from '@/blocks-tiptap/nodes/blockFramesExtension'
import { SlashMenu } from '@/blocks-tiptap/slashMenu'

export const tiptapExtensions = [
  StarterKit.configure({
    blockquote: false,
    codeBlock: false,
    heading: { levels: [1, 2, 3] },
    bold: false,
    italic: false,
    strike: false,
    code: false,
    link: false,
    underline: false,
  }),
  TableKit,
  RowIdExtension,
  BlockFramesExtension,
  Callout,
  ColumnList,
  Column,
  FlowPanel,
  IfPanel,
  SlashMenu,
  Placeholder.configure({
    placeholder: ({ node, hasAnchor }) => {
      switch (node.type.name) {
        case 'heading':
          // Always visible — helps "lay out structure first, fill in later"
          return 'Heading ' + String(node.attrs.level)
        case 'paragraph':
          return hasAnchor ? 'Type / for commands...' : ''
        case 'listItem':
          return hasAnchor ? 'List item' : ''
        default:
          return ''
      }
    },
    showOnlyCurrent: false,
  }),
]
