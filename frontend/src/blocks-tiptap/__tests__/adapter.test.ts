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
      content: [{ type: 'paragraph', attrs: { _rowId: null } }],
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
          attrs: { _rowId: 'p1' },
          content: [{ type: 'text', text: 'Hello' }],
        },
        { type: 'paragraph', attrs: { _rowId: null } },
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
          attrs: { level: 2, _rowId: 'h1' },
          content: [{ type: 'text', text: 'Section A' }],
        },
        { type: 'paragraph', attrs: { _rowId: null } },
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
              attrs: { _rowId: 'b1' },
              content: [
                {
                  type: 'paragraph',
                  content: [{ type: 'text', text: 'item one' }],
                },
              ],
            },
          ],
        },
        { type: 'paragraph', attrs: { _rowId: null } },
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
          content: [
            { id: 'b1', text: 'a' },
            { id: 'b2', text: 'b' },
            { id: 'b3', text: 'c' },
          ].map(({ id, text }) => ({
            type: 'listItem',
            attrs: { _rowId: id },
            content: [
              { type: 'paragraph', content: [{ type: 'text', text }] },
            ],
          })),
        },
        { type: 'paragraph', attrs: { _rowId: null } },
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
        { type: 'paragraph', attrs: { _rowId: 'p1' }, content: [{ type: 'text', text: 'P1' }] },
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              attrs: { _rowId: 'b1' },
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'L1' }] }],
            },
          ],
        },
        { type: 'paragraph', attrs: { _rowId: 'p2' }, content: [{ type: 'text', text: 'P2' }] },
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              attrs: { _rowId: 'b2' },
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'L2' }] }],
            },
          ],
        },
        { type: 'paragraph', attrs: { _rowId: null } },
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
              attrs: { _rowId: 'n1' },
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'one' }] }],
            },
            {
              type: 'listItem',
              attrs: { _rowId: 'n2' },
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'two' }] }],
            },
          ],
        },
        { type: 'paragraph', attrs: { _rowId: null } },
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
              attrs: { _rowId: 'A' },
              content: [
                { type: 'paragraph', content: [{ type: 'text', text: 'A' }] },
                {
                  type: 'bulletList',
                  content: [
                    {
                      type: 'listItem',
                      attrs: { _rowId: 'B' },
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
        { type: 'paragraph', attrs: { _rowId: null } },
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
      content: { width_pct: 50 },
      sort_order: 0,
      parent_id: 'CL',
    }),
    makeRow({
      id: 'C1',
      block_type: 'column',
      content: { width_pct: 50 },
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
          attrs: { column_count: 2, _rowId: 'CL' },
          content: [
            {
              type: 'column',
              attrs: { width_pct: 50, _rowId: 'C0' },
              content: [
                { type: 'paragraph', attrs: { _rowId: 'P0' }, content: [{ type: 'text', text: 'left' }] },
              ],
            },
            {
              type: 'column',
              attrs: { width_pct: 50, _rowId: 'C1' },
              content: [
                { type: 'paragraph', attrs: { _rowId: 'P1' }, content: [{ type: 'text', text: 'right' }] },
              ],
            },
          ],
        },
        { type: 'paragraph', attrs: { _rowId: null } },
      ],
    },
  }
}

