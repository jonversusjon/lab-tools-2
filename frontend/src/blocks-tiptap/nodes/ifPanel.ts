import { Node, mergeAttributes } from '@tiptap/core'

export const IfPanel = Node.create({
  name: 'if_panel',

  group: 'block',

  atom: true,

  selectable: true,

  draggable: true,

  addAttributes() {
    return {
      source_panel_id: {
        default: null,
      },
      name: {
        default: '',
      },
      panel_type: {
        default: 'IF',
      },
      microscope: {
        default: null,
        rendered: false,
      },
      view_mode: {
        default: 'simple',
      },
      targets: {
        default: [],
        rendered: false,
      },
      assignments: {
        default: [],
        rendered: false,
      },
      volume_params: {
        default: {
          num_samples: 1,
          volume_per_sample_ul: 200,
          pipet_error_factor: 1.1,
          dilution_source: 'icc_if',
        },
        rendered: false,
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-block-type="if_panel"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes({ 'data-block-type': 'if_panel' }, HTMLAttributes)]
  },
})
