// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { LineBadge } from './LineBadge'

describe('LineBadge', () => {
  it('renders the line number and applies a validated colour inline', () => {
    render(<LineBadge line="M1" color="#0000bb" mode="metro" />)
    const badge = screen.getByText('M1')
    expect(badge).toHaveStyle({ background: '#0000bb' })
    // Kontrast liczony samodzielnie — granat → biały tekst.
    expect(badge).toHaveStyle({ color: '#ffffff' })
  })

  it('falls back to a neutral token when the feed had no valid colour', () => {
    render(<LineBadge line="20" color={null} mode="tram" />)
    const badge = screen.getByText('20')
    expect(badge.getAttribute('style')).toContain('var(--surface-border)')
  })
})
