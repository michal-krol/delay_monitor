// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { StationStatsCards } from './StationStatsCards'
import type { StationStats } from '@/lib/board/stationStats'

function stats(overrides: Partial<StationStats> = {}): StationStats {
  return {
    departuresToday: 128,
    arrivalsToday: 132,
    averageDelayMinutes: 6,
    averageDelaySample: 42,
    punctualityPct: 92,
    punctualitySample: 42,
    punctualityThresholdMinutes: 5,
    ...overrides,
  }
}

describe('StationStatsCards', () => {
  it('shows the four figures with the methodology spelled out under each', () => {
    render(<StationStatsCards stats={stats()} />)

    expect(screen.getByText('128')).toBeInTheDocument()
    expect(screen.getByText('132')).toBeInTheDocument()
    expect(screen.getByText('+6')).toBeInTheDocument()
    expect(screen.getByText('92%')).toBeInTheDocument()

    // Makieta §4 ostrzega, żeby nie podawać własnego wskaźnika jako oficjalnej
    // statystyki przewoźnika -- podpis pod liczbą jest tym zabezpieczeniem.
    expect(screen.getByText('z 42 potwierdzonych dziś przejazdów')).toBeInTheDocument()
    expect(screen.getByText('dziś, opóźnienie do 5 min')).toBeInTheDocument()
  })

  it('says "brak danych", never zero, when the schedule could not be fetched', () => {
    // „Nie udało się sprawdzić" i „zero pociągów" to dwa różne komunikaty
    // (AGENTS.md #7) -- kafelek „0 pociągów" przy zepsutym pobraniu kłamie.
    render(<StationStatsCards stats={stats({ departuresToday: null, arrivalsToday: null })} />)

    expect(screen.getAllByText('brak danych')).toHaveLength(2)
    expect(screen.queryByText('0')).not.toBeInTheDocument()
    expect(screen.getAllByText('nie udało się pobrać rozkładu')).toHaveLength(2)
  })

  it('distinguishes still-loading from failed -- they are not the same message', () => {
    render(<StationStatsCards stats={undefined} loading />)

    expect(screen.getAllByText('wczytywanie rozkładu…')).toHaveLength(2)
    expect(screen.queryByText('nie udało się pobrać rozkładu')).not.toBeInTheDocument()
    expect(screen.queryByText('brak danych')).not.toBeInTheDocument()
  })

  it('reports an empty realization sample as "brak danych", not as zero delay', () => {
    // +0 min znaczy „sprawdziliśmy i są punktualne"; brak próbki znaczy
    // „nic się jeszcze nie potwierdziło". Zlanie ich mówiłoby nieprawdę.
    render(<StationStatsCards stats={stats({ averageDelayMinutes: null, averageDelaySample: 0, punctualityPct: null, punctualitySample: 0 })} />)

    expect(screen.getAllByText('brak danych')).toHaveLength(2)
    expect(screen.getAllByText('żaden dzisiejszy przejazd nie jest jeszcze potwierdzony')).toHaveLength(2)
  })

  it('inflects the Polish noun instead of always writing "pociągów"', () => {
    render(<StationStatsCards stats={stats({ departuresToday: 1, arrivalsToday: 2 })} />)

    expect(screen.getByText('pociąg')).toBeInTheDocument()
    expect(screen.getByText('pociągi')).toBeInTheDocument()
  })

  it('carries a custom punctuality threshold into the caption rather than hard-coding five', () => {
    render(<StationStatsCards stats={stats({ punctualityThresholdMinutes: 15 })} />)

    expect(screen.getByText('dziś, opóźnienie do 15 min')).toBeInTheDocument()
  })

  it('still renders all four cards before any snapshot arrives, so the layout does not jump', () => {
    render(<StationStatsCards stats={undefined} />)

    expect(screen.getByText('Odjazdy dzisiaj')).toBeInTheDocument()
    expect(screen.getByText('Przyjazdy dzisiaj')).toBeInTheDocument()
    expect(screen.getByText('Średnie opóźnienie')).toBeInTheDocument()
    expect(screen.getByText('Punktualność')).toBeInTheDocument()
  })
})
