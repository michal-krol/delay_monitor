import { formatSecondsOfDay } from '@/lib/format'
import type { LineDetail } from '@/lib/gtfs/query'
import type { LineVehiclesState } from '@/hooks/useLineVehicles'
import { pluralPl } from '@/lib/plural'
import { MODE_LABEL } from './transitMode'
import { CourseVehicleActions } from './CourseVehicleActions'

/** Both directions share the page's existing GPS data; this panel never fetches. */
export function LineStatistics({ line, vehicles, city }: { line: LineDetail; vehicles: Record<number, LineVehiclesState>; city?: string }) {
  return (
    <section aria-label="Statystyki linii" className="glass rounded-2xl p-4">
      <h2 className="text-sm font-bold text-foreground">Linia {line.line}</h2>
      <p className="mt-1 text-sm text-text-secondary">{MODE_LABEL[line.mode]} · Kierunki: {line.directions.length}</p>
      <div className="mt-4 flex flex-col gap-5 text-sm">
        {line.directions.map((direction) => {
          const live = vehicles[direction.directionId]
          const count = direction.stops.length
          const onRequest = direction.stops.filter((stop) => stop.onRequest).length
          const known = live !== undefined && live.feed.state === 'ready' && live.error === null
          const times = direction.departures[0]?.times
          return (
            <section key={direction.directionId} className="min-w-0">
              <h3 className="font-semibold text-foreground [overflow-wrap:anywhere]">{direction.headsign?.trim() || direction.stops.at(-1)?.name || 'Kierunek nieznany'}</h3>
              <p className="mt-1 text-text-secondary">{count} {pluralPl(count, 'przystanek', 'przystanki', 'przystanków')} · {onRequest} na żądanie</p>
              {times !== undefined && times.length > 0 && <p className="mt-1 text-text-secondary tabular-nums">Pierwszy / ostatni: {formatSecondsOfDay(times[0])}–{formatSecondsOfDay(times.at(-1)!)}</p>}
              <h4 className="mt-3 font-medium text-foreground">Pojazdy w trasie{known || live && live.vehicles.length > 0 ? `: ${live?.vehicles.length}` : ''}</h4>
              {live === undefined ? <p className="text-text-secondary">Brak danych o pozycjach pojazdów</p> : live.vehicles.length > 0 ? (
                <>
                  {(live.error !== null || live.feed.state === 'failed') && <p className="text-warning-text">Nie udało się odświeżyć pozycji. Pokazujemy ostatnie dane.</p>}
                  <ul className="mt-1 divide-y divide-surface-border">
                    {live.vehicles.slice().sort((a, b) => (a.afterStopOrder ?? Infinity) - (b.afterStopOrder ?? Infinity)).map((vehicle) => {
                      return <li key={`${vehicle.sideNumber}:${vehicle.tripId}`} className="flex flex-wrap justify-between gap-x-3 gap-y-0.5 py-1.5">
                        <span className="flex flex-wrap items-center gap-x-2 font-medium tabular-nums text-foreground">#{vehicle.sideNumber}{city !== undefined && <CourseVehicleActions city={city} vehicle={vehicle} />}</span>

                      </li>
                    })}
                  </ul>
                </>
              ) : live.error !== null || live.feed.state === 'failed' ? <p className="text-error-text">Nie udało się pobrać pozycji.</p>
                : live.feed.state === 'loading' ? <p className="text-text-secondary">Wczytywanie pozycji…</p>
                  : known ? <p className="text-text-secondary">Brak pojazdów w tym kierunku.</p>
                    : <p className="text-text-secondary">Brak danych o pozycjach pojazdów</p>}
            </section>
          )
        })}
      </div>
    </section>
  )
}
