// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { HeaderTitleProvider } from './headerTitle'
import { usePageHeader, useHeaderWeather, useHeaderWeatherContext, usePageHeaderContext } from './pageHeader'
import { MobileHeader } from './MobileHeader'

vi.mock('next/link', async () => {
  const { createElement } = await import('react')
  return { default: ({ href, children, ...rest }: { href: string; children?: React.ReactNode }) => createElement('a', { href, ...rest }, children) }
})

function Page({ name = 'Linie' }: { name?: string }) {
  usePageHeader({ title: name, backHref: '/', backLabel: 'Wróć do Startu', share: true })
  useHeaderWeather({ status: 'unavailable' }, name)
  return <h1>{name}</h1>
}

function ContextProbe() {
  const header = usePageHeaderContext()
  const weather = useHeaderWeatherContext()
  return <p data-testid="context">{header?.title} / {weather?.name}</p>
}

describe('shared page header', () => {
  it('cleanup of an older route cannot erase a newer owner', () => {
    const view = render(<HeaderTitleProvider><ContextProbe /><Page key="old" name="Stara strona" /><Page key="new" name="Nowa strona" /></HeaderTitleProvider>)
    expect(screen.getByTestId('context')).toHaveTextContent('Nowa strona / Nowa strona')
    view.rerender(<HeaderTitleProvider><ContextProbe /><Page key="new" name="Nowa strona" /></HeaderTitleProvider>)
    expect(screen.getByTestId('context')).toHaveTextContent('Nowa strona / Nowa strona')
  })
  it('announces the page and back action, with one page h1 and weather supplied without fetching', () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    render(<HeaderTitleProvider><MobileHeader /><Page /></HeaderTitleProvider>)
    expect(screen.getByRole('link', { name: 'Wróć do Startu' })).toHaveAttribute('href', '/')
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Pogoda: brak danych lokalizacyjnych' })).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('opens the sources from More and restores the trigger when Escape closes the menu', () => {
    render(<HeaderTitleProvider><MobileHeader /><Page /></HeaderTitleProvider>)
    const more = screen.getByRole('button', { name: 'Więcej opcji strony' })
    fireEvent.click(more)
    expect(screen.getByRole('button', { name: 'Udostępnij' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Źródła danych' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Przełącz na tryb/ })).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('button', { name: 'Źródła danych' })).not.toBeInTheDocument()
    expect(more).toHaveFocus()
  })

  it('clears route context on unmount and does not retain the previous weather', () => {
    const view = render(<HeaderTitleProvider><MobileHeader /><Page /></HeaderTitleProvider>)
    view.rerender(<HeaderTitleProvider><MobileHeader /></HeaderTitleProvider>)
    expect(screen.queryByRole('link', { name: 'Wróć do Startu' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pogoda: brak danych lokalizacyjnych' })).toBeInTheDocument()
    expect(screen.queryByText('Linie')).not.toBeInTheDocument()
  })
})
