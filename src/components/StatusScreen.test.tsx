// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { StatusScreen } from './StatusScreen'

describe('StatusScreen', () => {
  it('renders one h1, the message and the actions inside a main landmark', () => {
    render(
      <StatusScreen title="Tytuł" actions={<button type="button">Akcja</button>}>
        Opis
      </StatusScreen>
    )
    expect(screen.getByRole('main')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Tytuł' })).toBeInTheDocument()
    expect(screen.getByText('Opis')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Akcja' })).toBeInTheDocument()
  })
})
