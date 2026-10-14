// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useNearViewport } from './useNearViewport'

function Probe() {
  const [ref, near] = useNearViewport('120px')
  return <div ref={ref} data-testid="probe" data-near={near} />
}

describe('useNearViewport', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('is true immediately when IntersectionObserver is missing (jsdom)', () => {
    render(<Probe />)
    expect(screen.getByTestId('probe').dataset.near).toBe('true')
  })

  it('waits for an intersection, uses the margin, then stays true and stops observing', () => {
    let callback: IntersectionObserverCallback = () => {}
    const disconnect = vi.fn()
    const options: IntersectionObserverInit[] = []
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(cb: IntersectionObserverCallback, init?: IntersectionObserverInit) {
          callback = cb
          options.push(init ?? {})
        }
        observe() {}
        disconnect = disconnect
      },
    )
    render(<Probe />)
    const probe = screen.getByTestId('probe')
    expect(probe.dataset.near).toBe('false')
    expect(options[0].rootMargin).toBe('120px')

    act(() => callback([{ isIntersecting: false } as IntersectionObserverEntry], {} as IntersectionObserver))
    expect(probe.dataset.near).toBe('false')

    act(() => callback([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver))
    expect(probe.dataset.near).toBe('true')
    expect(disconnect).toHaveBeenCalled()

    // scrolling away reports isIntersecting:false (or nothing at all) — the flag must not drop
    act(() => callback([{ isIntersecting: false } as IntersectionObserverEntry], {} as IntersectionObserver))
    expect(probe.dataset.near).toBe('true')
  })
})
