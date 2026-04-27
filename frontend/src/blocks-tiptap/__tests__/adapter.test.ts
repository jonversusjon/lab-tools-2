import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  rowsToTiptapDoc,
  tiptapDocToRows,
  UnsupportedBlockTypeError,
  type TiptapDoc,
} from '@/blocks-tiptap/adapter'
import type { ExperimentBlock } from '@/types'

const EXPERIMENT_ID = 'test-experiment-id'

let idCounter = 0
function makeId(prefix: string = 'row'): string {
  idCounter += 1
  return prefix + '-' + String(idCounter)
}

beforeEach(() => {
  idCounter = 0
})

function makeRow(overrides: Partial<ExperimentBlock> & { block_type: string }): ExperimentBlock {
  return {
    id: overrides.id ?? makeId(),
    experiment_id: overrides.experiment_id ?? EXPERIMENT_ID,
    block_type: overrides.block_type,
    content: overrides.content ?? {},
    sort_order: overrides.sort_order ?? 0,
    parent_id: overrides.parent_id ?? null,
    created_at: overrides.created_at ?? null,
    updated_at: overrides.updated_at ?? null,
  }
}

interface NormalizedRow {
  position: string
  parent_position: string | null
  block_type: string
  content: Record<string, unknown>
}

function normalizeForComparison(rows: ExperimentBlock[]): NormalizedRow[] {
  // Build child map keyed by parent id (or "__root__" for top-level).
  const ROOT = '__root__'
  const byParent = new Map<string, ExperimentBlock[]>()
  for (const row of rows) {
    const key = row.parent_id ?? ROOT
    const list = byParent.get(key)
    if (list) {
      list.push(row)
    } else {
      byParent.set(key, [row])
    }
  }
  for (const list of byParent.values()) {
    list.sort((a, b) => a.sort_order - b.sort_order)
  }

  // Walk tree; assign each row a topological position string.
  const positionById = new Map<string, string>()

  function walk(parentKey: string, parentPosition: string | null): void {
    const children = byParent.get(parentKey) ?? []
    children.forEach((child, idx) => {
      const position = parentPosition === null ? String(idx) : parentPosition + '.' + String(idx)
      positionById.set(child.id, position)
      walk(child.id, position)
    })
  }
  walk(ROOT, null)

  // Emit normalized rows in topological order.
  const result: NormalizedRow[] = []
  function emit(parentKey: string): void {
    const children = byParent.get(parentKey) ?? []
    for (const child of children) {
      const position = positionById.get(child.id)!
      const parentPosition =
        child.parent_id === null || child.parent_id === undefined
          ? null
          : positionById.get(child.parent_id) ?? null
      result.push({
        position,
        parent_position: parentPosition,
        block_type: child.block_type,
        content: child.content,
      })
      emit(child.id)
    }
  }
  emit(ROOT)
  return result
}

// -----------------------------------------------------------------------------
// Happy-path fixtures
// -----------------------------------------------------------------------------

interface Fixture {
  name: string
  inputRows: ExperimentBlock[]
  expectedDoc: TiptapDoc
}

function fixture1_emptyDoc(): Fixture {
  return {
    name: '1. empty doc',
    inputRows: [],
    expectedDoc: {
      type: 'doc',
      content: [{ type: 'paragraph' }],
    },
  }
}

function fixture2_singleParagraph(): Fixture {
  const row = makeRow({
    id: 'p1',
    block_type: 'paragraph',
    content: { text: 'Hello' },
    sort_order: 0,
  })
  return {
    name: '2. single paragraph',
    inputRows: [row],
    expectedDoc: {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Hello' }],
        },
      ],
    },
  }
}

function fixture3_singleHeading(): Fixture {
  const row = makeRow({
    id: 'h1',
    block_type: 'heading_2',
    content: { text: 'Section A' },
    sort_order: 0,
  })
  return {
    name: '3. single heading',
    inputRows: [row],
    expectedDoc: {
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: 'Section A' }],
        },
      ],
    },
  }
}

