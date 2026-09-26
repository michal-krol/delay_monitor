// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { LineSearch } from './LineSearch'
import { MapFilters } from './MapFilters'
import { MapLegend } from './MapLegend'
import type { LayerKey } from './mapData'
import type { LineListEntry } from '@/lib/gtfs/query'

const line = (routeId: string, name = routeId, longName = ''): LineListEntry => ({
  routeId, line: name, longName, color: null, textColor: '#ffffff', mode: 'bus', kind: 'regular',
})

describe('LineSearch', () => {
  const lines = [line('120'), line('20'), line('159', '159', 'Małe Siekierki — CH Blue City'), line('M1', 'M1')]

  it('ranks the exact number first, then prefixes, then names; selects with Enter', () => {
    const onSelect = vi.fn()
    render(<LineSearch lines={lines} onSelect={onSelect} />)
    const input = screen.getByRole('combobox', { name: 'Szukaj linii' })
    fireEvent.change(input, { target: { value: '20' } })
    expect(screen.getAllByRole('option').map((o) => o.getAttribute('aria-label'))).toEqual(['Linia 20'])
    fireEvent.change(input, { target: { value: '1' } })
    expect(screen.getAllByRole('option').map((o) => o.getAttribute('aria-label'))).toEqual(['Linia 120', 'Linia 159, Małe Siekierki — CH Blue City'])
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onSelect).toHaveBeenCalledWith(lines[2])
    expect(input).toHaveValue('')
  })

  it('finds by destination name, diacritics-insensitive', () => {
    render(<LineSearch lines={lines} onSelect={() => {}} />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'siekierki' } })
    expect(screen.getAllByRole('option')).toHaveLength(1)
  })

  it('tells loading apart from "no such line"', () => {
    const { rerender } = render(<LineSearch lines={null} onSelect={() => {}} />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '999' } })
    expect(screen.getByRole('status')).toHaveTextContent('Wczytuję linie…')
    rerender(<LineSearch lines={lines} onSelect={() => {}} />)
    expect(screen.getByRole('status')).toHaveTextContent('Nie znaleziono linii')
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Escape' })
    expect(screen.queryByRole('status')).toBeNull()
  })
})

describe('MapFilters', () => {
  it('counts hidden layers, toggles one, resets all, and closes on Escape', () => {
    const onChange = vi.fn()
    render(<MapFilters hidden={new Set<LayerKey>(['busStops'])} vehicleLayers={['buses', 'trams']} onChange={onChange} />)
    const button = screen.getByRole('button', { name: /Filtry/ })
    expect(button).toHaveTextContent('1 ukrytych warstw')
    expect(button).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(button)
    expect(button).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('checkbox', { name: /Przystanki autobusowe/ })).not.toBeChecked()
    expect(screen.queryByRole('checkbox', { name: /Pociągi/ })).toBeNull()

    fireEvent.click(screen.getByRole('checkbox', { name: /Tramwaje/ }))
    expect([...onChange.mock.calls[0][0]].sort()).toEqual(['busStops', 'trams'])
    fireEvent.click(screen.getByRole('button', { name: 'Pokaż wszystko' }))
    expect(onChange.mock.calls[1][0].size).toBe(0)

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(button).toHaveAttribute('aria-expanded', 'false')
    expect(button).toHaveFocus()
  })

  it('closes on a click outside', () => {
    render(<MapFilters hidden={new Set()} vehicleLayers={[]} onChange={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /Filtry/ }))
    expect(screen.queryByText('Pojazdy')).toBeNull()
    fireEvent.pointerDown(document.body)
    expect(screen.getByRole('button', { name: /Filtry/ })).toHaveAttribute('aria-expanded', 'false')
  })
})

describe('MapLegend', () => {
  it('describes kinds of objects, never "live" as a category', () => {
    render(<MapLegend />)
    for (const label of ['Stacja kolejowa', 'Stacja metra', 'Przystanek tramwajowy', 'Przystanek autobusowy', 'Autobus', 'Tramwaj', 'Pociąg']) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
    expect(screen.queryByText(/na żywo/)).toBeNull()
  })
})
