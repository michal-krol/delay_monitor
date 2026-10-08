// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AppError from './error'

const SECRET = 'ECONNREFUSED 10.0.0.7:5432 at /srv/app/secret.ts'

let logged: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  logged = vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => logged.mockRestore())

describe('(app)/error.tsx', () => {
  it('shows Polish copy per ui-copy.md, never the raw error text or digest', () => {
    render(<AppError error={Object.assign(new Error(SECRET), { digest: 'abc123' })} retry={() => {}} />)
    expect(screen.getByRole('heading', { level: 1, name: /Nie udało się wczytać tej strony/ })).toBeInTheDocument()
    expect(screen.queryByText(/ECONNREFUSED|secret\.ts|abc123/)).not.toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/Błąd/)
  })

  it('"Spróbuj ponownie" calls retry (Next 16.3: retry, not reset)', async () => {
    const retry = vi.fn()
    render(<AppError error={new Error('x')} retry={retry} />)
    await userEvent.click(screen.getByRole('button', { name: 'Spróbuj ponownie' }))
    expect(retry).toHaveBeenCalledTimes(1)
  })

  it('"Wróć do Pulpitu" is a link to /', () => {
    render(<AppError error={new Error('x')} retry={() => {}} />)
    expect(screen.getByRole('link', { name: 'Wróć do Pulpitu' })).toHaveAttribute('href', '/')
  })

  it('logs the error for diagnostics (console only, not UI)', () => {
    const error = new Error(SECRET)
    render(<AppError error={error} retry={() => {}} />)
    expect(logged).toHaveBeenCalledWith(error)
  })
})
