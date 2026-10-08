// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { BoardHeading } from './BoardHeading'

describe('BoardHeading', () => {
  it('standalone board is the page h1', () => {
    render(<BoardHeading embedded={false} kind="pkp" id="33605">Warszawa Centralna</BoardHeading>)
    expect(screen.getByRole('heading', { level: 1, name: 'Warszawa Centralna' })).toBeInTheDocument()
  })

  it('embedded board is an h2 (TopBar already owns the h1)', () => {
    render(<BoardHeading embedded kind="gtfs" id="warszawa:x">Centrum</BoardHeading>)
    expect(screen.getByRole('heading', { level: 2, name: 'Centrum' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull()
  })
})
