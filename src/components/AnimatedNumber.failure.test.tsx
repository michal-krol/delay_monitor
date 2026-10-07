// @vitest-environment jsdom
/* eslint-disable testing-library/no-node-access -- zapasowy napis liczby nie ma roli do zapytania */
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

// Nieudane pobranie leniwego kawałka (404 po wdrożeniu, brak sieci) — dekoracja nie może zepsuć strony.
vi.mock('@number-flow/react', () => {
  throw new Error('ChunkLoadError')
})

import { AnimatedNumber } from './AnimatedNumber'

describe('AnimatedNumber when the animation chunk cannot be loaded', () => {
  it('keeps showing the number as plain text instead of throwing into an error boundary', async () => {
    render(<AnimatedNumber value={12} prefix="+" suffix=" min" />)
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(screen.getAllByText('+12 min')).toHaveLength(1)
    expect(document.querySelector('[data-number-fallback]')?.textContent).toBe('+12 min')
  })
})
