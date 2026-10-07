import type { StationStats } from '@/lib/board/stationStats'
import { ArrivalIcon, DepartureIcon, HourglassIcon, TargetIcon, ICON_SIZE } from './icons'
import { pluralPl } from '@/lib/plural'
import { useInSheet } from './BottomSheet'
import { StatTile } from './StatTile'

/**
 * Cztery kafelki KPI nad tablicą.
 *
 * Każda liczba tu jest **naszym** wskaźnikiem policzonym z danych operacyjnych
 * PKP, nie oficjalną statystyką przewoźnika — makieta §4 wprost przed tym
 * przestrzega. Stąd `hint` pod każdą wartością: mówi wprost, z czego liczba
 * powstała („z potwierdzonych dziś przejazdów", „próg 5 min"), zamiast
 * zostawiać ją do interpretacji.
 *
 * `null` w danych to zawsze „brak danych", nigdy „0" — patrz `stationStats.ts`.
 * Kafelek „0 pociągów" przy zepsutym pobraniu rozkładu byłby kłamstwem, i to
 * dokładnie tym rodzajem, przed którym stoi AGENTS.md #7.
 */

const NO_DATA = 'brak danych'
const LOADING = '—'

/**
 * Trzy różne stany, trzy różne komunikaty — nigdy jeden udający drugi:
 * „jeszcze się ładuje", „nie udało się pobrać" i konkretna liczba. Zlanie
 * pierwszych dwóch w jeden komunikat to dokładnie ten błąd, przed którym
 * ostrzega AGENTS.md #7 („brak wyników" ≠ „nie udało się sprawdzić").
 */
function countValue(count: number | null, loading: boolean): { value: string; unit?: string; hint: string; hideUnitInPill?: boolean } {
  if (loading) return { value: LOADING, hint: 'wczytywanie rozkładu…' }
  if (count === null) return { value: NO_DATA, hint: 'nie udało się pobrać rozkładu' }
  // „2 pociągów" jest po polsku błędne -- odmiana idzie przez wspólny `pluralPl`.
  return { value: String(count), unit: pluralPl(count, 'pociąg', 'pociągi', 'pociągów'), hint: 'wg rozkładu na dziś', hideUnitInPill: true }
}

/** Podpis dla wskaźnika liczonego z realizacji — patrz `countValue` co do trzech stanów. */
function realizationHint(loading: boolean, sample: number, ready: string): string {
  if (loading) return 'wczytywanie danych…'
  if (sample === 0) return 'żaden dzisiejszy przejazd nie jest jeszcze potwierdzony'
  return ready
}

export function StationStatsCards({ stats, loading = false }: { stats: StationStats | undefined; loading?: boolean }) {
  // Nad tablicą na telefonie pigułki (pierwszy odjazd ma być widoczny bez przewijania); w arkuszu „Info” kafelki.
  const pills = !useInSheet()
  // Snapshotu jeszcze nie ma (zimny start pollera) -- kafelki i tak muszą
  // zająć swoje miejsce w kompozycji, żeby układ nie skakał, gdy dane dojdą.
  const safe: StationStats = stats ?? {
    departuresToday: null,
    arrivalsToday: null,
    averageDelayMinutes: null,
    averageDelaySample: 0,
    punctualityPct: null,
    punctualitySample: 0,
    punctualityThresholdMinutes: 5,
  }

  const departures = countValue(safe.departuresToday, loading)
  const arrivals = countValue(safe.arrivalsToday, loading)

  return (
    // Kolumny od szerokości KONTENERA, nie okna: w FullBoard przy oknie 1280 px kafelki mają
    // ~565 px, a `xl:grid-cols-4` ściskało je do 143 px („Punktualność” ucięta). 1 → 2 → 4,
    // nigdy 3 (auto-fill dałby sierotę 3+1).
    <div className="@container" data-testid="station-stats" data-variant={pills ? 'pills' : 'tiles'}>
      <div className={`grid grid-cols-1 gap-3 @md:grid-cols-2 @5xl:grid-cols-4 ${pills ? 'max-sm:flex max-sm:flex-wrap max-sm:gap-1.5' : ''}`}>
        <StatTile
          pills={pills}
          icon={<DepartureIcon size={ICON_SIZE.tile} />}
          accent="var(--status-notStarted-bg)"
          label="Odjazdy dzisiaj"
          {...departures}
        />
        <StatTile
          pills={pills}
          icon={<ArrivalIcon size={ICON_SIZE.tile} />}
          accent="var(--status-onTime-bg)"
          label="Przyjazdy dzisiaj"
          {...arrivals}
        />
        <StatTile
          pills={pills}
          icon={<HourglassIcon size={ICON_SIZE.tile} />}
          accent="var(--status-delayed-bg)"
          label="Średnie opóźnienie"
          value={loading ? LOADING : safe.averageDelayMinutes === null ? NO_DATA : `+${safe.averageDelayMinutes}`}
          unit={loading || safe.averageDelayMinutes === null ? undefined : 'min'}
          hint={realizationHint(loading, safe.averageDelaySample, `z ${safe.averageDelaySample} potwierdzonych dziś przejazdów`)}
        />
        <StatTile
          pills={pills}
          icon={<TargetIcon size={ICON_SIZE.tile} />}
          accent="var(--status-enRoute-bg)"
          label="Punktualność"
          value={loading ? LOADING : safe.punctualityPct === null ? NO_DATA : `${safe.punctualityPct}%`}
          hint={realizationHint(loading, safe.punctualitySample, `dziś, opóźnienie do ${safe.punctualityThresholdMinutes} min`)}
        />
      </div>
    </div>
  )
}
