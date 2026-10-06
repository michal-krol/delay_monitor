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
import { stubMatchMedia } from '@/test-utils/media'

afterEach(() => vi.unstubAllGlobals())

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

  it('renders only the content under reduced motion', () => {
    stubMatchMedia(true)
    render(
      <TabCrossfade id="departures" name="board-rows">
        <p>odjazdy</p>
      </TabCrossfade>
    )
    expect(screen.queryByTestId('vt')).not.toBeInTheDocument()
    expect(screen.getByText('odjazdy')).toBeInTheDocument()
  })
})
