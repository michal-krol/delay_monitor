// @vitest-environment jsdom
/* eslint-disable testing-library/no-container, testing-library/no-node-access -- element niestandardowy i węzeł aria-hidden nie mają roli do zapytania */
import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AnimatedNumber } from './AnimatedNumber'

afterEach(() => vi.unstubAllGlobals())

describe('AnimatedNumber', () => {
  it('exposes the formatted text exactly once to assistive tech and text queries', () => {
    render(<AnimatedNumber value={12} prefix="+" suffix=" min" />)
    expect(screen.getAllByText('+12 min')).toHaveLength(1)
  })

  it('hides the animated digits from the accessibility tree', () => {
    const { container } = render(<AnimatedNumber value={12} prefix="+" suffix=" min" />)
    expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull()
  })

  it('renders plain text without the custom element under reduced motion', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener: () => {}, removeEventListener: () => {} }))
    const { container } = render(<AnimatedNumber value={7} suffix="%" />)
    expect(screen.getAllByText('7%')).toHaveLength(1)
    expect(container.querySelector('number-flow-react')).toBeNull()
  })
})
