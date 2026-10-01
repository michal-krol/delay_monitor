// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PageTitle } from './PageTitle'

describe('PageTitle', () => {
  it('renders an h1 by default', () => {
    render(<PageTitle>Pulpit</PageTitle>)
    expect(screen.getByRole('heading', { level: 1, name: 'Pulpit' })).toBeInTheDocument()
  })

  it('renders an h2 with the same look when as="h2"', () => {
    render(<PageTitle as="h2">Stacja</PageTitle>)
    const heading = screen.getByRole('heading', { level: 2, name: 'Stacja' })
    expect(heading).toHaveClass('text-2xl', 'font-extrabold')
  })
})
