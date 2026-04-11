import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ColumnLayout from '@/components/experiments/ColumnLayout'
import type { ExperimentBlock } from '@/types'

// BlockCommandMenu opens when the user clicks the + button; not under test here.
vi.mock('@/components/experiments/BlockCommandMenu', () => ({
  default: () => null,
}))

const EXP_ID = 'exp-1'

const columnListBlock: ExperimentBlock = {
  id: 'col-list-1',
  experiment_id: EXP_ID,
  block_type: 'column_list',
  content: { column_count: 2 },
  sort_order: 1,
  parent_id: null,
  created_at: null,
  updated_at: null,
}

const column1Block: ExperimentBlock = {
  id: 'col-1',
  experiment_id: EXP_ID,
  block_type: 'column',
  content: { column_index: 0 },
  sort_order: 0,
  parent_id: columnListBlock.id,
  created_at: null,
  updated_at: null,
}

const column2Block: ExperimentBlock = {
  id: 'col-2',
  experiment_id: EXP_ID,
  block_type: 'column',
  content: { column_index: 1 },
  sort_order: 1,
  parent_id: columnListBlock.id,
  created_at: null,
  updated_at: null,
}

const h4Block: ExperimentBlock = {
  id: 'h4-block',
  experiment_id: EXP_ID,
  block_type: 'heading_4',
  content: { text: 'My Heading' },
  sort_order: 0,
  parent_id: column1Block.id,
  created_at: null,
  updated_at: null,
}

const paraBlock: ExperimentBlock = {
  id: 'para-block',
  experiment_id: EXP_ID,
  block_type: 'paragraph',
  content: { text: 'Some text' },
  sort_order: 0,
  parent_id: column2Block.id,
  created_at: null,
  updated_at: null,
}

const childrenByParentId = {
  [columnListBlock.id]: [column1Block, column2Block],
  [column1Block.id]: [h4Block],
  [column2Block.id]: [paraBlock],
}

function renderBlock(block: ExperimentBlock) {
  return <div data-testid={'block-' + block.id}>{block.block_type}</div>
}

describe('ColumnLayout — deleting a child block', () => {
  it('renders a delete button for each child block', () => {
    render(
      <ColumnLayout
        experimentId={EXP_ID}
        block={columnListBlock}
        childrenByParentId={childrenByParentId}
        renderBlock={renderBlock}
        onAddBlockToColumn={vi.fn()}
        onDeleteColumnBlock={vi.fn()}
      />
    )
    const deleteButtons = screen.getAllByTitle('Delete block')
    expect(deleteButtons).toHaveLength(2) // one per column child
  })

  it('calls onDeleteColumnBlock with the correct block id', () => {
    const onDelete = vi.fn()
    render(
      <ColumnLayout
        experimentId={EXP_ID}
        block={columnListBlock}
        childrenByParentId={childrenByParentId}
        renderBlock={renderBlock}
        onAddBlockToColumn={vi.fn()}
        onDeleteColumnBlock={onDelete}
      />
    )
    // The first × button belongs to h4Block (in column 1)
    const [firstDeleteBtn] = screen.getAllByTitle('Delete block')
    fireEvent.click(firstDeleteBtn)
    expect(onDelete).toHaveBeenCalledOnce()
    expect(onDelete).toHaveBeenCalledWith(h4Block.id)
  })

  it('does not render delete buttons when onDeleteColumnBlock is not provided', () => {
    render(
      <ColumnLayout
        experimentId={EXP_ID}
        block={columnListBlock}
        childrenByParentId={childrenByParentId}
        renderBlock={renderBlock}
        onAddBlockToColumn={vi.fn()}
      />
    )
    expect(screen.queryAllByTitle('Delete block')).toHaveLength(0)
  })

  it('shows the Add a block placeholder when a column has no children', () => {
    render(
      <ColumnLayout
        experimentId={EXP_ID}
        block={columnListBlock}
        childrenByParentId={{
          [columnListBlock.id]: [column1Block, column2Block],
          [column1Block.id]: [], // column 1 is now empty after deletion
          [column2Block.id]: [paraBlock],
        }}
        renderBlock={renderBlock}
        onAddBlockToColumn={vi.fn()}
        onDeleteColumnBlock={vi.fn()}
      />
    )
    expect(screen.getByText('Add a block')).toBeInTheDocument()
    // column 2 child is still rendered
    expect(screen.getByTestId('block-' + paraBlock.id)).toBeInTheDocument()
  })
})
