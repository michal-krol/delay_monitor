// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ModeFilter } from './ModeFilter'

describe('ModeFilter', () => {
  it('renders "Wszystko" plus one chip per available mode, in order', () => {
    render(<ModeFilter available={['bus', 'metro']} value="all" onChange={() => {}} />)
    const labels = screen.getAllByRole('button').map((b) => b.textContent)
    expect(labels).toEqual(['Wszystko', 'metro', 'autobus'])
  })

  it('marks the active chip with aria-pressed and reports changes', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<ModeFilter available={['tram']} value="tram" onChange={onChange} />)
    expect(screen.getByRole('button', { name: 'tramwaj' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(screen.getByRole('button', { name: 'Wszystko' }))
    expect(onChange).toHaveBeenCalledWith('all')
  })
})
