// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ContextAlerts } from './ContextAlerts'
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

const SCOPE = 'Komunikaty linii obsługujących ten przystanek'
const NO_ALERTS = 'Brak komunikatów dla tego kontekstu'
const FAILED = 'Nie udało się wczytać komunikatów'
const STALE_WARNING = 'Nie udało się odświeżyć. Pokazujemy ostatnie dane'

// Stan <details> nie ma roli ARIA do zapytania — karty to elementy `details`.
const cards = (): HTMLDetailsElement[] => screen.getAllByRole('group') as HTMLDetailsElement[]
// Skrót (pierwszy akapit) w <summary> to <span>; pełna treść to <p> — jednoakapitowa treść trafia do obu.
const bodies = (text: string): HTMLElement[] => screen.getAllByText(text).filter((el) => el.tagName === 'P')
const toggle = (title: string): void => {
  fireEvent.click(screen.getByText(title))
}

describe('ContextAlerts states', () => {
  it('shows the scope label as a heading, never an h1', () => {
    render(<ContextAlerts alerts={[]} state="ready" scopeLabel={SCOPE} />)
    expect(screen.getByRole('heading', { name: SCOPE, level: 3 })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull()
  })

  it('loading shows a status message and no empty-state text', () => {
    render(<ContextAlerts alerts={null} state="loading" scopeLabel={SCOPE} />)
    expect(screen.getByRole('status')).toHaveTextContent('Wczytywanie komunikatów…')
    expect(screen.queryByText(NO_ALERTS)).toBeNull()
  })

  it('ready with null alerts is still loading, never the empty state', () => {
    render(<ContextAlerts alerts={null} state="ready" scopeLabel={SCOPE} />)
    expect(screen.getByText('Wczytywanie komunikatów…')).toBeInTheDocument()
    expect(screen.queryByText(NO_ALERTS)).toBeNull()
  })

  it('ready with an empty list shows the empty state', () => {
    render(<ContextAlerts alerts={[]} state="ready" scopeLabel={SCOPE} />)
    expect(screen.getByText(NO_ALERTS)).toBeInTheDocument()
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.queryAllByRole('group')).toHaveLength(0)
  })

  it('failed with null alerts says it could not load and never claims there are none', () => {
    render(<ContextAlerts alerts={null} state="failed" scopeLabel={SCOPE} />)
    expect(screen.getByText(FAILED)).toBeInTheDocument()
    expect(screen.queryByText(NO_ALERTS)).toBeNull()
  })

  it('failed with an empty list and no last good data is a failure, not an empty success', () => {
    render(<ContextAlerts alerts={[]} state="failed" scopeLabel={SCOPE} />)
    expect(screen.getByText(FAILED)).toBeInTheDocument()
    expect(screen.queryByText(NO_ALERTS)).toBeNull()
  })

  it('failed with a list keeps the last data and shows the refresh warning', () => {
    render(<ContextAlerts alerts={[alert()]} state="failed" scopeLabel={SCOPE} />)
    expect(screen.getByText(STALE_WARNING)).toBeInTheDocument()
    expect(screen.getByText('Utrudnienia w kursowaniu linii 20')).toBeInTheDocument()
    expect(screen.queryByText(FAILED)).toBeNull()
  })

  it('failed + stale with an empty list shows the warning and the empty text', () => {
    render(<ContextAlerts alerts={[]} state="failed" stale scopeLabel={SCOPE} />)
    expect(screen.getByText(STALE_WARNING)).toBeInTheDocument()
    expect(screen.getByText(NO_ALERTS)).toBeInTheDocument()
    expect(screen.queryByText(FAILED)).toBeNull()
  })

  it('failed + stale with null alerts is treated as a plain failure to load', () => {
    render(<ContextAlerts alerts={null} state="failed" stale scopeLabel={SCOPE} />)
    expect(screen.getByText(FAILED)).toBeInTheDocument()
    expect(screen.queryByText(STALE_WARNING)).toBeNull()
  })
})

