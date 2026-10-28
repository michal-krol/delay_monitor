// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { TransitFetchStatus } from './TransitFetchStatus'
import { HeaderData } from './HeaderData'
import { PageHeaderProvider } from './pageHeader'

it('publishes the received timestamp and refresh action without a body age counter', () => {
  const refresh = vi.fn()
  render(<PageHeaderProvider><HeaderData /><TransitFetchStatus lastSuccessAt={Date.parse('2026-10-27T19:00:00Z')} refreshFailed={false} timeZone="Europe/Warsaw" onRefresh={refresh} /></PageHeaderProvider>)
  expect(screen.queryByText(/Pobrano/)).not.toBeInTheDocument()
  fireEvent.click(screen.getByText(/^Dane /))
  fireEvent.click(screen.getByRole('button', { name: 'Odśwież: Odjazdy miejskie' }))
  expect(refresh).toHaveBeenCalledOnce()
})

it('keeps an explicit failed refresh warning and the last received timestamp', () => {
  render(<PageHeaderProvider><HeaderData /><TransitFetchStatus lastSuccessAt={Date.parse('2026-10-27T19:00:00Z')} refreshFailed timeZone="Europe/Warsaw" onRefresh={vi.fn()} /></PageHeaderProvider>)
  expect(screen.getByRole('status')).toHaveTextContent('Nie udało się odświeżyć')
  expect(screen.getByText(/^Dane /)).toHaveTextContent('27.10.2026, 20:00')
})
