// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { LinePanel } from './LinePanel'
import { LineSearch } from './LineSearch'
import { MapFilters } from './MapFilters'
import { MapLegend } from './MapLegend'
import { PanelFrame } from './PanelFrame'
import type { LayerKey } from './mapData'
import type { LineListEntry } from '@/lib/gtfs/query'
import { ON_REQUEST_TITLE } from '../OnRequestBadge'

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
    expect(screen.getByRole('status')).toHaveTextContent('Wczytywanie linii…')
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
    expect(button).toHaveTextContent('1 aktywnych ograniczeń')
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

  it('counts "only lines with disruptions" as a restriction and resets it too', () => {
    const onAlertsOnly = vi.fn()
    render(<MapFilters hidden={new Set()} vehicleLayers={[]} onChange={() => {}} alertsOnly onAlertsOnly={onAlertsOnly} />)
    fireEvent.click(screen.getByRole('button', { name: /Filtry/ }))
    expect(screen.getByRole('checkbox', { name: 'Tylko linie z utrudnieniami' })).toBeChecked()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Tylko linie z utrudnieniami' }))
    expect(onAlertsOnly).toHaveBeenLastCalledWith(false)
    fireEvent.click(screen.getByRole('button', { name: 'Pokaż wszystko' }))
    expect(onAlertsOnly).toHaveBeenCalledTimes(2)
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

describe('LinePanel', () => {
  const entry = line('20', '20')
  const props = { line: entry, directionId: 0, vehiclesOnLine: 0, city: 'warszawa', onDirection: () => {}, onStop: () => {}, onClose: () => {} }

  it('tells loading, failure and an unknown route apart, always keeping the timetable link', () => {
    const { rerender } = render(<LinePanel {...props} detail={undefined} error={false} />)
    expect(screen.getByRole('dialog', { name: 'Linia 20' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Rozkład linii/ })).toHaveAttribute('href', '/city/warszawa/line/20')
    rerender(<LinePanel {...props} detail={undefined} error />)
    expect(screen.getByText('Nie udało się pobrać przebiegu linii.')).toBeInTheDocument()
    rerender(<LinePanel {...props} detail={null} error={false} />)
    expect(screen.getByText('Rozkład nie zna przebiegu tej linii.')).toBeInTheDocument()
  })

  it('offers no direction switch for a one-way line and marks on-request stops', () => {
    const stop = { stopId: '1', groupId: '1', name: 'Pętla', code: null, street: null, wheelchair: 0 as const, lat: 52, lon: 21, offsetSec: 0, onRequest: true }
    const detail = { ...entry, directions: [{ directionId: 0, headsign: null, origin: null, departures: [], shape: null, stops: [stop] }] }
    render(<LinePanel {...props} detail={detail} error={false} />)
    expect(screen.queryByRole('button', { name: 'Zmień kierunek' })).toBeNull()
    // Strzałka kierunku to ikona z nazwą „do”, nie tekstowe „→”.
    expect(screen.getByText('— —')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'do' })).toBeInTheDocument()
    expect(screen.getByText('na żądanie')).toHaveAttribute('title', ON_REQUEST_TITLE)
  })

  it('closes on Escape', () => {
    const onClose = vi.fn()
    render(<LinePanel {...props} onClose={onClose} detail={undefined} error={false} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
  })
})

describe('Escape inside a panel page — the innermost open thing closes first', () => {
  it('MapFilters open dropdown consumes Escape, the panel stays; a second Escape closes the panel', () => {
    const onClose = vi.fn()
    render(
      <>
        <MapFilters hidden={new Set<LayerKey>()} vehicleLayers={[]} onChange={() => {}} />
        <PanelFrame title="A" closeLabel="Zamknij" onClose={onClose}>
          x
        </PanelFrame>
      </>,
    )
    const button = screen.getByRole('button', { name: /Filtry/ })
    fireEvent.click(button)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(button).toHaveAttribute('aria-expanded', 'false')
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('LineSearch with a query consumes Escape; with an empty query the panel closes', () => {
    const onClose = vi.fn()
    render(
      <>
        <LineSearch lines={[line('20')]} onSelect={() => {}} />
        <PanelFrame title="A" closeLabel="Zamknij" onClose={onClose}>
          x
        </PanelFrame>
      </>,
    )
    const input = screen.getByRole('combobox')
    fireEvent.change(input, { target: { value: '20' } })
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(input).toHaveValue('')
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
  })
})
