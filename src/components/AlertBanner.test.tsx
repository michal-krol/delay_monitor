// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AlertBanner, alertDateRange } from './AlertBanner'
import { BottomSheet } from './BottomSheet'
import type { AlertRecord } from '@/lib/gtfs/alerts'

const alert = (over: Partial<AlertRecord> = {}): AlertRecord => ({
  id: 'A/1',
  routes: ['20'],
  effect: 'REDUCED_SERVICE',
  link: 'https://www.wtp.waw.pl/utrudnienia/x/',
  title: 'Utrudnienia w kursowaniu linii 20',
  body: 'Treść utrudnienia.',
  ...over,
})

describe('AlertBanner', () => {
  it('renders nothing for an empty list', () => {
    const { container } = render(<AlertBanner alerts={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('starts collapsed to the title and text dates, keeps the source link visible, expands on demand', () => {
    render(<AlertBanner alerts={[alert({ body: 'W dniu 27.09.2026 oraz 28.9.2026 objazd.' })]} />)
    expect(screen.getByText('Utrudnienia w kursowaniu linii 20')).toBeInTheDocument()
    expect(screen.getByText('Daty w komunikacie: 27.09.2026 – 28.09.2026')).toBeInTheDocument()
    const body = screen.getByText('W dniu 27.09.2026 oraz 28.9.2026 objazd.')
    expect(body).not.toBeVisible()
    expect(screen.getByRole('link', { name: /Szczegóły/ })).toBeVisible()
    fireEvent.click(screen.getByText('Utrudnienia w kursowaniu linii 20'))
    expect(screen.getByRole('group')).toHaveAttribute('open')
    expect(body).toBeVisible()
    const link = screen.getByRole('link', { name: /Szczegóły/ })
    expect(link).toHaveAttribute('href', 'https://www.wtp.waw.pl/utrudnienia/x/')
    expect(link).toHaveAttribute('target', '_blank')
  })

  it('omits the link when the feed did not supply one', () => {
    render(<AlertBanner alerts={[alert({ link: '' })]} />)
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('omits the link when it is not https:// (defense in depth, even though alerts.ts already scrubs this)', () => {
    render(<AlertBanner alerts={[alert({ link: 'javascript:window.__xss=true' })]} />)
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('renders one entry per alert when there are several', () => {
    render(<AlertBanner alerts={[alert({ id: 'a' }), alert({ id: 'b', title: 'Drugi alert' })]} />)
    expect(screen.getByText('Utrudnienia w kursowaniu linii 20')).toBeInTheDocument()
    expect(screen.getByText('Drugi alert')).toBeInTheDocument()
  })
})

describe('AlertBanner inside the bottom sheet (phone map cards)', () => {
  it('one closed „Komunikaty (2)" disclosure holds both alerts; opening it keeps the inner „Rozwiń" labels', () => {
    render(
      <BottomSheet>
        <AlertBanner alerts={[alert({ id: 'a' }), alert({ id: 'b', title: 'Drugi alert' })]} />
      </BottomSheet>
    )
    const summary = screen.getByText('Komunikaty (2)')
    // eslint-disable-next-line testing-library/no-node-access -- stan <details> nie ma roli ARIA do zapytania
    const outer = summary.closest('details')!
    expect(outer).not.toHaveAttribute('open')
    fireEvent.click(summary)
    expect(outer).toHaveAttribute('open')
    expect(screen.getByText('Drugi alert')).toBeVisible()
    for (const label of screen.getAllByText('Rozwiń')) expect(label).toBeVisible()
  })

  it('renders nothing for an empty list', () => {
    render(
      <BottomSheet>
        <AlertBanner alerts={[]} />
      </BottomSheet>
    )
    expect(screen.queryByText(/Komunikaty/)).toBeNull()
  })
})

describe('alertDateRange', () => {
  it('reads dates from the text: none, one, or the first–last range regardless of order', () => {
    expect(alertDateRange('Bez dat.')).toBeNull()
    expect(alertDateRange('Dnia 27.09.2026 i znów 27.09.2026')).toBe('27.09.2026')
    expect(alertDateRange('od 28.09.2026, wcześniej 21.9.2026, potem 1.10.2026')).toBe('21.09.2026 – 01.10.2026')
  })
})