describe('ContextAlerts list', () => {
  it('dedupes by id, not by title: same title with different ids are two cards, same id twice is one', () => {
    render(
      <ContextAlerts
        alerts={[alert({ id: 'a' }), alert({ id: 'b' }), alert({ id: 'b', title: 'Duplikat id' })]}
        state="ready"
        scopeLabel={SCOPE}
      />
    )
    expect(cards()).toHaveLength(2)
    expect(screen.queryByText('Duplikat id')).toBeNull()
  })

  it('keeps the input order', () => {
    render(<ContextAlerts alerts={[alert({ id: 'a', title: 'Pierwszy' }), alert({ id: 'b', title: 'Drugi' })]} state="ready" scopeLabel={SCOPE} />)
    const [first, second] = cards()
    expect(within(first).getByText('Pierwszy')).toBeInTheDocument()
    expect(within(second).getByText('Drugi')).toBeInTheDocument()
  })

  it('cards start collapsed: body and source link hidden, expand label visible', () => {
    render(<ContextAlerts alerts={[alert()]} state="ready" scopeLabel={SCOPE} />)
    expect(cards()[0]).not.toHaveAttribute('open')
    expect(bodies('Treść utrudnienia.')[0]).not.toBeVisible()
    expect(screen.getByRole('link', { name: 'Źródło komunikatu', hidden: true })).not.toBeVisible()
    expect(screen.getByText('Rozwiń komunikat')).toBeInTheDocument()
    expect(screen.getByText('Zwiń komunikat')).toBeInTheDocument()
  })

  it('expanding one card reveals its body and link and does not close another', () => {
    render(
      <ContextAlerts
        alerts={[alert({ id: 'a', title: 'Pierwszy', body: 'Treść A' }), alert({ id: 'b', title: 'Drugi', body: 'Treść B' })]}
        state="ready"
        scopeLabel={SCOPE}
      />
    )
    toggle('Pierwszy')
    toggle('Drugi')
    const [first, second] = cards()
    expect(first).toHaveAttribute('open')
    expect(second).toHaveAttribute('open')
    expect(bodies('Treść A')[0]).toBeVisible()
    expect(bodies('Treść B')[0]).toBeVisible()
    expect(screen.getAllByRole('link', { name: 'Źródło komunikatu' })).toHaveLength(2)
  })

  it('an open card stays open after a re-render with the same ids in a new array', () => {
    const { rerender } = render(<ContextAlerts alerts={[alert({ id: 'a' }), alert({ id: 'b', title: 'Drugi' })]} state="ready" scopeLabel={SCOPE} />)
    toggle('Utrudnienia w kursowaniu linii 20')
    rerender(<ContextAlerts alerts={[alert({ id: 'a' }), alert({ id: 'b', title: 'Drugi' })]} state="ready" scopeLabel={SCOPE} />)
    const [first, second] = cards()
    expect(first).toHaveAttribute('open')
    expect(second).not.toHaveAttribute('open')
  })

  it('an open card stays open when a refresh adds a new alert (even in front of it)', () => {
    const { rerender } = render(<ContextAlerts alerts={[alert({ id: 'a', title: 'Stary' })]} state="ready" scopeLabel={SCOPE} />)
    toggle('Stary')
    rerender(<ContextAlerts alerts={[alert({ id: 'n', title: 'Nowy' }), alert({ id: 'a', title: 'Stary' })]} state="ready" scopeLabel={SCOPE} />)
    const [added, old] = cards()
    expect(added).not.toHaveAttribute('open')
    expect(old).toHaveAttribute('open')
    expect(within(old).getByText('Stary')).toBeInTheDocument()
  })

  it('an open card stays open when the state flips to failed with the same list', () => {
    const list = [alert()]
    const { rerender } = render(<ContextAlerts alerts={list} state="ready" scopeLabel={SCOPE} />)
    toggle('Utrudnienia w kursowaniu linii 20')
    rerender(<ContextAlerts alerts={list} state="failed" stale scopeLabel={SCOPE} />)
    expect(cards()[0]).toHaveAttribute('open')
  })
})

describe('ContextAlerts content safety', () => {
  it('renders malicious title and body as text, creating no elements', () => {
    const { container } = render(
      <ContextAlerts
        alerts={[alert({ title: '<img src=x onerror="window.__xss=1">', body: '<script>window.__xss=2</script> <b>pogrubione</b>' })]}
        state="ready"
        scopeLabel={SCOPE}
      />
    )
    /* eslint-disable testing-library/no-container, testing-library/no-node-access -- brak elementu = brak roli, którą dałoby się zapytać */
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('script')).toBeNull()
    expect(container.querySelector('b')).toBeNull()
    /* eslint-enable testing-library/no-container, testing-library/no-node-access */
    expect(screen.getByText('<img src=x onerror="window.__xss=1">')).toBeInTheDocument()
    expect(bodies('<script>window.__xss=2</script> <b>pogrubione</b>')).toHaveLength(1)
  })

  it.each(['javascript:window.__xss=true', 'http://www.wtp.waw.pl/x/', 'data:text/html,<b>x</b>'])('shows no link for a non-https link (%s)', (link) => {
    render(<ContextAlerts alerts={[alert({ link })]} state="ready" scopeLabel={SCOPE} />)
    expect(screen.queryByRole('link', { hidden: true })).toBeNull()
  })

  it('shows no link when the feed supplied none', () => {
    render(<ContextAlerts alerts={[alert({ link: '' })]} state="ready" scopeLabel={SCOPE} />)
    expect(screen.queryByRole('link', { hidden: true })).toBeNull()
  })

  it('opens an https link in a new tab with noopener and noreferrer', () => {
    render(<ContextAlerts alerts={[alert()]} state="ready" scopeLabel={SCOPE} />)
    toggle('Utrudnienia w kursowaniu linii 20')
    const link = screen.getByRole('link', { name: 'Źródło komunikatu' })
    expect(link).toHaveAttribute('href', 'https://www.wtp.waw.pl/utrudnienia/x/')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link.getAttribute('rel')).toContain('noopener')
    expect(link.getAttribute('rel')).toContain('noreferrer')
  })
})

