// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const disable = vi.hoisted(() => vi.fn())
const autoAnimate = vi.hoisted(() => vi.fn((...args: [Element, unknown]) => (void args, { enable: () => {}, disable, isEnabled: () => true })))
vi.mock('@formkit/auto-animate', () => ({ default: autoAnimate }))

import { rowPlugin, useRowAnimation } from './useRowAnimation'

function List() {
  const ref = useRowAnimation<HTMLUListElement>()
  return <ul ref={ref} data-testid="list" />
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 20))

afterEach(() => {
  autoAnimate.mockClear()
  disable.mockClear()
  vi.unstubAllGlobals()
})

describe('useRowAnimation', () => {
  it('attaches auto-animate to the element it is given, once the library has loaded (lazy)', async () => {
    render(<List />)
    await waitFor(() => expect(autoAnimate).toHaveBeenCalledTimes(1))
    expect(autoAnimate.mock.calls[0]?.[0]).toBe(screen.getByTestId('list'))
    expect(autoAnimate.mock.calls[0]?.[1]).toBe(rowPlugin)
  })

  it('no replay on a polling rerender with the same keys: one attach, no detach', async () => {
    function Rows({ ids, tick }: { ids: string[]; tick: number }) {
      const ref = useRowAnimation<HTMLUListElement>()
      return (
        <ul ref={ref} data-tick={tick}>
          {ids.map((id) => (
            <li key={id}>{id}</li>
          ))}
        </ul>
      )
    }
    const view = render(<Rows ids={['a', 'b']} tick={1} />)
    await waitFor(() => expect(autoAnimate).toHaveBeenCalledTimes(1))
    view.rerender(<Rows ids={['a', 'b']} tick={2} />)
    view.rerender(<Rows ids={['a', 'b']} tick={3} />)
    await flush()
    expect(autoAnimate).toHaveBeenCalledTimes(1)
    expect(disable).not.toHaveBeenCalled()
  })

  it('does nothing under reduced motion', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener: () => {}, removeEventListener: () => {} }))
    render(<List />)
    await flush()
    expect(autoAnimate).not.toHaveBeenCalled()
  })

  it('never attaches to an element that unmounted while the library was still loading', async () => {
    const view = render(<List />)
    view.unmount()
    await flush()
    expect(autoAnimate).not.toHaveBeenCalled()
  })

  it('detaches the animation when the element goes away', async () => {
    const view = render(<List />)
    await waitFor(() => expect(autoAnimate).toHaveBeenCalledTimes(1))
    view.unmount()
    expect(disable).toHaveBeenCalledTimes(1)
  })
})
