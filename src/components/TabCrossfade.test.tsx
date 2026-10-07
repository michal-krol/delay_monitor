// @vitest-environment jsdom
import { useEffect } from 'react'
import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>()
  return {
    ...actual,
    ViewTransition: (props: { children?: React.ReactNode }) =>
      actual.createElement('div', { 'data-testid': 'vt', 'data-props': JSON.stringify({ ...props, children: undefined }) }, props.children),
  }
})

import { TabCrossfade } from './TabCrossfade'
// Przejścia widoku włącza `useViewTransitions` — tu sterujemy nim ręcznie.
const viewTransitions = vi.hoisted(() => ({ on: true }))
vi.mock('@/hooks/useViewTransitions', () => ({ useViewTransitions: () => viewTransitions.on }))

afterEach(() => {
  viewTransitions.on = true
})

describe('TabCrossfade', () => {
  it('crossfades the panel content under one stable name (same place, different content)', () => {
    render(
      <TabCrossfade id="departures" name="board-rows">
        <p>odjazdy</p>
      </TabCrossfade>
    )
    const props = JSON.parse(screen.getByTestId('vt').getAttribute('data-props') ?? '{}')
    expect(props).toMatchObject({ name: 'board-rows', share: 'auto', enter: 'auto', default: 'none' })
    expect(screen.getByText('odjazdy')).toBeInTheDocument()
  })

  it('remounts the content when the tab id changes, so old and new content are an exit/enter pair', () => {
    const mounted = vi.fn()
    function Probe() {
      useEffect(() => mounted(), [])
      return <p>treść</p>
    }
    const view = render(
      <TabCrossfade id="a" name="x">
        <Probe />
      </TabCrossfade>
    )
    view.rerender(
      <TabCrossfade id="b" name="x">
        <Probe />
      </TabCrossfade>
    )
    expect(mounted).toHaveBeenCalledTimes(2)
  })

  it('keeps the content mounted while the id stays the same (polling re-renders must not replay the fade)', () => {
    const mounted = vi.fn()
    function Probe() {
      useEffect(() => mounted(), [])
      return <p>treść</p>
    }
    const view = render(
      <TabCrossfade id="a" name="x">
        <Probe />
      </TabCrossfade>
    )
    view.rerender(
      <TabCrossfade id="a" name="x">
        <Probe />
      </TabCrossfade>
    )
    expect(mounted).toHaveBeenCalledTimes(1)
  })

  it('turns the fade off (no name, share and enter none) when view transitions are off, content still rendered', () => {
    viewTransitions.on = false
    render(
      <TabCrossfade id="departures" name="board-rows">
        <p>odjazdy</p>
      </TabCrossfade>
    )
    const props = JSON.parse(screen.getByTestId('vt').getAttribute('data-props') ?? '{}')
    expect(props).toMatchObject({ share: 'none', enter: 'none', default: 'none' })
    expect(props.name).toBeUndefined()
    expect(screen.getByText('odjazdy')).toBeInTheDocument()
  })

  it('does not remount the content on a tab change when view transitions are off (keeps its state, as before PR6)', () => {
    viewTransitions.on = false
    const mounted = vi.fn()
    function Probe() {
      useEffect(() => mounted(), [])
      return <p>treść</p>
    }
    const view = render(
      <TabCrossfade id="a" name="x">
        <Probe />
      </TabCrossfade>
    )
    view.rerender(
      <TabCrossfade id="b" name="x">
        <Probe />
      </TabCrossfade>
    )
    expect(mounted).toHaveBeenCalledTimes(1)
  })
})
