// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AlertBanner, AlertBody, AlertSourceLink, alertDateRange, safeAlertLink } from './AlertBanner'
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

  it('keeps a very long body inside the banner, collapsed and height-capped', () => {
    const long = 'Objazd przez ulicę Długą. '.repeat(400)
    render(<AlertBanner alerts={[alert({ body: long })]} />)
    const body = screen.getByText(/Objazd przez ulicę Długą\./)
    expect(body).not.toBeVisible()
    expect(body.className).toContain('max-h-80')
    fireEvent.click(screen.getByText('Utrudnienia w kursowaniu linii 20'))
    expect(body).toBeVisible()
  })

  it('shows no „Daty w komunikacie" line when neither the payload nor the body has a date', () => {
    render(<AlertBanner alerts={[alert({ body: 'Objazd bez podanej daty.' })]} />)
    expect(screen.queryByText(/Daty w komunikacie/)).toBeNull()
  })

  it('renders a malicious title and body as text, creating no elements', () => {
    const { container } = render(
      <AlertBanner alerts={[alert({ title: '<img src=x onerror="window.__xss=1">', body: '<script>window.__xss=2</script>' })]} />
    )
    /* eslint-disable testing-library/no-container, testing-library/no-node-access -- brak elementu = brak roli, którą dałoby się zapytać */
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('script')).toBeNull()
    /* eslint-enable testing-library/no-container, testing-library/no-node-access */
    expect(screen.getByText('<img src=x onerror="window.__xss=1">')).toBeInTheDocument()
    expect(screen.getByText('<script>window.__xss=2</script>')).toBeInTheDocument()
  })

  it('keeps both line numbers of an alert in its text, one entry for the alert', () => {
    render(<AlertBanner alerts={[alert({ routes: ['M1', '128'], title: 'Linie M1 i 128 – zmiany' })]} />)
    expect(screen.getByText('Linie M1 i 128 – zmiany')).toBeInTheDocument()
    expect(screen.getAllByRole('group')).toHaveLength(1)
  })

  it('does not move focus away from the summary when it is toggled', () => {
    render(<AlertBanner alerts={[alert()]} />)
    const summary = screen.getByText('Utrudnienia w kursowaniu linii 20')
    // eslint-disable-next-line testing-library/no-node-access -- <summary> nie ma roli ARIA do zapytania
    const control = summary.closest('summary')!
    control.focus()
    expect(control).toHaveFocus()
    fireEvent.click(control)
    expect(screen.getByRole('group')).toHaveAttribute('open')
    expect(control).toHaveFocus()
    fireEvent.click(control)
    expect(control).toHaveFocus()
  })

  it('opens the source link with noopener and noreferrer', () => {
    render(<AlertBanner alerts={[alert()]} />)
    const rel = screen.getByRole('link', { name: /Szczegóły/ }).getAttribute('rel')
    expect(rel).toContain('noopener')
    expect(rel).toContain('noreferrer')
  })
})

describe('shared alert pieces', () => {
  it('safeAlertLink passes only https:// links', () => {
    expect(safeAlertLink('https://www.wtp.waw.pl/x/')).toBe('https://www.wtp.waw.pl/x/')
    expect(safeAlertLink('http://www.wtp.waw.pl/x/')).toBe('')
    expect(safeAlertLink('javascript:alert(1)')).toBe('')
    expect(safeAlertLink('')).toBe('')
  })

  it('AlertBody bounded keeps the height cap; unbounded has no cap and no scroll', () => {
    render(
      <>
        <AlertBody body="Ograniczone" bounded />
        <AlertBody body="Swobodne" bounded={false} />
      </>
    )
    expect(screen.getByText('Ograniczone').className).toContain('max-h-80')
    expect(screen.getByText('Ograniczone').className).toContain('overflow-y-auto')
    const free = screen.getByText('Swobodne')
    expect(free.className).not.toMatch(/max-h|overflow-y|overflow-auto/)
    expect(free.className).toContain('whitespace-pre-line')
    expect(free).not.toHaveAttribute('tabindex')
  })

  it('AlertSourceLink opens in a new tab with noopener noreferrer', () => {
    render(<AlertSourceLink href="https://www.wtp.waw.pl/x/" label="Źródło komunikatu" />)
    const link = screen.getByRole('link', { name: 'Źródło komunikatu' })
    expect(link).toHaveAttribute('href', 'https://www.wtp.waw.pl/x/')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link.getAttribute('rel')).toContain('noopener')
    expect(link.getAttribute('rel')).toContain('noreferrer')
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
