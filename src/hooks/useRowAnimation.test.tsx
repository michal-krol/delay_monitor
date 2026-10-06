// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const autoAnimate = vi.hoisted(() => vi.fn((...args: [Element, unknown]) => (void args, { enable: () => {}, disable: () => {}, isEnabled: () => true })))
vi.mock('@formkit/auto-animate', () => ({ default: autoAnimate }))

import { useRowAnimation } from './useRowAnimation'

function List() {
  const ref = useRowAnimation<HTMLUListElement>()
  return <ul ref={ref} data-testid="list" />
}

afterEach(() => {
  autoAnimate.mockClear()
  vi.unstubAllGlobals()
})

describe('useRowAnimation', () => {
  it('attaches auto-animate to the element it is given', () => {
    render(<List />)
    expect(autoAnimate).toHaveBeenCalledTimes(1)
    expect(autoAnimate.mock.calls[0]?.[0]).toBe(screen.getByTestId('list'))
  })

  it('does nothing under reduced motion', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener: () => {}, removeEventListener: () => {} }))
    render(<List />)
    expect(autoAnimate).not.toHaveBeenCalled()
  })
})