function fixture4_singleBullet(): Fixture {
  const row = makeRow({
    id: 'b1',
    block_type: 'bulleted_list_item',
    content: { text: 'item one' },
    sort_order: 0,
  })
  return {
    name: '4. single bulleted list item',
    inputRows: [row],
    expectedDoc: {
      type: 'doc',
      content: [
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [
                {
                  type: 'paragraph',
                  content: [{ type: 'text', text: 'item one' }],
                },
              ],
            },
          ],
        },
      ],
    },
  }
}

function fixture5_threeBullets(): Fixture {
  const rows = [
    makeRow({ id: 'b1', block_type: 'bulleted_list_item', content: { text: 'a' }, sort_order: 0 }),
    makeRow({ id: 'b2', block_type: 'bulleted_list_item', content: { text: 'b' }, sort_order: 1 }),
    makeRow({ id: 'b3', block_type: 'bulleted_list_item', content: { text: 'c' }, sort_order: 2 }),
  ]
  return {
    name: '5. three consecutive bullets',
    inputRows: rows,
    expectedDoc: {
      type: 'doc',
      content: [
        {
          type: 'bulletList',
          content: ['a', 'b', 'c'].map((t) => ({
            type: 'listItem',
            content: [
              { type: 'paragraph', content: [{ type: 'text', text: t }] },
            ],
          })),
        },
      ],
    },
  }
}

function fixture6_mixedGrouping(): Fixture {
  const rows = [
    makeRow({ id: 'p1', block_type: 'paragraph', content: { text: 'P1' }, sort_order: 0 }),
    makeRow({ id: 'b1', block_type: 'bulleted_list_item', content: { text: 'L1' }, sort_order: 1 }),
    makeRow({ id: 'p2', block_type: 'paragraph', content: { text: 'P2' }, sort_order: 2 }),
    makeRow({ id: 'b2', block_type: 'bulleted_list_item', content: { text: 'L2' }, sort_order: 3 }),
  ]
  return {
    name: '6. paragraph,bullet,paragraph,bullet',
    inputRows: rows,
    expectedDoc: {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'P1' }] },
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'L1' }] }],
            },
          ],
        },
        { type: 'paragraph', content: [{ type: 'text', text: 'P2' }] },
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'L2' }] }],
            },
          ],
        },
      ],
    },
  }
}

function fixture7_numberedList(): Fixture {
  const rows = [
    makeRow({ id: 'n1', block_type: 'numbered_list_item', content: { text: 'one' }, sort_order: 0 }),
    makeRow({ id: 'n2', block_type: 'numbered_list_item', content: { text: 'two' }, sort_order: 1 }),
  ]
  return {
    name: '7. numbered list with 2 items',
    inputRows: rows,
    expectedDoc: {
      type: 'doc',
      content: [
        {
          type: 'orderedList',
          content: [
            {
              type: 'listItem',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'one' }] }],
            },
            {
              type: 'listItem',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'two' }] }],
            },
          ],
        },
      ],
    },
  }
}

