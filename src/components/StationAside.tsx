'use client'

import type { StationInsights } from '@/lib/board/stationStats'
import { AlertCircleIcon, ChevronRightIcon } from './icons'
import { pluralPl } from '@/lib/plural'

/**
 * Prawa kolumna kontekstowa widoku stacji.
 *
 * Trzy moduły, wszystkie zasilane wyłącznie z tego, co poller już policzył
 * (`snapshot.insights`, `snapshot.disruptionMessages`) — **ani jednego
 * dodatkowego zapytania do PKP**. Makieta ma tu jeszcze wyszukiwarkę połączeń
 * A→B; ta świadomie nie wchodzi, bo byłaby realnym zapytaniem do PKP przy
 * każdym szukaniu, poza cyklem i budżetem pollera (AGENTS.md #3).
 *
 * Kolumna nie dubluje tabeli (makieta §C) — daje kontekst, którego w niej nie
 * ma: dokąd stąd najczęściej się jedzie, co jest zepsute i kiedy jest tłok.
 */

function AsideCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="glass rounded-2xl p-4">
      <h3 className="font-heading text-sm font-bold tracking-tight text-foreground">{title}</h3>
      <div className="mt-3">{children}</div>
    </section>
  )
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-text-muted">{children}</p>
}

function PopularDestinations({
  insights,
  loading,
  onSelect,
  selected,
}: {
  insights: StationInsights | undefined
  loading: boolean
  onSelect: (name: string | null) => void
  selected: string | null
}) {
  const destinations = insights?.topDestinations ?? []

  // Trzy różne stany, trzy różne komunikaty (AGENTS.md #7): „jeszcze się
  // ładuje", „nie udało się pobrać" i „pobrano, ale nic tu nie ma".
  if (loading) return <EmptyHint>Wczytywanie rozkładu…</EmptyHint>
  if (insights === undefined || insights.hourlyTraffic === null) {
    return <EmptyHint>Nie udało się pobrać rozkładu, więc nie znamy dzisiejszych kierunków.</EmptyHint>
  }
  if (destinations.length === 0) {
    return <EmptyHint>Z tej stacji nie odjeżdża dziś żaden pociąg dalej w trasę.</EmptyHint>
  }

  return (
    <ul className="flex flex-col gap-1">
      {destinations.map((destination) => {
        const active = selected === destination.name
        return (
          <li key={destination.stationId}>
            <button
              type="button"
              // Klik filtruje tablicę, a nie uruchamia wyszukiwarki -- tej
              // świadomie nie budujemy (patrz nagłówek pliku).
              onClick={() => onSelect(active ? null : destination.name)}
              aria-pressed={active}
              className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition hover:bg-black/5 dark:hover:bg-white/5 ${
                active ? 'bg-black/5 dark:bg-white/10' : ''
              }`}
            >
              {/* Spacja po nazwie jest znakiem treści, nie tylko odstępem:
                  `gap-2` rozsuwa je wizualnie, ale czytnik ekranu przeczytałby
                  „Kraków Główny24 połączenia" jednym ciągiem. */}
              <span className="min-w-0 flex-1 truncate text-foreground">{destination.name} </span>
              <span className="shrink-0 text-xs text-text-muted tabular-nums">
                {destination.count} {pluralPl(destination.count, 'połączenie', 'połączenia', 'połączeń')}
              </span>
              <ChevronRightIcon size={13} />
            </button>
          </li>
        )
      })}
    </ul>
  )
}

function StationDisruptions({ messages }: { messages: string[] }) {
  if (messages.length === 0) {
    return <EmptyHint>Brak zgłoszonych utrudnień dla tej stacji.</EmptyHint>
  }

  return (
    <ul className="flex flex-col gap-2">
      {messages.map((message) => (
        <li key={message} className="flex gap-2 text-xs text-text-secondary">
          <span className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true">
            <AlertCircleIcon size={14} />
          </span>
          <span>{message}</span>
        </li>
      ))}
    </ul>
  )
}

/**
 * Natężenie ruchu w dobie — 24 słupki, jeden na godzinę.
 *
 * Inline SVG, wzorem `DelayForecast.tsx`: zależności projektu to dziś
 * dokładnie `next`, `react`, `react-dom` i `zod`, i tak ma zostać. Biblioteka
 * wykresów dla dwudziestu czterech prostokątów byłaby absurdem.
 */
function HourlyTraffic({ hourly, loading, currentHour }: { hourly: number[] | null; loading: boolean; currentHour: number }) {
  if (loading) return <EmptyHint>Wczytywanie rozkładu…</EmptyHint>
  if (hourly === null) {
    return <EmptyHint>Nie udało się pobrać rozkładu, więc nie znamy rozkładu ruchu w dobie.</EmptyHint>
  }

  const peak = Math.max(...hourly)
  if (peak === 0) {
    return <EmptyHint>Rozkład na dziś nie zawiera odjazdów z tej stacji.</EmptyHint>
  }

  return (
    <div>
      <div className="flex h-16 items-end gap-[2px]" role="img" aria-label={`Odjazdy w ciągu doby, szczyt ${peak} o godzinie ${hourly.indexOf(peak)}`}>
        {hourly.map((count, hour) => (
          <span
            key={hour}
            title={`${String(hour).padStart(2, '0')}:00 — ${count} ${pluralPl(count, 'odjazd', 'odjazdy', 'odjazdów')}`}
            className="flex-1 rounded-sm transition"
            style={{
              // Minimalna wysokość 2px dla godziny z zerem: pusty słupek i
              // brak słupka wyglądałyby identycznie, a to dwie różne rzeczy.
              height: `${Math.max(2, (count / peak) * 100)}%`,
              backgroundColor: hour === currentHour ? 'var(--status-enRoute-bg)' : 'var(--surface-border)',
              opacity: count === 0 ? 0.4 : 1,
            }}
          />
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-text-muted tabular-nums">
        <span>00</span>
        <span>12</span>
        <span>23</span>
      </div>
    </div>
  )
}

type Props = {
  insights: StationInsights | undefined
  disruptionMessages: string[]
  /** Aktualnie wybrany kierunek filtrowania tablicy, `null` = bez filtra. */
  destinationFilter: string | null
  onDestinationFilter: (name: string | null) => void
  /** Snapshotu jeszcze nie ma — „ładuje się" to nie to samo co „nie udało się pobrać". */
  loading: boolean
  /** Godzina warszawska „teraz" — wyróżniony słupek. Podawana z zewnątrz, żeby komponent pozostał czysty. */
  currentHour: number
}

export function StationAside({ insights, disruptionMessages, destinationFilter, onDestinationFilter, loading, currentHour }: Props) {
  return (
    <div className="flex flex-col gap-4 lg:sticky lg:top-6">
      <AsideCard title="Najpopularniejsze kierunki">
        <PopularDestinations insights={insights} loading={loading} onSelect={onDestinationFilter} selected={destinationFilter} />
      </AsideCard>
      <AsideCard title="Utrudnienia na tej stacji">
        <StationDisruptions messages={disruptionMessages} />
      </AsideCard>
      <AsideCard title="Natężenie ruchu dzisiaj">
        <HourlyTraffic hourly={insights?.hourlyTraffic ?? null} loading={loading} currentHour={currentHour} />
      </AsideCard>
    </div>
  )
}
