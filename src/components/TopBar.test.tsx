// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { TopBar } from './TopBar'

describe('TopBar', () => {
  it('wariant nagłówka pokazuje tytuł i podtytuł', () => {
    render(<TopBar title="Pulpit" subtitle="Twoje ulubione stacje" />)
    expect(screen.getByRole('heading', { name: 'Pulpit' })).toBeInTheDocument()
    expect(screen.getByText('Twoje ulubione stacje')).toBeInTheDocument()
  })

  it('wariant powrotu pokazuje przycisk i wywołuje onBack po kliknięciu', async () => {
    const onBack = vi.fn()
    const user = userEvent.setup()
    render(<TopBar onBack={onBack} backLabel="Powrót do wyników" />)

    await user.click(screen.getByRole('button', { name: /Powrót do wyników/ }))

    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('nie pokazuje przycisku powiadomień -- funkcji nie ma, więc nie ma jej obiecywać', () => {
    // Dzwonek istniał tu wcześniej bez żadnej akcji. Powiadomienia wymagają
    // service workera, kluczy VAPID i trwałego zapisu subskrypcji, których ta
    // aplikacja świadomie nie ma (AGENTS.md #5) -- martwy przycisk był gorszy
    // niż jego brak.
    render(<TopBar title="Pulpit" subtitle="x" />)
    expect(screen.queryByRole('button', { name: /powiadomienia/i })).not.toBeInTheDocument()
  })
})
