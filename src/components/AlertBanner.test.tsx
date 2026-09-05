// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AlertBanner } from './AlertBanner'
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

  it('shows title, body and a link out to the source', () => {
    render(<AlertBanner alerts={[alert()]} />)
    expect(screen.getByText('Utrudnienia w kursowaniu linii 20')).toBeInTheDocument()
    expect(screen.getByText('Treść utrudnienia.')).toBeInTheDocument()
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
