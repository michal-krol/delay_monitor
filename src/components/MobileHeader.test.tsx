// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MobileHeader } from './MobileHeader'

describe('MobileHeader', () => {
  it('has no „Szukaj" button — the phone has one search action, in the bottom bar', () => {
    render(<MobileHeader />)
    expect(screen.queryByRole('button', { name: 'Szukaj' })).toBeNull()
  })

  it('links the app name to home and exposes the theme inside page options', () => {
    render(<MobileHeader />)
    expect(screen.getByRole('link', { name: /Monitor opóźnień/ })).toHaveAttribute('href', '/')
    expect(screen.queryByRole('button', { name: /tryb/i })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Więcej opcji strony' }))
    expect(screen.getByRole('button', { name: /tryb/i })).toBeInTheDocument()
  })

  it('has no menu button any more', () => {
    render(<MobileHeader />)
    expect(screen.queryByRole('button', { name: /menu/i })).toBeNull()
  })
})
