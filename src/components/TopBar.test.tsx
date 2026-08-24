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

  it('wariant powrotu pokazuje link zamiast tytułu', () => {
    render(<TopBar backHref="/odjazdy/123" backLabel="Powrót do wyników" />)
    expect(screen.getByRole('link', { name: /Powrót do wyników/ })).toHaveAttribute('href', '/odjazdy/123')
  })

  it('wariant powrotu z onBack pokazuje przycisk zamiast linku i wywołuje callback', async () => {
    const onBack = vi.fn()
    const user = userEvent.setup()
    render(<TopBar onBack={onBack} backLabel="Powrót do wyników" />)

    const button = screen.getByRole('button', { name: /Powrót do wyników/ })
    expect(screen.queryByRole('link', { name: /Powrót do wyników/ })).not.toBeInTheDocument()
    await user.click(button)

    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('zawsze pokazuje przycisk powiadomień', () => {
    render(<TopBar title="Pulpit" subtitle="x" />)
    expect(screen.getByRole('button', { name: /powiadomienia/i })).toBeInTheDocument()
  })
})
