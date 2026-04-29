import StarterKit from '@tiptap/starter-kit'
import { TableKit } from '@tiptap/extension-table'
import { Callout } from '@/blocks-tiptap/nodes/callout'
import { ColumnList } from '@/blocks-tiptap/nodes/columnList'
import { Column } from '@/blocks-tiptap/nodes/column'
import { FlowPanel } from '@/blocks-tiptap/nodes/flowPanel'
import { IfPanel } from '@/blocks-tiptap/nodes/ifPanel'
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
  Callout,
  ColumnList,
  Column,
  FlowPanel,
  IfPanel,
  SlashMenu,
]