function fixture17_nonEvenColumns(): Fixture {
  const rows = [
    makeRow({
      id: 'CL17',
      block_type: 'column_list',
      content: { column_count: 2 },
      sort_order: 0,
    }),
    makeRow({
      id: 'C17A',
      block_type: 'column',
      content: { width_pct: 30 },
      sort_order: 0,
      parent_id: 'CL17',
    }),
    makeRow({
      id: 'C17B',
      block_type: 'column',
      content: { width_pct: 70 },
      sort_order: 1,
      parent_id: 'CL17',
    }),
    makeRow({
      id: 'P17A',
      block_type: 'paragraph',
      content: { text: 'narrow' },
      sort_order: 0,
      parent_id: 'C17A',
    }),
    makeRow({
      id: 'P17B',
      block_type: 'paragraph',
      content: { text: 'wide' },
      sort_order: 0,
      parent_id: 'C17B',
    }),
  ]
  return {
    name: '17. non-even column widths (30/70)',
    inputRows: rows,
    expectedDoc: {
      type: 'doc',
      content: [
        {
          type: 'column_list',
          attrs: { column_count: 2, _rowId: 'CL17' },
          content: [
            {
              type: 'column',
              attrs: { width_pct: 30, _rowId: 'C17A' },
              content: [
                { type: 'paragraph', attrs: { _rowId: 'P17A' }, content: [{ type: 'text', text: 'narrow' }] },
              ],
            },
            {
              type: 'column',
              attrs: { width_pct: 70, _rowId: 'C17B' },
              content: [
                { type: 'paragraph', attrs: { _rowId: 'P17B' }, content: [{ type: 'text', text: 'wide' }] },
              ],
            },
          ],
        },
        { type: 'paragraph', attrs: { _rowId: null } },
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
          attrs: { icon: '💡', color: 'gray_background', text: 'note', _rowId: 'cal' },
        },
        { type: 'horizontalRule', attrs: { _rowId: 'div' } },
        { type: 'flow_panel', attrs: { ...flowContent, _rowId: 'fp' } },
        { type: 'if_panel', attrs: { ...ifContent, _rowId: 'ip' } },
        { type: 'paragraph', attrs: { _rowId: null } },
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
  fixture17_nonEvenColumns,
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
      // tiptapDocToRows skips the adapter-injected trailing empty paragraph,
      // so rebuilt should always match the original input rows exactly.
      expect(normalizeForComparison(rebuilt)).toEqual(normalizeForComparison(fixt.inputRows))
      // _rowId round-trip: every input row's id appears in rebuilt rows.
      const inputIds = [...fixt.inputRows.map((r) => r.id)].sort()
      const rebuiltIds = [...rebuilt.map((r) => r.id)].sort()
      expect(rebuiltIds).toEqual(inputIds)
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
          attrs: { level: 3, _rowId: 'h4' },
          content: [{ type: 'text', text: 'subsubsection' }],
        },
        { type: 'paragraph', attrs: { _rowId: null } },
      ],
    })
    expect(warnSpy).toHaveBeenCalled()
  })
})

