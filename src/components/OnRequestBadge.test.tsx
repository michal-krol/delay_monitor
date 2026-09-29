// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ON_REQUEST_TITLE, OnRequestBadge } from './OnRequestBadge'

describe('OnRequestBadge', () => {
  it('says „na żądanie” in words and explains it in the title', () => {
    render(<OnRequestBadge />)
    expect(screen.getByText('na żądanie')).toHaveAttribute('title', ON_REQUEST_TITLE)
  })
})
