// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ModeGlyphs, ModeTile, modeKindLabel, modesLabel } from './transitMode'

describe('modeKindLabel', () => {
  it('names GTFS rail „Kolej miejska” (never PKP wording, #13) and capitalises the other modes', () => {
    expect(modeKindLabel('rail')).toBe('Kolej miejska')
    expect(modeKindLabel('bus')).toBe('Autobus')
    expect(modeKindLabel('tram')).toBe('Tramwaj')
    expect(modeKindLabel('metro')).toBe('Metro')
    expect(modeKindLabel('other')).toBe('Inne')
  })
})

describe('ModeGlyphs', () => {
  it('draws one decorative glyph per mode, in the given order', () => {
    render(<ModeGlyphs modes={['tram', 'bus', 'metro', 'rail']} />)
    expect(screen.getAllByTestId('mode-glyph').map((node) => node.getAttribute('data-mode'))).toEqual(['tram', 'bus', 'metro', 'rail'])
  })

  it('shows the same glyph for a mode everywhere: `other` is not a bus', () => {
    const { unmount } = render(<ModeGlyphs modes={['bus']} />)
    const busMarkup = screen.getByTestId('mode-glyph').innerHTML
    unmount()
    render(<ModeGlyphs modes={['other']} />)
    expect(screen.getByTestId('mode-glyph').innerHTML).not.toBe(busMarkup)
  })

  it('unknown modes (loading, an old saved entry) show the neutral stop glyph, never a bus', () => {
    render(<ModeGlyphs modes={[]} />)
    expect(screen.getByTestId('stop-glyph')).toBeInTheDocument()
    expect(screen.queryByTestId('mode-glyph')).toBeNull()
  })
})

describe('modesLabel', () => {
  it('lists the nouns of the modes, capitalised once; rail is „kolej miejska”', () => {
    expect(modesLabel(['tram', 'bus'])).toBe('Tramwaj, autobus')
    expect(modesLabel(['rail'])).toBe('Kolej miejska')
    expect(modesLabel(['metro'])).toBe('Metro')
  })
  it('is empty for unknown modes', () => {
    expect(modesLabel([])).toBe('')
  })
})

describe('ModeTile', () => {
  it('wraps the glyphs of the modes in a decorative tile', () => {
    render(<ModeTile modes={['metro']} />)
    expect(screen.getByTestId('mode-glyph')).toHaveAttribute('data-mode', 'metro')
  })
  it('unknown modes (still loading) show the neutral stop glyph, never a bus', () => {
    render(<ModeTile modes={[]} />)
    expect(screen.getByTestId('stop-glyph')).toBeInTheDocument()
    expect(screen.queryByTestId('mode-glyph')).toBeNull()
  })
})
