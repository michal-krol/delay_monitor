// @vitest-environment jsdom
/* eslint-disable testing-library/no-container, testing-library/no-node-access -- element niestandardowy i węzeł aria-hidden nie mają roli do zapytania */
import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AnimatedNumber } from './AnimatedNumber'

afterEach(() => vi.unstubAllGlobals())

describe('AnimatedNumber', () => {
  it('shows the number at once, before the animation library has loaded (it is lazy: keeps first paint light)', () => {
    const { container } = render(<AnimatedNumber value={12} prefix="+" suffix=" min" />)
    expect(container.querySelector('[data-number-fallback]')?.textContent).toBe('+12 min')
    expect(container.querySelector('[data-number-fallback]')).toHaveAttribute('aria-hidden', 'true')
    expect(container.querySelector('number-flow-react')).toBeNull()
  })

  it('swaps in the rolling digits once the library has loaded', async () => {
    const { container } = render(<AnimatedNumber value={12} prefix="+" suffix=" min" />)
    await waitFor(() => expect(container.querySelector('number-flow-react')).not.toBeNull())
    expect(container.querySelector('[data-number-fallback]')).toBeNull()
  })

  it('exposes the formatted text exactly once to assistive tech and text queries, before and after the swap', async () => {
    const { container } = render(<AnimatedNumber value={12} prefix="+" suffix=" min" />)
    expect(screen.getAllByText('+12 min')).toHaveLength(1)
    await waitFor(() => expect(container.querySelector('number-flow-react')).not.toBeNull())
    expect(screen.getAllByText('+12 min')).toHaveLength(1)
  })

  it('hides the rolling digits from the accessibility tree', async () => {
    const { container } = render(<AnimatedNumber value={12} prefix="+" suffix=" min" />)
    await waitFor(() => expect(container.querySelector('number-flow-react')).not.toBeNull())
    expect(container.querySelector('number-flow-react')).toHaveAttribute('aria-hidden', 'true')
  })

  it('renders plain text without the custom element under reduced motion', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener: () => {}, removeEventListener: () => {} }))
    const { container } = render(<AnimatedNumber value={7} suffix="%" />)
    expect(screen.getAllByText('7%')).toHaveLength(1)
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(container.querySelector('number-flow-react')).toBeNull()
    expect(container.querySelector('[data-number-fallback]')).toBeNull()
  })
})
