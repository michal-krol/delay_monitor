// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
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

  it('zawsze pokazuje przycisk powiadomień', () => {
    render(<TopBar title="Pulpit" subtitle="x" />)
    expect(screen.getByRole('button', { name: /powiadomienia/i })).toBeInTheDocument()
  })
})
