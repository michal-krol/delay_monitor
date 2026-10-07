// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PageSkeleton } from './PageSkeleton'

describe('PageSkeleton', () => {
  it('is a busy main landmark that announces loading to screen readers, ', () => {
    render(<PageSkeleton />)
    const main = screen.getByRole('main')
    expect(main).toHaveAttribute('aria-busy', 'true')
    expect(main).toHaveAttribute('data-testid', 'page-skeleton')
    expect(screen.getByText('Wczytywanie…')).toHaveClass('sr-only')
  })
})
