// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { BottomSheet, nearestSnap, nextSnap } from './BottomSheet'

describe('snap helpers', () => {
  it('nextSnap cycles peek → half → full → peek', () => {
    expect(nextSnap('peek')).toBe('half')
    expect(nextSnap('half')).toBe('full')
    expect(nextSnap('full')).toBe('peek')
  })

  it('nearestSnap picks the closest snap point and treats an unmeasured sheet as peek', () => {
    expect(nearestSnap(0, 1000)).toBe('peek')
    expect(nearestSnap(450, 1000)).toBe('half')
    expect(nearestSnap(800, 1000)).toBe('full')
    expect(nearestSnap(500, 0)).toBe('peek')
  })
})

describe('BottomSheet', () => {
  const scrollTo = vi.fn()
  beforeEach(() => {
    // jsdom nie liczy układu: wysokość arkusza i przewijanie podstawiamy.
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(600)
    HTMLElement.prototype.scrollTo = scrollTo as unknown as HTMLElement['scrollTo']
  })
  afterEach(() => {
    vi.restoreAllMocks()
    scrollTo.mockReset()
  })

  function sheet(): HTMLElement {
    // eslint-disable-next-line testing-library/no-node-access -- kontener przewijania nie ma roli (to nie landmark)
    return document.querySelector<HTMLElement>('.bottom-sheet')!
  }

  it('starts at peek and the handle cycles the snap, scrolling to the fraction of the sheet height', () => {
    render(
      <BottomSheet>
        <p>Treść</p>
      </BottomSheet>
    )
    expect(screen.getByText('Treść')).toBeInTheDocument()
    expect(sheet()).toHaveAttribute('data-snap', 'peek')
    expect(scrollTo).toHaveBeenCalledWith({ top: 150, behavior: 'instant' })

    fireEvent.click(screen.getByRole('button', { name: 'Zmień wysokość panelu (teraz: niski)' }))
    expect(sheet()).toHaveAttribute('data-snap', 'half')
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 330 })
    expect(screen.getByRole('button', { name: 'Zmień wysokość panelu (teraz: do połowy)' })).toBeInTheDocument()
  })

  it('scroll position drives the snap (drag), unlocking inner scroll only at full', () => {
    render(
      <BottomSheet>
        <p>Treść</p>
      </BottomSheet>
    )
    sheet().scrollTop = 540
    fireEvent.scroll(sheet())
    expect(sheet()).toHaveAttribute('data-snap', 'full')
  })
})

describe('BottomSheet CSS', () => {
  const css = readFileSync(join(__dirname, '../app/globals.css'), 'utf8')

  it('reduced motion: smooth scrolling only without prefers-reduced-motion', () => {
    const smooth = [...css.matchAll(/scroll-behavior:\s*smooth/g)].map((m) => m.index!)
    expect(smooth.length).toBeGreaterThan(0)
    for (const at of smooth) {
      const media = css.lastIndexOf('@media', at)
      expect(css.slice(media, at)).toContain('prefers-reduced-motion: no-preference')
    }
  })

  it('locks the inner panel scroll below the full snap', () => {
    expect(css).toMatch(/\.bottom-sheet:not\(\[data-snap='full'\]\) \[data-sheet-scroll\]\s*\{\s*overflow-y: hidden/)
  })
})
