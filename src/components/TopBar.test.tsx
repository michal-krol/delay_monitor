// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { TopBar } from './TopBar'

const CRUMBS = [{ label: 'Start', href: '/' }, { label: 'Warszawa Centralna' }]

describe('TopBar', () => {
  it('wariant nagłówka pokazuje tytuł jako h1 i podtytuł', () => {
    render(<TopBar title="Start" subtitle="Przypięte stacje" />)
    expect(screen.getByRole('heading', { level: 1, name: 'Start' })).toBeInTheDocument()
    expect(screen.getByText('Przypięte stacje')).toBeInTheDocument()
  })

  it('wariant powrotu z backHref: ← jest linkiem do rodzica o nazwie z backLabel', () => {
    render(<TopBar backLabel="Wróć do Startu" backHref="/" crumbs={CRUMBS} />)
    expect(screen.getByRole('link', { name: 'Wróć do Startu' })).toHaveAttribute('href', '/')
  })

  it('wariant powrotu z onBack: ← jest przyciskiem i wywołuje onBack po kliknięciu', async () => {
    const onBack = vi.fn()
    const user = userEvent.setup()
    render(<TopBar backLabel="Wróć do tablicy" onBack={onBack} crumbs={CRUMBS} />)

    await user.click(screen.getByRole('button', { name: 'Wróć do tablicy' }))

    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('wariant powrotu: ścieżka w jednym rzędzie, ostatni element to bieżąca strona', () => {
    render(<TopBar backLabel="Wróć do Startu" backHref="/" crumbs={CRUMBS} />)
    const nav = screen.getByRole('navigation', { name: 'Ścieżka nawigacji' })
    expect(within(nav).getByRole('link', { name: 'Start' })).toHaveAttribute('href', '/')
    expect(within(nav).getByText('Warszawa Centralna')).toHaveAttribute('aria-current', 'page')
    // Jeden rząd: żadnego nagłówka (h1 należy do karty treści strony).
    expect(screen.queryByRole('heading')).not.toBeInTheDocument()
  })

  it('wariant powrotu: share pokazuje „Udostępnij” obok przełącznika motywu, brak share go ukrywa', () => {
    const { rerender } = render(<TopBar backLabel="Wróć" onBack={vi.fn()} crumbs={CRUMBS} share />)
    expect(screen.getByRole('button', { name: 'Udostępnij' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Przełącz na tryb/ })).toBeInTheDocument()

    rerender(<TopBar backLabel="Wróć" onBack={vi.fn()} crumbs={CRUMBS} />)
    expect(screen.queryByRole('button', { name: 'Udostępnij' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Przełącz na tryb/ })).toBeInTheDocument()
  })

  it('nie pokazuje przycisku powiadomień -- funkcji nie ma, więc nie ma jej obiecywać', () => {
    // Dzwonek istniał tu wcześniej bez żadnej akcji. Powiadomienia wymagają
    // service workera, kluczy VAPID i trwałego zapisu subskrypcji, których ta
    // aplikacja świadomie nie ma (AGENTS.md #5) -- martwy przycisk był gorszy
    // niż jego brak.
    render(<TopBar title="Start" subtitle="x" />)
    expect(screen.queryByRole('button', { name: /powiadomienia/i })).not.toBeInTheDocument()
  })
})