function fixture8_nestedBullets(): Fixture {
  const rows = [
    makeRow({ id: 'A', block_type: 'bulleted_list_item', content: { text: 'A' }, sort_order: 0 }),
    makeRow({
      id: 'B',
      block_type: 'bulleted_list_item',
      content: { text: 'B' },
      sort_order: 0,
      parent_id: 'A',
    }),
  ]
  return {
    name: '8. nested bulleted list',
    inputRows: rows,
    expectedDoc: {
      type: 'doc',
      content: [
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [
                { type: 'paragraph', content: [{ type: 'text', text: 'A' }] },
                {
                  type: 'bulletList',
                  content: [
                    {
                      type: 'listItem',
                      content: [
                        { type: 'paragraph', content: [{ type: 'text', text: 'B' }] },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  }
}

function fixture9_columns(): Fixture {
  const rows = [
    makeRow({
      id: 'CL',
      block_type: 'column_list',
      content: { column_count: 2 },
      sort_order: 0,
    }),
    makeRow({
      id: 'C0',
      block_type: 'column',
      content: { column_index: 0 },
      sort_order: 0,
      parent_id: 'CL',
    }),
    makeRow({
      id: 'C1',
      block_type: 'column',
      content: { column_index: 1 },
      sort_order: 1,
      parent_id: 'CL',
    }),
    makeRow({
      id: 'P0',
      block_type: 'paragraph',
      content: { text: 'left' },
      sort_order: 0,
      parent_id: 'C0',
    }),
    makeRow({
      id: 'P1',
      block_type: 'paragraph',
      content: { text: 'right' },
      sort_order: 0,
      parent_id: 'C1',
    }),
  ]
  return {
    name: '9. column nesting (2 cols, 1 paragraph each)',
    inputRows: rows,
    expectedDoc: {
      type: 'doc',
      content: [
        {
          type: 'column_list',
          attrs: { column_count: 2 },
          content: [
            {
              type: 'column',
              attrs: { column_index: 0 },
              content: [
                { type: 'paragraph', content: [{ type: 'text', text: 'left' }] },
              ],
            },
            {
              type: 'column',
              attrs: { column_index: 1 },
              content: [
                { type: 'paragraph', content: [{ type: 'text', text: 'right' }] },
              ],
            },
          ],
        },
      ],
    },
  }
}

function fixture10_atoms(): Fixture {
  const flowContent = {
    source_panel_id: 'src-flow',
    name: 'Flow Panel A',
    instrument: { id: 'inst-1', name: 'BD FACSAria', lasers: [] },
    targets: [
      {
        id: 't1',
        antibody_id: 'ab1',
        antibody_name: 'CD3',
        antibody_target: 'CD3',
        antibody_host: 'Mouse',
        antibody_clone: 'OKT3',
        dye_label_id: null,
        dye_label_name: null,
        dye_label_target: null,
        dye_label_fluorophore_id: null,
        dye_label_fluorophore_name: null,
        staining_mode: 'direct',
        secondary_antibody_id: null,
        secondary_antibody_name: null,
        sort_order: 0,
        flow_dilution_factor: 100,
        icc_if_dilution_factor: null,
      },
    ],
    assignments: [
      {
        id: 'a1',
        antibody_id: 'ab1',
        dye_label_id: null,
        fluorophore_id: 'fitc',
        fluorophore_name: 'FITC',
        detector_id: 'd1',
        detector_name: '530/30',
      },
    ],
    volume_params: {
      num_samples: 1,
      volume_per_sample_ul: 100,
      pipet_error_factor: 1.1,
      dilution_source: 'flow',
    },
  }
  const ifContent = {
    source_panel_id: 'src-if',
    name: 'IF Panel B',
    panel_type: 'IF',
    microscope: { id: 'mi-1', name: 'Leica SP8', lasers: [] },
    view_mode: 'simple',
    targets: [],
    assignments: [],
    volume_params: {
      num_samples: 1,
      volume_per_sample_ul: 200,
      pipet_error_factor: 1.1,
      dilution_source: 'icc_if',
    },
  }
  const rows = [
    makeRow({
      id: 'cal',
      block_type: 'callout',
      content: { text: 'note', icon: '💡', color: 'gray_background' },
      sort_order: 0,
    }),
    makeRow({ id: 'div', block_type: 'divider', content: {}, sort_order: 1 }),
    makeRow({ id: 'fp', block_type: 'flow_panel', content: flowContent, sort_order: 2 }),
    makeRow({ id: 'ip', block_type: 'if_panel', content: ifContent, sort_order: 3 }),
  ]
  return {
    name: '10. all atoms',
    inputRows: rows,
    expectedDoc: {
      type: 'doc',
      content: [
        {
          type: 'callout',
          attrs: { icon: '💡', color: 'gray_background', text: 'note' },
        },
        { type: 'horizontalRule' },
        { type: 'flow_panel', attrs: { ...flowContent } },
        { type: 'if_panel', attrs: { ...ifContent } },
      ],
    },
  }
}

const happyPathFixtures: (() => Fixture)[] = [
  fixture1_emptyDoc,
  fixture2_singleParagraph,
  fixture3_singleHeading,
  fixture4_singleBullet,
  fixture5_threeBullets,
  fixture6_mixedGrouping,
  fixture7_numberedList,
  fixture8_nestedBullets,
  fixture9_columns,
  fixture10_atoms,
]

describe('rowsToTiptapDoc — happy paths', () => {
  for (const factory of happyPathFixtures) {
    const fx = factory()
    it(fx.name + ' — DB→Tiptap', () => {
      const fixt = factory()
      const doc = rowsToTiptapDoc(fixt.inputRows)
      expect(doc).toEqual(fixt.expectedDoc)
    })
  }
})

describe('round-trip — Tiptap→DB→Tiptap structural equivalence', () => {
  for (const factory of happyPathFixtures) {
    const fx = factory()
    it(fx.name + ' — round-trip', () => {
      const fixt = factory()
      const doc = rowsToTiptapDoc(fixt.inputRows)
      const rebuilt = tiptapDocToRows(doc, EXPERIMENT_ID)
      // For empty-doc, source rows is [] and rebuilt has one paragraph row.
      // Normalize source by piping it through rowsToTiptapDoc → tiptapDocToRows
      // is wrong; instead compare normalized versions of (input vs rebuilt).
      // For fixture 1 specifically, rebuilt will produce one empty paragraph
      // because we emit an empty paragraph in the doc. The "input" is [].
      // Skip the normalization equality for fixture 1; verify rebuilt has 1
      // empty paragraph row instead.
      if (fixt.inputRows.length === 0) {
        expect(rebuilt).toHaveLength(1)
        expect(rebuilt[0].block_type).toBe('paragraph')
        expect(rebuilt[0].content).toEqual({ text: '' })
        expect(rebuilt[0].parent_id).toBeNull()
        return
      }
      expect(normalizeForComparison(rebuilt)).toEqual(normalizeForComparison(fixt.inputRows))
    })
  }
})

// -----------------------------------------------------------------------------
// Adversarial fixtures
// -----------------------------------------------------------------------------

describe('adversarial — heading_4 demotion', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    warnSpy.mockRestore()
  })

  it('11. demotes heading_4 to level 3 with original text', () => {
    const row = makeRow({
      id: 'h4',
      block_type: 'heading_4',
      content: { text: 'subsubsection' },
      sort_order: 0,
    })
    const doc = rowsToTiptapDoc([row])
    expect(doc).toEqual({
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 3 },
          content: [{ type: 'text', text: 'subsubsection' }],
        },
      ],
    })
    expect(warnSpy).toHaveBeenCalled()
  })
})

describe('adversarial — unsupported block types throw', () => {
  it('12. table block throws UnsupportedBlockTypeError', () => {
    const row = makeRow({
      id: 'tbl-1',
      block_type: 'table',
      content: {
        table_width: 2,
        has_column_header: false,
        has_row_header: false,
        rows: [
          ['a', 'b'],
          ['c', 'd'],
        ],
      },
      sort_order: 0,
    })
    let caught: unknown = null
    try {
      rowsToTiptapDoc([row])
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(UnsupportedBlockTypeError)
    expect((caught as UnsupportedBlockTypeError).blockType).toBe('table')
    expect((caught as UnsupportedBlockTypeError).blockId).toBe('tbl-1')
  })

  it('13. unknown block_type throws UnsupportedBlockTypeError', () => {
    const row = makeRow({
      id: 'unk-1',
      block_type: 'not_a_real_block',
      content: {},
      sort_order: 0,
    })
    let caught: unknown = null
    try {
      rowsToTiptapDoc([row])
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(UnsupportedBlockTypeError)
    expect((caught as UnsupportedBlockTypeError).blockType).toBe('not_a_real_block')
    expect((caught as UnsupportedBlockTypeError).blockId).toBe('unk-1')
  })
})

// -----------------------------------------------------------------------------
// Regression: is_toggleable
// -----------------------------------------------------------------------------

describe('regression — is_toggleable on headings is dropped', () => {
  it('14. round-trip drops is_toggleable, preserves text', () => {
    const row = makeRow({
      id: 'h-tog',
      block_type: 'heading_2',
      content: { text: 'Toggle me', is_toggleable: true },
      sort_order: 0,
    })
    const doc = rowsToTiptapDoc([row])
    const rebuilt = tiptapDocToRows(doc, EXPERIMENT_ID)
    expect(rebuilt).toHaveLength(1)
    expect(rebuilt[0].block_type).toBe('heading_2')
    expect(rebuilt[0].content).toEqual({ text: 'Toggle me' })
    const content = rebuilt[0].content as Record<string, unknown>
    const hasToggle = 'is_toggleable' in content && content['is_toggleable'] === true
    expect(hasToggle).toBe(false)
  })
})
