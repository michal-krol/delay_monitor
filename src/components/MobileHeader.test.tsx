// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MobileHeader } from './MobileHeader'
import { PageHeaderProvider, useHeaderData } from './pageHeader'

describe('MobileHeader', () => {
  it('keeps the metadata row across source arrival and cleanup without retaining old data', () => {
    function Source() {
      useHeaderData({ id: 'pkp', label: 'Dane PKP', updatedAt: '2026-10-29T10:00:00Z' })
      return null
    }
    const view = render(<PageHeaderProvider><MobileHeader /></PageHeaderProvider>)
    const row = screen.getByTestId('header-data-row')
    expect(row).toHaveClass('min-h-11')
    expect(screen.queryByText(/^Dane \d/)).not.toBeInTheDocument()
    view.rerender(<PageHeaderProvider><MobileHeader /><Source /></PageHeaderProvider>)
    expect(screen.getByTestId('header-data-row')).toBe(row)
    expect(screen.getByText(/^Dane \d/)).toBeInTheDocument()
    view.rerender(<PageHeaderProvider><MobileHeader /></PageHeaderProvider>)
    expect(screen.getByTestId('header-data-row')).toBe(row)
    expect(screen.getByTestId('header-data-row')).toHaveClass('min-h-11')
    expect(screen.queryByText(/^Dane \d/)).not.toBeInTheDocument()
    expect(screen.queryByText('Dane PKP')).not.toBeInTheDocument()
  })
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
