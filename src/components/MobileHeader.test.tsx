// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MobileHeader } from './MobileHeader'

describe('MobileHeader', () => {
  it('has no „Szukaj" button — the phone has one search action, in the bottom bar', () => {
    render(<MobileHeader />)
    expect(screen.queryByRole('button', { name: 'Szukaj' })).toBeNull()
  })

  it('links the app name to the home page and holds the theme toggle', () => {
    render(<MobileHeader />)
    expect(screen.getByRole('link', { name: /Monitor opóźnień/ })).toHaveAttribute('href', '/')
    expect(screen.getByRole('button', { name: /tryb/i })).toBeInTheDocument()
  })

  it('has no menu button any more', () => {
    render(<MobileHeader />)
    expect(screen.queryByRole('button', { name: /menu/i })).toBeNull()
  })
})
