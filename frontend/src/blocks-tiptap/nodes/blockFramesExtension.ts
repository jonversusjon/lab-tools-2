import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { getCurrentBlockFramesConfig } from '../blockFramesProvider'
import type { BlockFramesConfig, FrameMode } from '@/types'

// Atom nodes have content.size 0, so an 'empty' frame mode would always show a
// frame anyway — collapse it to 'always' at decoration-write time so the CSS
// rules stay simple.
const ATOM_TYPES = new Set(['flow_panel', 'if_panel', 'horizontalRule', 'callout'])

// Tiptap node name → BlockFramesConfig key. Node types absent from this map
// (text, tableHeader, tableCell) get no data-frame decoration at all.
const NODE_TO_CONFIG_KEY: Record<string, keyof BlockFramesConfig> = {
  heading: 'heading',
  paragraph: 'paragraph',
  bulletList: 'bulletList',
  orderedList: 'orderedList',
  listItem: 'listItem',
  horizontalRule: 'horizontalRule',
  callout: 'callout',
  column_list: 'column_list',
  column: 'column',
  flow_panel: 'flow_panel',
  if_panel: 'if_panel',
  table: 'table',
  tableRow: 'tableRow',
}

// 'clean' is reserved for Phase 13d — treat it as 'empty' for now and never
// write data-frame="clean" to the DOM.
function resolveFrameMode(nodeName: string): Exclude<FrameMode, 'clean'> {
  const config = getCurrentBlockFramesConfig()
  const key = NODE_TO_CONFIG_KEY[nodeName]
  if (!key) return 'never'
  const userValue = config[key]
  const effective = userValue === 'clean' ? 'empty' : userValue
  if (ATOM_TYPES.has(nodeName) && effective === 'empty') return 'always'
  return effective
}

const blockFramesPluginKey = new PluginKey<PluginState>('blockFrames')

interface PluginState {
  decorations: DecorationSet
  config: BlockFramesConfig
}

function buildDecorations(doc: ProseMirrorNode): DecorationSet {
  const decorations: Decoration[] = []
  doc.descendants((node, pos) => {
    if (!NODE_TO_CONFIG_KEY[node.type.name]) return
    const mode = resolveFrameMode(node.type.name)
    decorations.push(
      Decoration.node(pos, pos + node.nodeSize, { 'data-frame': mode }),
    )
  })
  return DecorationSet.create(doc, decorations)
}

function configEqual(a: BlockFramesConfig, b: BlockFramesConfig): boolean {
  return (Object.keys(a) as Array<keyof BlockFramesConfig>).every(
    (k) => a[k] === b[k],
  )
}

// Adds a `data-frame` attribute to every configurable block-level node via
// ProseMirror node decorations. The mode is computed from the user's
// BlockFramesConfig (read through the module-level ref in blockFramesProvider).
// Decorations are used instead of addGlobalAttributes because per-node
// attributes there cannot see the node's type, and because data-frame is a
// rendered-only attribute that must never be persisted into row content.
export const BlockFramesExtension = Extension.create({
  name: 'blockFrames',

  addStorage() {
    return {
      handleConfigChange: null as null | (() => void),
    }
  },

  onCreate() {
    const handler = () => {
      const tr = this.editor.state.tr.setMeta('block-frames-rebuild', true)
      this.editor.view.dispatch(tr)
    }
    this.storage.handleConfigChange = handler
    window.addEventListener('block-frames-config-changed', handler)
  },

  onDestroy() {
    const handler = this.storage.handleConfigChange
    if (handler) {
      window.removeEventListener('block-frames-config-changed', handler)
      this.storage.handleConfigChange = null
    }
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: blockFramesPluginKey,
        state: {
          init: (_config, instance): PluginState => ({
            decorations: buildDecorations(instance.doc),
            config: getCurrentBlockFramesConfig(),
          }),
          apply: (tr, old): PluginState => {
            const wantRebuild = Boolean(tr.getMeta('block-frames-rebuild'))
            if (!tr.docChanged && !wantRebuild) return old
            const config = getCurrentBlockFramesConfig()
            // A rebuild request with an unchanged config and unchanged doc is a
            // no-op — return the same state so ProseMirror sees no decoration
            // change and does not disturb NodeViews.
            if (!tr.docChanged && configEqual(config, old.config)) return old
            return { decorations: buildDecorations(tr.doc), config }
          },
        },
        props: {
          decorations(state) {
            return blockFramesPluginKey.getState(state)?.decorations
          },
        },
      }),
    ]
  },
})
