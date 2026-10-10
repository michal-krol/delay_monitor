// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import RootNotFound from './not-found'
import AppNotFound from './(app)/not-found'

describe.each([
  ['app/not-found.tsx (unmatched URLs)', RootNotFound],
  ['(app)/not-found.tsx (notFound() inside the chrome)', AppNotFound],
])('%s', (_name, NotFound) => {
  it('explains in Polish that the page does not exist and links back to the Pulpit', () => {
    render(<NotFound />)
    expect(screen.getByRole('heading', { level: 1, name: 'Nie znaleziono strony' })).toBeInTheDocument()
    expect(screen.getByText(/nie istnieje/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Wróć do Startu' })).toHaveAttribute('href', '/')
  })
})
