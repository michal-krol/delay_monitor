'use client'

import { AlertBody, AlertSourceLink, safeAlertLink } from './AlertBanner'
import { AlertCircleIcon, DisclosureIcon, ICON_SIZE, MapIcon } from './icons'
import type { AlertRecord } from '@/lib/gtfs/alerts'
import { dedupeAlerts } from '@/lib/gtfs/alertView'

type Props = {
  /** `null` = lista nieznana (jeszcze nie wczytana albo awaria bez ostatnich danych) — nigdy „pusto" (#7). */
  alerts: AlertRecord[] | null
  state: 'loading' | 'ready' | 'failed'
  /** Zakres, którego dotyczą komunikaty, np. „Komunikaty linii obsługujących ten przystanek". */
  scopeLabel: string
  /** `failed`, ale ostatni dobry wynik istnieje (`alertView.toContextAlertsState`). */
  stale?: boolean
  /** Podane = konsument potrafi rozstrzygnąć linię w mieście; brak = brak przycisku „Na mapie". */
  onShowMap?: (alert: AlertRecord) => void
}

const EMPTY = 'Brak komunikatów dla tego kontekstu'

/** Pierwszy akapit treści jako skrót (nie ucięte „losowe 100 znaków"). */
function firstParagraph(body: string): string {
  return body.split(/\n\s*\n/)[0].trim()
}

/**
 * Komunikaty w kontekście przystanku / linii (`10-context-alerts.md`). Bez dat „od–do" (feed ich nie ma),
 * bez ikon ani kolorów wg `effect`, bez trybu: numery linii to zwykłe pastylki — kolor i ikonę trybu
 * dokłada konsument. Stan otwarcia kart żyje w DOM (`<details>` niekontrolowane, klucz = `id`),
 * więc odświeżenie listy ani motyw nie zwijają otwartej karty.
 */
export function ContextAlerts({ alerts, state, scopeLabel, stale = false, onShowMap }: Props) {
  const list = alerts === null ? null : dedupeAlerts(alerts)
  const loading = state === 'loading' || (state === 'ready' && list === null)
  const failedWithoutData = state === 'failed' && (list === null || (list.length === 0 && !stale))
  const staleWarning = state === 'failed' && !failedWithoutData

  return (
    <section className="flex min-w-0 flex-col gap-2">
      <h3 className="flex min-w-0 items-center gap-2 text-sm font-semibold text-foreground">
        <AlertCircleIcon size={ICON_SIZE.button} className="shrink-0 text-warning-text" />
        <span className="min-w-0 [overflow-wrap:anywhere]">{scopeLabel}</span>
      </h3>
      {loading && (
        <p role="status" className="text-sm text-text-secondary">
          Wczytywanie komunikatów…
        </p>
      )}
      {failedWithoutData && <p role="status" className="text-sm text-text-secondary">Nie udało się wczytać komunikatów</p>}
      {staleWarning && <p role="status" className="text-sm font-medium text-warning-text">Nie udało się odświeżyć. Pokazujemy ostatnie dane</p>}
      {list !== null && !loading && !failedWithoutData && list.length === 0 && <p className="text-sm text-text-secondary">{EMPTY}</p>}
      {list !== null && !loading && !failedWithoutData && list.length > 0 && (
        <ul className="flex min-w-0 flex-col gap-2">
          {list.map((alert) => (
            <AlertCard key={alert.id} alert={alert} onShowMap={onShowMap} />
          ))}
        </ul>
      )}
    </section>
  )
}

function AlertCard({ alert, onShowMap }: { alert: AlertRecord; onShowMap?: (alert: AlertRecord) => void }) {
  const preview = firstParagraph(alert.body)
  const link = safeAlertLink(alert.link)
  return (
    <li className="min-w-0 rounded-lg border border-surface-border bg-surface text-sm has-[details[open]]:border-primary has-[details[open]]:bg-[color-mix(in_srgb,var(--primary-soft),var(--surface))]">
      <details className="group">
        <summary className="flex min-h-11 w-full cursor-pointer list-none flex-wrap items-start gap-x-2 gap-y-1 p-3 [&::-webkit-details-marker]:hidden">
          <span className="min-w-[10rem] flex-1">
            {alert.routes.length > 0 && (
              <span className="mb-1 flex flex-wrap gap-1">
                {[...new Set(alert.routes)].map((route) => (
                  <span key={route} className="rounded border border-surface-border bg-surface-strong px-1.5 text-xs font-semibold text-foreground">
                    {route}
                  </span>
                ))}
              </span>
            )}
            <span className="block font-medium text-foreground [overflow-wrap:anywhere]">{alert.title || 'Utrudnienie'}</span>
            {preview !== '' && (
              <span aria-hidden="true" className="mt-1 line-clamp-3 block whitespace-pre-line text-text-secondary [overflow-wrap:anywhere] group-open:hidden">{preview}</span>
            )}
          </span>
          <span className="inline-flex shrink-0 items-center gap-0.5 pt-0.5 text-xs font-medium text-primary-text">
            <span className="group-open:hidden">Rozwiń komunikat</span>
            <span className="hidden group-open:inline">Zwiń komunikat</span>
            <DisclosureIcon size={ICON_SIZE.chip} />
          </span>
        </summary>
        <div className="alert-body-enter">
          {alert.body !== '' && <AlertBody body={alert.body} bounded={false} />}
          {link !== '' && (
            <AlertSourceLink
              href={link}
              label="Źródło komunikatu"
              className="mx-3 mb-2 inline-flex min-h-11 items-center text-sm font-medium text-primary-text underline"
            />
          )}
        </div>
      </details>
      {onShowMap !== undefined && (
        <button
          type="button"
          onClick={() => onShowMap(alert)}
          className="control-44 mx-3 mb-3 inline-flex items-center gap-1.5 rounded-lg border border-surface-border px-3 text-sm font-medium text-primary-text"
        >
          <MapIcon size={ICON_SIZE.inline} />
          Na mapie
        </button>
      )}
    </li>
  )
}
