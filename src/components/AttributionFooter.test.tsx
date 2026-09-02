// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AttributionFooter } from './AttributionFooter'

describe('AttributionFooter', () => {
  it('renders every attribution from the feed, joined', () => {
    render(<AttributionFooter attribution={['Zarząd Transportu Miejskiego w Warszawie', 'Mikołaj Kuranowski']} />)
    expect(
      screen.getByText(/Zarząd Transportu Miejskiego w Warszawie · Mikołaj Kuranowski/)
    ).toBeInTheDocument()
  })

  it('renders nothing when the feed gave no attribution', () => {
    const { container } = render(<AttributionFooter attribution={[]} />)
    expect(container).toBeEmptyDOMElement()
  })
})
