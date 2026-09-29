// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ShareButton } from './ShareButton'

afterEach(() => vi.unstubAllGlobals())

describe('ShareButton', () => {
  it('copies the current URL and confirms with a status message', async () => {
    const user = userEvent.setup()
    // Po `userEvent.setup()` — ono podstawia własną atrapę schowka.
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    render(<ShareButton />)

    await user.click(screen.getByRole('button', { name: 'Udostępnij' }))

    expect(writeText).toHaveBeenCalledWith(window.location.href)
    expect(await screen.findByRole('status')).toHaveTextContent('Skopiowano link')
  })

  it('points to the address bar when the clipboard is unavailable', async () => {
    const user = userEvent.setup()
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true })
    render(<ShareButton />)

    await user.click(screen.getByRole('button', { name: 'Udostępnij' }))

    expect(await screen.findByRole('status')).toHaveTextContent(/link w pasku adresu/)
  })
})