describe('adversarial — unsupported block types throw', () => {
  it('12. unknown block_type throws UnsupportedBlockTypeError', () => {
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

// -----------------------------------------------------------------------------
// Table round-trip fixtures (15, 16)
// -----------------------------------------------------------------------------

describe('table — DB→Tiptap + round-trip', () => {
  it('15. 2×2 table with column header — DB→Tiptap', () => {
    const row = makeRow({
      id: 'tbl-2x2',
      block_type: 'table',
      content: {
        table_width: 2,
        has_column_header: true,
        has_row_header: false,
        rows: [['Name', 'Age'], ['Alice', '30']],
      },
      sort_order: 0,
    })
    const doc = rowsToTiptapDoc([row])
    expect(doc).toEqual({
      type: 'doc',
      content: [
        {
          type: 'table',
          attrs: { _rowId: 'tbl-2x2' },
          content: [
            {
              type: 'tableRow',
              content: [
                { type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Name' }] }] },
                { type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Age' }] }] },
              ],
            },
            {
              type: 'tableRow',
              content: [
                { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Alice' }] }] },
                { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: '30' }] }] },
              ],
            },
          ],
        },
        { type: 'paragraph', attrs: { _rowId: null } },
      ],
    })
  })

  it('15. 2×2 table with column header — round-trip', () => {
    const row = makeRow({
      id: 'tbl-2x2',
      block_type: 'table',
      content: {
        table_width: 2,
        has_column_header: true,
        has_row_header: false,
        rows: [['Name', 'Age'], ['Alice', '30']],
      },
      sort_order: 0,
    })
    const doc = rowsToTiptapDoc([row])
    const rebuilt = tiptapDocToRows(doc, EXPERIMENT_ID)
    expect(normalizeForComparison(rebuilt)).toEqual(normalizeForComparison([row]))
  })

  it('16. 3×3 table with column AND row headers — DB→Tiptap', () => {
    const row = makeRow({
      id: 'tbl-3x3',
      block_type: 'table',
      content: {
        table_width: 3,
        has_column_header: true,
        has_row_header: true,
        rows: [['', 'Q1', 'Q2'], ['Sales', '100', '120'], ['Costs', '60', '80']],
      },
      sort_order: 0,
    })
    const doc = rowsToTiptapDoc([row])
    const table = doc.content![0]
    expect(table.type).toBe('table')
    // Row 0: all three cells are tableHeader (col header + row header corner)
    const row0 = table.content![0].content!
    expect(row0.every((c) => c.type === 'tableHeader')).toBe(true)
    // Row 1 col 0: tableHeader (row header)
    expect(table.content![1].content![0].type).toBe('tableHeader')
    // Row 1 col 1: tableCell
    expect(table.content![1].content![1].type).toBe('tableCell')
    // Row 2 col 0: tableHeader (row header)
    expect(table.content![2].content![0].type).toBe('tableHeader')
  })

  it('16. 3×3 table with column AND row headers — round-trip', () => {
    const row = makeRow({
      id: 'tbl-3x3',
      block_type: 'table',
      content: {
        table_width: 3,
        has_column_header: true,
        has_row_header: true,
        rows: [['', 'Q1', 'Q2'], ['Sales', '100', '120'], ['Costs', '60', '80']],
      },
      sort_order: 0,
    })
    const doc = rowsToTiptapDoc([row])
    const rebuilt = tiptapDocToRows(doc, EXPERIMENT_ID)
    expect(normalizeForComparison(rebuilt)).toEqual(normalizeForComparison([row]))
  })
})

// -----------------------------------------------------------------------------
// _rowId stable identity (Phase 10a)
// -----------------------------------------------------------------------------

describe('_rowId stable identity', () => {
  it('18. DB→Tiptap populates _rowId on every row-backed node', () => {
    const rows: ExperimentBlock[] = [
      makeRow({ id: 'p-x', block_type: 'paragraph', content: { text: 'hi' }, sort_order: 0 }),
      makeRow({ id: 'h-x', block_type: 'heading_1', content: { text: 'Title' }, sort_order: 1 }),
      makeRow({ id: 'd-x', block_type: 'divider', content: {}, sort_order: 2 }),
      makeRow({ id: 'b-x', block_type: 'bulleted_list_item', content: { text: 'b' }, sort_order: 3 }),
      makeRow({ id: 'cal-x', block_type: 'callout', content: { text: 'note', icon: '💡', color: 'gray' }, sort_order: 4 }),
      makeRow({ id: 'cl-x', block_type: 'column_list', content: { column_count: 2 }, sort_order: 5 }),
      makeRow({ id: 'col-a', block_type: 'column', content: { width_pct: 50 }, sort_order: 0, parent_id: 'cl-x' }),
      makeRow({ id: 'col-b', block_type: 'column', content: { width_pct: 50 }, sort_order: 1, parent_id: 'cl-x' }),
      makeRow({
        id: 'tbl-x',
        block_type: 'table',
        content: { table_width: 1, has_column_header: false, has_row_header: false, rows: [['cell']] },
        sort_order: 6,
      }),
    ]
    const doc = rowsToTiptapDoc(rows)
    const inputIds = new Set(rows.map((r) => r.id))
    const seenRowIds = new Set<string>()
    // Synthetic wrappers/inner structure that don't correspond to a DB row.
    // _rowId on these (if present) MUST be null/undefined.
    const SYNTHETIC_TYPES = new Set([
      'doc', 'bulletList', 'orderedList', 'tableRow', 'tableHeader', 'tableCell', 'text',
    ])

    function walk(node: JSONContentLike, ancestorIsSynthetic: boolean): void {
      const type = node.type
      const attrs = node.attrs ?? {}
      const isSynthetic = SYNTHETIC_TYPES.has(type)
      if (isSynthetic) {
        const rid = attrs._rowId
        expect(rid === null || rid === undefined).toBe(true)
      } else if (ancestorIsSynthetic) {
        // E.g., the inner paragraph emitted by buildListItem (parent is listItem
        // but listItem itself is row-backed) — actually inner paragraphs of
        // listItem and tableCell are nested inside non-row-backed structure.
        // Skip the assertion if this node is structural fill.
        const rid = attrs._rowId
        expect(rid === null || rid === undefined).toBe(true)
      } else {
        const rid = attrs._rowId
        if (rid === null || rid === undefined) {
          // Adapter-injected node (e.g., trailing empty paragraph) — no DB row.
        } else {
          expect(typeof rid).toBe('string')
          expect((rid as string).length).toBeGreaterThan(0)
          expect(inputIds.has(rid as string)).toBe(true)
          seenRowIds.add(rid as string)
        }
      }
      // Inner paragraphs of listItem/tableCell are structural fill — flag
      // their children as synthetic-descended.
      const childIsSyntheticDescended =
        type === 'listItem' || type === 'tableCell' || type === 'tableHeader'
      for (const child of node.content ?? []) {
        walk(child as JSONContentLike, childIsSyntheticDescended)
      }
    }

    walk(doc as JSONContentLike, false)

    expect([...seenRowIds].sort()).toEqual([...rows.map((r) => r.id)].sort())
  })

  it('19. fresh Tiptap nodes (no _rowId) get generated UUIDs', () => {
    // Construct a doc directly — simulating slash-menu-inserted nodes
    // before the save coordinator assigns ids.
    const doc: TiptapDoc = {
      type: 'doc',
      content: [
        // No attrs at all.
        { type: 'paragraph', content: [{ type: 'text', text: 'fresh para' }] },
        // attrs without _rowId.
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'fresh heading' }] },
        // _rowId explicitly null.
        { type: 'horizontalRule', attrs: { _rowId: null } },
      ],
    }
    const rebuilt = tiptapDocToRows(doc, EXPERIMENT_ID)
    expect(rebuilt).toHaveLength(3)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    for (const row of rebuilt) {
      expect(row.id).toMatch(uuidRegex)
    }
    // All ids unique.
    expect(new Set(rebuilt.map((r) => r.id)).size).toBe(3)
  })

  it('19b. _rowId is stripped from row.content for panels and callout', () => {
    const flowContent: Record<string, unknown> = {
      source_panel_id: 'src-flow',
      name: 'X',
      targets: [],
      assignments: [],
    }
    const doc: TiptapDoc = {
      type: 'doc',
      content: [
        {
          type: 'flow_panel',
          attrs: { ...flowContent, _rowId: 'fp-99' },
        },
        {
          type: 'callout',
          attrs: { text: 'note', icon: '💡', color: 'gray', _rowId: 'cal-99' },
        },
      ],
    }
    const rebuilt = tiptapDocToRows(doc, EXPERIMENT_ID)
    expect(rebuilt).toHaveLength(2)
    expect(rebuilt[0].id).toBe('fp-99')
    expect(rebuilt[1].id).toBe('cal-99')
    expect('_rowId' in (rebuilt[0].content as Record<string, unknown>)).toBe(false)
    expect('_rowId' in (rebuilt[1].content as Record<string, unknown>)).toBe(false)
  })
})

