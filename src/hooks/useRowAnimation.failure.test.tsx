// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@formkit/auto-animate', () => {
  throw new Error('ChunkLoadError')
})

import { useRowAnimation } from './useRowAnimation'

function List() {
  const ref = useRowAnimation<HTMLUListElement>()
  return <ul ref={ref} data-testid="list" />
}

describe('useRowAnimation when the library chunk cannot be loaded', () => {
  it('renders the list and swallows the failure (vitest fails the run on an unhandled rejection)', async () => {
    render(<List />)
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(screen.getByTestId('list')).toBeInTheDocument()
  })
})
