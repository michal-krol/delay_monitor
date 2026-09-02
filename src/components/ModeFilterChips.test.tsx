// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ModeFilterChips } from './ModeFilterChips'

describe('ModeFilterChips', () => {
  it('marks the active chip and reports changes', async () => {
    const onChange = vi.fn()
    render(<ModeFilterChips value="all" onChange={onChange} />)

    expect(screen.getByRole('button', { name: 'Wszystko' })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(screen.getByRole('button', { name: /metro/i }))
    expect(onChange).toHaveBeenCalledWith('metro')
  })

  it('offers rail (PKP stations) and the three city modes', () => {
    render(<ModeFilterChips value="rail" onChange={vi.fn()} />)
    for (const label of ['Metro', 'Tramwaj', 'Autobus', 'Kolej']) {
      expect(screen.getByRole('button', { name: new RegExp(label, 'i') })).toBeInTheDocument()
    }
    expect(screen.getByRole('button', { name: 'Kolej' })).toHaveAttribute('aria-pressed', 'true')
  })
})
