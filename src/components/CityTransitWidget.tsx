'use client'

import { useCityStats } from '@/hooks/useCityStats'
import type { GtfsMode } from '@/lib/gtfs/types'
import { pluralPl } from '@/lib/plural'
import { AsideCard, HourlyTraffic } from './aside'
import { BusIcon, MetroIcon, TrainIcon, TramIcon } from './icons'

const MODE_ROWS: { mode: GtfsMode; label: string; icon: typeof BusIcon }[] = [
  { mode: 'metro', label: 'metro', icon: MetroIcon },
  { mode: 'tram', label: 'tramwaj', icon: TramIcon },
  { mode: 'bus', label: 'autobus', icon: BusIcon },
  { mode: 'rail', label: 'kolej strefowa', icon: TrainIcon },
]

/** `sec` może przekroczyć 86400 (kurs po północy) — zwijamy do zegara doby. */
function clock(sec: number): string {
  return `${String(Math.floor(sec / 3600) % 24).padStart(2, '0')}:${String(Math.floor(sec / 60) % 60).padStart(2, '0')}`
}

/**
 * Widżet sieci komunikacji miejskiej wybranego miasta — odpowiednik
 * `NetworkStatsCard` dla kolei. Wszystko z rozkładu: liczba linii per środek,
 * rodzaje autobusów, natężenie ruchu w dobie, pierwszy/ostatni kurs.
 * BEZ „w trasie teraz" — to dochodzi z pozycjami pojazdów w etapie 5.
 */
export function CityTransitWidget({ city, cityName }: { city: string; cityName: string }) {
  const { data, error } = useCityStats(city)
  const loading = data === null || data.state === 'loading'
  const stats = data?.state === 'ready' ? data.stats : null

  return (
    <div className="flex flex-col gap-4">
      <AsideCard title={`Komunikacja miejska — ${cityName}`}>
        {error !== null && stats === null ? (
          <p className="text-xs text-red-600 dark:text-red-400">Nie udało się wczytać statystyk.</p>
        ) : loading || stats === null ? (
          <p className="text-xs text-text-muted">Wczytuję rozkład…</p>
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
          currentHour={new Date().getHours()}
          emptyLabel="Rozkład na dziś nie zawiera odjazdów."
        />
        {stats !== null && stats.firstDepartureSec !== null && stats.lastDepartureSec !== null && (
          <p className="mt-2 text-xs text-text-muted">
            Pierwszy kurs {clock(stats.firstDepartureSec)}, ostatni {clock(stats.lastDepartureSec)} ·{' '}
            {stats.tripsToday.toLocaleString('pl-PL')} {pluralPl(stats.tripsToday, 'kurs', 'kursy', 'kursów')} dziś
          </p>
        )}
      </AsideCard>
    </div>
  )
}
