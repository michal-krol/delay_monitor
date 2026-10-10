// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Breadcrumb } from './Breadcrumb'

describe('Breadcrumb', () => {
  it('links every item except the last, which is marked as the current page', () => {
    render(
      <Breadcrumb
        items={[
          { label: 'Linie', href: '/city/warszawa/lines' },
          { label: 'Centrum' },
        ]}
      />
    )

    const link = screen.getByRole('link', { name: 'Linie' })
    expect(link).toHaveAttribute('href', '/city/warszawa/lines')

    const current = screen.getByText('Centrum')
    expect(current).toHaveAttribute('aria-current', 'page')
    expect(current.tagName).not.toBe('A')
  })

  it('below sm shows only the current page on one line (← already leads to the parent)', () => {
    render(
      <Breadcrumb
        items={[
          { label: 'Start', href: '/' },
          { label: 'Warszawa Centralna' },
        ]}
      />
    )

    // jsdom nie zna media queries — sprawdzamy klasy: rodzic (z separatorem) ukryty do `sm`,
    // bieżąca strona ucinana wielokropkiem zamiast łamania na kilka wierszy.
    // eslint-disable-next-line testing-library/no-node-access -- klasa widoczności siedzi na opakowaniu linku i separatora
    expect(screen.getByRole('link', { name: 'Start' }).parentElement).toHaveClass('hidden', 'sm:flex')
    const current = screen.getByText('Warszawa Centralna')
    expect(current).toHaveClass('truncate')
    expect(current).toHaveAttribute('title', 'Warszawa Centralna')
    expect(screen.getByText('/')).toHaveClass('hidden', 'sm:inline')
  })

  it('renders an item without href as plain text, not a link', () => {
    render(
      <Breadcrumb
        items={[
          { label: 'Linie' },
          { label: 'Wczytywanie…' },
        ]}
      />
    )

    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(screen.getByText('Linie')).toBeInTheDocument()
  })
})
