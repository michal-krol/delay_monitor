// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AppTitle } from './AppTitle'

describe('AppTitle', () => {
  it('shows the app title', () => {
    render(<AppTitle />)
    expect(screen.getByRole('heading', { name: 'Monitor opóźnień' })).toBeInTheDocument()
  })

  // Wersję/gałąź (odróżnienie dev od prod) pokazuje teraz `Sidebar` — patrz
  // `Sidebar.test.tsx`. Tu jej nie ma, żeby na pustym Pulpicie nie dublować.
})
