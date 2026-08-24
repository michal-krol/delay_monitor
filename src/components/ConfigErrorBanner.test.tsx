// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ConfigErrorBanner } from './ConfigErrorBanner'

describe('ConfigErrorBanner', () => {
  it('pokazuje komunikat jako role="alert"', () => {
    render(<ConfigErrorBanner />)
    expect(screen.getByRole('alert')).toHaveTextContent('Sprawdź klucz API — konfiguracja pollera jest nieprawidłowa.')
  })
})
