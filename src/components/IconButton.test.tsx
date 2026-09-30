// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { IconButton } from './IconButton'

describe('IconButton', () => {
  it('is a labelled button that calls onClick', async () => {
    const onClick = vi.fn()
    render(<IconButton label="Zamknij" onClick={onClick}>×</IconButton>)
    await userEvent.click(screen.getByRole('button', { name: 'Zamknij' }))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('always has the bordered look from the surface-border token', () => {
    render(<IconButton label="Zamknij" onClick={vi.fn()}>×</IconButton>)
    expect(screen.getByRole('button')).toHaveClass('border', 'border-surface-border')
  })

  it('exposes a toggle state only when pressed is given', () => {
    const { rerender } = render(<IconButton label="Przypnij" onClick={vi.fn()}>*</IconButton>)
    expect(screen.getByRole('button')).not.toHaveAttribute('aria-pressed')
    rerender(<IconButton label="Przypnij" onClick={vi.fn()} pressed>*</IconButton>)
    expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'true')
  })

  it('extends the hit area to 44 px without changing the look (touch-44)', () => {
    render(<IconButton label="Zamknij" onClick={vi.fn()}>×</IconButton>)
    expect(screen.getByRole('button')).toHaveClass('touch-44', 'relative')
  })

  it('has a 44 px target in the large size', () => {
    render(<IconButton label="Zamknij" onClick={vi.fn()} size="lg">×</IconButton>)
    expect(screen.getByRole('button')).toHaveClass('h-11', 'w-11')
  })
})
