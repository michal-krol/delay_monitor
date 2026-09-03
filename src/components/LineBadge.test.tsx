// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { LineBadge } from './LineBadge'

describe('LineBadge', () => {
  it('renders a plain badge with no href', () => {
    render(<LineBadge line="20" color={null} mode="tram" />)
    expect(screen.getByText('20')).toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('wraps in a link to the line details when href is given', () => {
    render(<LineBadge line="M1" color="#0000bb" mode="metro" href="/miasto/warszawa/linia/M1" />)
    const link = screen.getByRole('link', { name: 'Linia M1' })
    expect(link).toHaveAttribute('href', '/miasto/warszawa/linia/M1')
  })

  it('falls back to the neutral token for a colour that is not #rrggbb', () => {
    render(<LineBadge line="X" color={'red; background:url(x)' as string} mode="bus" />)
    const badge = screen.getByText('X')
    expect(badge.getAttribute('style') ?? '').not.toContain('url(x)')
  })
})