// -----------------------------------------------------------------------------
// Trailing paragraph — phantom-write prevention (Phase 12-fix)
// -----------------------------------------------------------------------------

describe('trailing paragraph — phantom-write prevention', () => {
  it('20. rowsToTiptapDoc always appends a trailing empty paragraph', () => {
    const inputs: ExperimentBlock[][] = [
      [],
      [makeRow({ id: 'fp', block_type: 'flow_panel', content: { name: 'P', targets: [], assignments: [] }, sort_order: 0 })],
      [makeRow({ id: 'h', block_type: 'heading_1', content: { text: 'Title' }, sort_order: 0 })],
      [makeRow({ id: 'div', block_type: 'divider', content: {}, sort_order: 0 })],
      [makeRow({ id: 'p', block_type: 'paragraph', content: { text: 'Hello' }, sort_order: 0 })],
    ]
    for (const rows of inputs) {
      const doc = rowsToTiptapDoc(rows)
      const content = doc.content ?? []
      const last = content[content.length - 1]
      expect(last).toBeDefined()
      expect(last.type).toBe('paragraph')
      expect(last.attrs?._rowId).toBeNull()
      const hasText = last.content != null && last.content.length > 0
      expect(hasText).toBe(false)
    }
  })

  it('21. tiptapDocToRows skips a trailing empty paragraph', () => {
    const trailingParagraph: TiptapDoc = {
      type: 'doc',
      content: [
        { type: 'flow_panel', attrs: { name: 'P', targets: [], assignments: [], _rowId: 'fp-1' } },
        { type: 'paragraph', attrs: { _rowId: null } },
      ],
    }
    const rows = tiptapDocToRows(trailingParagraph, EXPERIMENT_ID)
    expect(rows).toHaveLength(1)
    expect(rows[0].block_type).toBe('flow_panel')

    // Non-empty trailing paragraph is NOT skipped.
    const nonEmptyTrailing: TiptapDoc = {
      type: 'doc',
      content: [
        { type: 'paragraph', attrs: { _rowId: 'p-a' }, content: [{ type: 'text', text: 'kept' }] },
        { type: 'paragraph', attrs: { _rowId: 'p-b' }, content: [{ type: 'text', text: 'also kept' }] },
      ],
    }
    const rows2 = tiptapDocToRows(nonEmptyTrailing, EXPERIMENT_ID)
    expect(rows2).toHaveLength(2)

    // Middle empty paragraph is NOT skipped (only trailing is).
    const middleEmpty: TiptapDoc = {
      type: 'doc',
      content: [
        { type: 'paragraph', attrs: { _rowId: 'p-1' } },
        { type: 'paragraph', attrs: { _rowId: 'p-2' }, content: [{ type: 'text', text: 'end' }] },
      ],
    }
    const rows3 = tiptapDocToRows(middleEmpty, EXPERIMENT_ID)
    expect(rows3).toHaveLength(2)
  })
})

// Local type for walking JSONContent in test 18.
interface JSONContentLike {
  type: string
  attrs?: Record<string, unknown>
  content?: JSONContentLike[]
}
