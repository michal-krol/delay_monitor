// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useScrollableFocus } from './useScrollableFocus'

function Region({ children = 'treść' }: { children?: string }) {
  const [ref, tabIndex] = useScrollableFocus<HTMLDivElement>()
  return (
    <div ref={ref} tabIndex={tabIndex} aria-label="Region" role="region">
      <p>{children}</p>
    </div>
  )
}

/** jsdom nie liczy układu: wymiary ustawiamy ręcznie, a ResizeObserver wywołujemy sami. */
function size(element: HTMLElement, scrollHeight: number, clientHeight: number): void {
  Object.defineProperty(element, 'scrollHeight', { configurable: true, value: scrollHeight })
  Object.defineProperty(element, 'clientHeight', { configurable: true, value: clientHeight })
}

let fire: () => void = () => {}
const observed: Element[] = []

function stubResizeObserver(): void {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: () => void) {
        fire = callback
      }
      observe(target: Element) {
        observed.push(target)
      }
      disconnect() {
        observed.length = 0
      }
    }
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
  observed.length = 0
})

describe('useScrollableFocus', () => {
  it('makes the region focusable only while its content overflows', () => {
    stubResizeObserver()
    render(<Region />)
    const region = screen.getByRole('region')

    size(region, 100, 100)
    act(() => fire())
    expect(region).not.toHaveAttribute('tabindex')

    size(region, 400, 100)
    act(() => fire())
    expect(region).toHaveAttribute('tabindex', '0')

    size(region, 90, 100)
    act(() => fire())
    expect(region).not.toHaveAttribute('tabindex')
  })

  it('watches the children too: content growing inside a height-capped region fires no resize on the region itself', () => {
    stubResizeObserver()
    render(<Region />)
    const region = screen.getByRole('region')
    expect(observed).toContain(region)
    expect(observed).toContain(screen.getByText('treść'))
  })

  it('stays focusable without ResizeObserver (old browsers keep the previous, always-focusable behaviour)', () => {
    vi.stubGlobal('ResizeObserver', undefined)
    render(<Region />)
    expect(screen.getByRole('region')).toHaveAttribute('tabindex', '0')
  })
})
