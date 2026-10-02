// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { MobileHeader } from './MobileHeader'

describe('MobileHeader', () => {
  it('„Szukaj" button calls onSearch', async () => {
    const onSearch = vi.fn()
    const user = userEvent.setup()
    render(<MobileHeader onSearch={onSearch} />)
    await user.click(screen.getByRole('button', { name: 'Szukaj' }))
    expect(onSearch).toHaveBeenCalledTimes(1)
  })

  it('links the app name to the home page and holds the theme toggle', () => {
    render(<MobileHeader onSearch={vi.fn()} />)
    expect(screen.getByRole('link', { name: /Monitor opóźnień/ })).toHaveAttribute('href', '/')
    expect(screen.getByRole('button', { name: /tryb/i })).toBeInTheDocument()
  })

  it('has no menu button any more', () => {
    render(<MobileHeader onSearch={vi.fn()} />)
    expect(screen.queryByRole('button', { name: /menu/i })).toBeNull()
  })
})
