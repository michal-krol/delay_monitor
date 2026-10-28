// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { PageHeaderProvider, useHeaderData } from './pageHeader'
import { HeaderData } from './HeaderData'

it('summarizes the oldest source, exposes failures and refreshes the named source', () => {
  const refresh = vi.fn()
  function Sources() {
    useHeaderData({ id: 'pkp', label: 'PKP Warszawa', updatedAt: '2026-10-27T10:00:00Z', refresh })
    useHeaderData({ id: 'gtfs', label: 'Rozkład Centrum', updatedAt: '2026-10-27T11:00:00Z', error: true })
    return null
  }
  render(<PageHeaderProvider><Sources /><HeaderData /></PageHeaderProvider>)
  expect(screen.getByText(/Dane.*11:00/)).toHaveTextContent('część danych nieaktualna')
  fireEvent.click(screen.getByText(/Dane.*11:00/))
  fireEvent.click(screen.getByRole('button', { name: 'Odśwież: PKP Warszawa' }))
  expect(refresh).toHaveBeenCalledOnce()
  expect(screen.getByText('Rozkład Centrum')).toBeInTheDocument()
  expect(screen.getByText('Nie udało się odświeżyć')).toBeInTheDocument()
})