describe('ContextAlerts card content', () => {
  it('shows the first paragraph as the preview in the summary and the whole body in the content', () => {
    render(<ContextAlerts alerts={[alert({ body: 'Akapit 1\n\nAkapit 2' })]} state="ready" scopeLabel={SCOPE} />)
    // eslint-disable-next-line testing-library/no-node-access -- <summary> nie ma roli ARIA do zapytania
    const summary = screen.getByText('Utrudnienia w kursowaniu linii 20').closest('summary')!
    expect(within(summary).getByText('Akapit 1')).toBeInTheDocument()
    expect(within(summary).queryByText(/Akapit 2/)).toBeNull()
    expect(screen.getByText('Akapit 1 Akapit 2')).toBeInTheDocument()
  })

  it('has no preview and no body when the body is empty', () => {
    render(<ContextAlerts alerts={[alert({ body: '' })]} state="ready" scopeLabel={SCOPE} />)
    expect(screen.getByText('Utrudnienia w kursowaniu linii 20')).toBeInTheDocument()
    toggle('Utrudnienia w kursowaniu linii 20')
    expect(screen.queryByText('Treść utrudnienia.')).toBeNull()
  })

  it('falls back to "Utrudnienie" for an empty title', () => {
    render(<ContextAlerts alerts={[alert({ title: '' })]} state="ready" scopeLabel={SCOPE} />)
    expect(screen.getByText('Utrudnienie')).toBeInTheDocument()
  })

  it('renders a multi-mode alert (metro + bus) as ONE card with both numbers and one body', () => {
    render(<ContextAlerts alerts={[alert({ routes: ['M1', '128'], body: 'Wspólny tekst.' })]} state="ready" scopeLabel={SCOPE} />)
    expect(cards()).toHaveLength(1)
    expect(screen.getByText('M1')).toBeInTheDocument()
    expect(screen.getByText('128')).toBeInTheDocument()
    expect(bodies('Wspólny tekst.')).toHaveLength(1)
  })

  it.each([['S2'], ['20'], ['128'], ['M1']])('renders the line number %s', (num) => {
    render(<ContextAlerts alerts={[alert({ routes: [num] })]} state="ready" scopeLabel={SCOPE} />)
    expect(screen.getByText(num)).toBeInTheDocument()
  })

  it('renders no badges when the alert has no routes', () => {
    render(<ContextAlerts alerts={[alert({ routes: [] })]} state="ready" scopeLabel={SCOPE} />)
    expect(screen.queryByText('20')).toBeNull()
    expect(cards()).toHaveLength(1)
  })

  it('shows no date line even when the body mentions a date', () => {
    render(<ContextAlerts alerts={[alert({ body: 'W dniu 27.09.2026 objazd.' })]} state="ready" scopeLabel={SCOPE} />)
    expect(screen.queryByText(/Daty w komunikacie/)).toBeNull()
  })

  it('body has no height cap or nested scroll', () => {
    render(<ContextAlerts alerts={[alert({ body: 'x'.repeat(5000) })]} state="ready" scopeLabel={SCOPE} />)
    const body = bodies('x'.repeat(5000))[0]
    expect(body.className).not.toMatch(/max-h|overflow-y|overflow-auto/)
    expect(body).not.toHaveAttribute('tabindex')
  })
})

describe('ContextAlerts "Na mapie"', () => {
  it('renders no map button when onShowMap is not given', () => {
    render(<ContextAlerts alerts={[alert()]} state="ready" scopeLabel={SCOPE} />)
    expect(screen.queryByRole('button', { name: 'Na mapie' })).toBeNull()
  })

  it('calls onShowMap with the record and does not toggle the card', () => {
    const onShowMap = vi.fn()
    const record = alert()
    render(<ContextAlerts alerts={[record]} state="ready" scopeLabel={SCOPE} onShowMap={onShowMap} />)
    fireEvent.click(screen.getByRole('button', { name: 'Na mapie' }))
    expect(onShowMap).toHaveBeenCalledTimes(1)
    expect(onShowMap).toHaveBeenCalledWith(record)
    expect(cards()[0]).not.toHaveAttribute('open')
  })

  it('has one map button per card and type="button"', () => {
    render(<ContextAlerts alerts={[alert({ id: 'a' }), alert({ id: 'b' })]} state="ready" scopeLabel={SCOPE} onShowMap={() => {}} />)
    const buttons = screen.getAllByRole('button', { name: 'Na mapie' })
    expect(buttons).toHaveLength(2)
    for (const b of buttons) expect(b).toHaveAttribute('type', 'button')
  })
})
