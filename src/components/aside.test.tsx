// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PageShell } from './aside'

describe('PageShell', () => {
  it('renders the aside below xl (no bare `hidden` class) — C9', () => {
    render(<PageShell aside={<p>karta</p>}>treść</PageShell>)
    const aside = screen.getByLabelText('Panel kontekstowy')
    expect(aside.className.split(/\s+/)).not.toContain('hidden')
    expect(screen.getByText('karta')).toBeInTheDocument()
  })

  it('sticks and takes the fixed column width only from xl', () => {
    render(<PageShell aside={<p>karta</p>}>treść</PageShell>)
    const classes = screen.getByLabelText('Panel kontekstowy').className.split(/\s+/)
    expect(classes).toContain('xl:sticky')
    expect(classes).toContain('xl:w-aside')
    expect(classes).not.toContain('sticky')
    expect(classes).not.toContain('overflow-y-auto')
  })

  it('omits the aside when none is given', () => {
    render(<PageShell>treść</PageShell>)
    expect(screen.queryByLabelText('Panel kontekstowy')).toBeNull()
  })
})
