'use client'

import { useCityStats } from '@/hooks/useCityStats'
import { formatAge, formatSecondsOfDay } from '@/lib/format'
import { getCity } from '@/lib/gtfs/cities'
import type { GtfsMode } from '@/lib/gtfs/types'
import { zonedHour } from '@/lib/pkp/time'
import { pluralPl } from '@/lib/plural'
import { AsideCard, HourlyTraffic } from './aside'
import { MODE_ICON, MODE_LABEL, MODE_ORDER } from './transitMode'

const MODE_ROWS = MODE_ORDER.filter((mode): mode is Exclude<GtfsMode, 'other'> => mode !== 'other').map((mode) => ({
  mode,
  label: MODE_LABEL[mode],
  icon: MODE_ICON[mode],
}))

/**
 * Widżet sieci komunikacji miejskiej wybranego miasta — odpowiednik
 * `NetworkStatsCard` dla kolei. Wszystko z rozkładu: liczba linii per środek,
 * rodzaje autobusów, natężenie ruchu w dobie, pierwszy/ostatni kurs.
 * „W trasie teraz" dochodzi z pozycji pojazdów (etap 5) — „—" dopóki feed
 * nie gotowy (`vehiclesInService === null`), NIGDY 0 (#7).
 */
export function CityTransitWidget({ city, cityName }: { city: string; cityName: string }) {
  const { data, error } = useCityStats(city)
  const loading = data === null || data.state === 'loading'
  const stats = data?.state === 'ready' ? data.stats : null
  // Ta sama reguła co poprzednio (`error !== null && stats === null`), plus
  // domain-level `state: 'failed'` (poller rozkładu zawiódł po stronie
  // serwera -- fetch się udał, więc `error` z hooka zostaje `null`). Gdy
  // `stats` nie jest `null` (ostatni dobry snapshot), zachowujemy go zamiast
  // banera błędu (AGENTS.md #7 -- rosnący wiek danych, nie pusty ekran).
  const failed = stats === null && (data?.state === 'failed' || error !== null)
  // `state: 'ready'` ze `stats: null` = dzisiejsza data kursowania nieznana
  // (Task 2, AGENTS.md #7) -- to nie błąd i nie ładowanie, osobny komunikat.
  const dayUnknown = data?.state === 'ready' && stats === null

  return (
    <div className="flex flex-col gap-4">
      <AsideCard title={`Komunikacja miejska — ${cityName}`}>
        {failed ? (
          <p className="text-xs text-error-text">Nie udało się wczytać statystyk.</p>
        ) : loading || stats === null ? (
          dayUnknown ? (
            <p className="text-xs text-text-muted">Brak rozkładu na dziś.</p>
          ) : (
            <p className="text-xs text-text-muted">Wczytywanie rozkładu…</p>
          )
        ) : (
          <div className="flex flex-col gap-2.5">
            {MODE_ROWS.filter((row) => stats.linesByMode[row.mode] > 0).map((row) => {
              const Icon = row.icon
              const extras =
                row.mode === 'bus'
                  ? [
                      stats.busKinds.night > 0 &&
                        `${stats.busKinds.night} ${pluralPl(stats.busKinds.night, 'nocna', 'nocne', 'nocnych')}`,
                      stats.busKinds.express > 0 &&
                        `${stats.busKinds.express} ${pluralPl(stats.busKinds.express, 'przyspieszona', 'przyspieszone', 'przyspieszonych')}`,
                      stats.busKinds.replacement > 0 &&
                        `${stats.busKinds.replacement} ${pluralPl(stats.busKinds.replacement, 'zastępcza', 'zastępcze', 'zastępczych')}`,
                    ].filter(Boolean)
                  : []
              return (
                <div key={row.mode} className="flex items-baseline justify-between gap-2 text-xs">
                  <span className="flex items-center gap-1.5 text-text-secondary">
                    <Icon size={13} className="text-text-muted" />
                    {row.label}
                  </span>
                  <span className="text-right font-medium tabular-nums text-foreground">
                    {stats.linesByMode[row.mode]} {pluralPl(stats.linesByMode[row.mode], 'linia', 'linie', 'linii')}
                    {extras.length > 0 && <span className="block text-[10px] font-normal text-text-muted">{extras.join(' · ')}</span>}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </AsideCard>

      <AsideCard title="Natężenie ruchu dziś">
        <HourlyTraffic
          hourly={stats?.hourly ?? null}
          loading={loading}
          currentHour={zonedHour(new Date().getTime(), getCity(city)?.timezone ?? 'Europe/Warsaw')}
          emptyLabel="Rozkład na dziś nie zawiera odjazdów."
        />
        {stats !== null && stats.firstDepartureSec !== null && stats.lastDepartureSec !== null && (
          <p className="mt-2 text-xs text-text-muted">
            Pierwszy kurs {formatSecondsOfDay(stats.firstDepartureSec)}, ostatni {formatSecondsOfDay(stats.lastDepartureSec)} ·{' '}
            {stats.tripsToday.toLocaleString('pl-PL')} {pluralPl(stats.tripsToday, 'kurs', 'kursy', 'kursów')} dziś
          </p>
        )}
        {stats !== null &&
          (() => {
            const vs = data?.state === 'ready' ? data.vehiclesInService : undefined
            // Suma trzech WYŚWIETLANYCH środków — inaczej `rail`/`other` w feedzie
            // rozjeżdżają liczbę z rozbiciem obok.
            const total = vs === undefined || vs === null ? null : vs.metro + vs.tram + vs.bus
            return (
              <p className="mt-2 text-xs text-text-muted">
                W trasie teraz:{' '}
                {total === null ? (
                  <span>—</span>
                ) : (
                  <>
                    <span className="font-semibold text-foreground tabular-nums">{total.toLocaleString('pl-PL')}</span>
                    {vs !== null && vs !== undefined && (
                      <span>
                        {' '}
                        · {vs.metro} metro · {vs.tram} tram · {vs.bus} autobus
                      </span>
                    )}
                  </>
                )}
              </p>
            )
          })()}
      </AsideCard>

      <AsideCard title="Utrudnienia">
        {(() => {
          const alerts = data?.state === 'ready' ? (data.alerts ?? null) : null
          if (alerts === null) {
            if (data?.alertFeed?.state === 'failed') {
              return <p className="text-xs text-error-text">Nie udało się pobrać utrudnień.</p>
            }
            return <p className="text-xs text-text-muted">Wczytywanie…</p>
          }
          // Feed `failed` po udanym pobraniu: ostatnie dobre alerty + ich wiek (#7).
          const feed = data?.alertFeed
          const staleNote = feed?.state === 'failed' && feed.ageMs !== null && (
            <p className="text-xs text-text-muted">Nie udało się odświeżyć — dane sprzed {formatAge(feed.ageMs)}</p>
          )
          if (alerts.length === 0) {
            return (
              <>
                <p className="text-xs text-text-muted">Brak aktywnych utrudnień.</p>
                {staleNote}
              </>
            )
          }
          return (
            <div className="flex flex-col gap-1.5">
              <p className="text-xs font-semibold text-foreground">
                {alerts.length} {pluralPl(alerts.length, 'aktywne utrudnienie', 'aktywne utrudnienia', 'aktywnych utrudnień')}
              </p>
              {staleNote}
              <ul className="flex flex-col gap-1 text-xs text-text-secondary">
                {alerts.map((a) => (
                  <li key={a.id}>{a.title}</li>
                ))}
              </ul>
            </div>
          )
        })()}
      </AsideCard>
    </div>
  )
}
