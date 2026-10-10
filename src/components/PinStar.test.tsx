// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PinStar } from './PinStar'

const star = (): HTMLElement => screen.getByTestId('pin-star')

describe('PinStar', () => {
  it('no pop on first render of an already pinned star', () => {
    render(<PinStar pinned size={16} />)
    expect(star()).not.toHaveAttribute('data-pop')
  })

  it('pop attribute appears when pinned flips false->true', () => {
    const { rerender } = render(<PinStar pinned={false} size={16} />)
    expect(star()).not.toHaveAttribute('data-pop')
    rerender(<PinStar pinned size={16} />)
    expect(star()).toHaveAttribute('data-pop')
  })

  it('no pop on unpin', () => {
    const { rerender } = render(<PinStar pinned size={16} />)
    rerender(<PinStar pinned={false} size={16} />)
    expect(star()).not.toHaveAttribute('data-pop')
  })

  it('no pop on rerender with same value (polling)', () => {
    const { rerender } = render(<PinStar pinned size={16} />)
    rerender(<PinStar pinned size={16} />)
    expect(star()).not.toHaveAttribute('data-pop')
    rerender(<PinStar pinned={false} size={16} />)
    rerender(<PinStar pinned={false} size={16} />)
    expect(star()).not.toHaveAttribute('data-pop')
  })
})
