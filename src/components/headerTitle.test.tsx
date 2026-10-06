// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { HeaderTitleProvider, useHeaderTitle } from './headerTitle'
import { MobileHeader } from './MobileHeader'

vi.mock('next/link', async () => {
  const { createElement } = await import('react')
  return { default: ({ href, children, ...rest }: { href: string; children?: React.ReactNode }) => createElement('a', { href, ...rest }, children) }
})

function Board({ name }: { name: string | null }) {
  useHeaderTitle(name)
  return <p>tablica</p>
}

describe('header title', () => {
  it('shows no context title until a board announces its name', () => {
    render(
      <HeaderTitleProvider>
        <MobileHeader onSearch={() => {}} />
      </HeaderTitleProvider>
    )
    expect(screen.queryByTestId('header-context-title')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Monitor opóźnień' })).toBeInTheDocument()
  })

  it('renders the announced name next to the app name, hidden from assistive tech (the h1 owns the name)', () => {
    render(
      <HeaderTitleProvider>
        <MobileHeader onSearch={() => {}} />
        <Board name="Kraków Główny" />
      </HeaderTitleProvider>
    )
    const title = screen.getByTestId('header-context-title')
    expect(title).toHaveTextContent('Kraków Główny')
    expect(title).toHaveAttribute('aria-hidden', 'true')
    // Nazwa linku do Pulpitu zostaje „Monitor opóźnień” — kopia nazwy tablicy nie wchodzi do drzewa dostępności.
    expect(screen.getByRole('link', { name: 'Monitor opóźnień' })).toBeInTheDocument()
  })

  it('clears the name when the board unmounts', () => {
    const view = render(
      <HeaderTitleProvider>
        <MobileHeader onSearch={() => {}} />
        <Board name="Kraków Główny" />
      </HeaderTitleProvider>
    )
    view.rerender(
      <HeaderTitleProvider>
        <MobileHeader onSearch={() => {}} />
      </HeaderTitleProvider>
    )
    expect(screen.queryByTestId('header-context-title')).not.toBeInTheDocument()
  })

  it('follows a changing name and ignores null (embedded boards announce nothing)', () => {
    const view = render(
      <HeaderTitleProvider>
        <MobileHeader onSearch={() => {}} />
        <Board name="A" />
      </HeaderTitleProvider>
    )
    view.rerender(
      <HeaderTitleProvider>
        <MobileHeader onSearch={() => {}} />
        <Board name="B" />
      </HeaderTitleProvider>
    )
    expect(screen.getByTestId('header-context-title')).toHaveTextContent('B')
    view.rerender(
      <HeaderTitleProvider>
        <MobileHeader onSearch={() => {}} />
        <Board name={null} />
      </HeaderTitleProvider>
    )
    expect(screen.queryByTestId('header-context-title')).not.toBeInTheDocument()
  })

  it('works without a provider (isolated component tests render boards bare)', () => {
    render(<Board name="X" />)
    expect(screen.getByText('tablica')).toBeInTheDocument()
  })
})
