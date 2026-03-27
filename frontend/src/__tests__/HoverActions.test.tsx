import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import HoverActions from '@/components/layout/HoverActions'

describe('HoverActions', () => {
  it('renders all buttons when all handlers are provided', () => {
    render(
      <HoverActions 
        onRename={() => {}} 
        onDuplicate={() => {}} 
        onDelete={() => {}} 
      />
    )
    expect(screen.getByRole('button', { name: /rename/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /duplicate/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument()
  })

  it('renders only the buttons for provided handlers', () => {
    render(<HoverActions onRename={() => {}} />)
    expect(screen.getByRole('button', { name: /rename/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /duplicate/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument()
  })

  it('renders no duplicate button when onDuplicate is undefined', () => {
    render(<HoverActions onRename={() => {}} onDelete={() => {}} onDuplicate={undefined} />)
    expect(screen.getByRole('button', { name: /rename/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /duplicate/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument()
  })

  it('calls handlers and stops propagation on click', () => {
    const onRename = vi.fn()
    const onParentClick = vi.fn()
    
    render(
      <div onClick={onParentClick}>
        <HoverActions onRename={onRename} />
      </div>
    )

    const renameBtn = screen.getByRole('button', { name: /rename/i })
    fireEvent.click(renameBtn)
    
    expect(onRename).toHaveBeenCalledTimes(1)
    expect(onParentClick).not.toHaveBeenCalled()
  })

  it('has danger styling on the delete button', () => {
    render(<HoverActions onDelete={() => {}} />)
    const deleteBtn = screen.getByRole('button', { name: /delete/i })
    // The button class includes text-red-600 or bg-red-50 to indicate danger styling
    expect(deleteBtn.className).toMatch(/text-red-600|hover:bg-red-50/i)
  })

  it('is hidden by default with opacity-0 class', () => {
    const { container } = render(<HoverActions onRename={() => {}} />)
    const wrapper = container.firstChild
    expect(wrapper).toHaveClass('opacity-0')
  })
})
