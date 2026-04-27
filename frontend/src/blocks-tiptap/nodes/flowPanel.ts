import { Node, mergeAttributes } from '@tiptap/core'

export const FlowPanel = Node.create({
  name: 'flow_panel',

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
      instrument: {
        default: null,
        rendered: false,
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
          volume_per_sample_ul: 100,
          pipet_error_factor: 1.1,
          dilution_source: 'flow',
        },
        rendered: false,
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-block-type="flow_panel"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes({ 'data-block-type': 'flow_panel' }, HTMLAttributes)]
  },
})
