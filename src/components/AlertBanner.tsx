'use client'

import { AlertCircleIcon } from './icons'
import { useScrollableFocus } from '@/hooks/useScrollableFocus'
import type { AlertRecord } from '@/lib/gtfs/alerts'

const DATE_IN_TEXT = /\b(\d{1,2})\.(\d{1,2})\.(\d{4})\b/g

/**
 * Daty wspomniane w treści komunikatu jako „27.09.2026" albo zakres
 * „21.09.2026 – 28.09.2026". Feed (`alerts.json`) NIE ma pól z datami —
 * jedyne źródło to tekst, więc to podpowiedź „wg treści", nie okres ważności.
 * `null` = w treści nie ma żadnej daty.
 */
export function alertDateRange(body: string): string | null {
  const days = new Map<string, string>()
  for (const [, d, m, y] of body.matchAll(DATE_IN_TEXT)) {
    const key = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
    days.set(key, `${d.padStart(2, '0')}.${m.padStart(2, '0')}.${y}`)
  }
  if (days.size === 0) return null
  const sorted = [...days.keys()].sort()
  const first = days.get(sorted[0])!
  const last = days.get(sorted[sorted.length - 1])!
  return first === last ? first : `${first} – ${last}`
}

/**
 * Jeden styl dla wszystkich `effect` (decyzja usera, spec §1/§9) — bursztyn,
 * tekst i ikona w tokenie `text-warning-text` (jak `NetworkStatsCard.tsx`).
 * `body` renderowany jako plain text (`htmlbody` nigdy nie dotarł do
 * `AlertRecord` — patrz `alerts.ts`), `link` jako zwykłe `<a href>`.
 *
 * Komunikat jest domyślnie ZWINIĘTY do nagłówka i dat z treści — treści WTP
 * mają po kilka–kilkadziesiąt KB (listy linii, trasy objazdów) i zalewały
 * kartę. Natywne `<details>`: rozwijanie z klawiatury i stan dla czytnika
 * ekranu za darmo. Link do źródła zostaje widoczny także w formie zwiniętej.
 */
/** Długi komunikat przewija się w `max-h-80`; fokusowalny z klawiatury tylko wtedy, gdy faktycznie się przewija. */
function AlertBody({ body }: { body: string }) {
  const [ref, tabIndex] = useScrollableFocus<HTMLParagraphElement>()
  return (
    <p
      ref={ref}
      tabIndex={tabIndex}
      className="mx-3 mb-2 max-h-80 overflow-y-auto whitespace-pre-line pl-6 text-text-secondary [overflow-wrap:anywhere]"
    >
      {body}
    </p>
  )
}

export function AlertBanner({ alerts }: { alerts: AlertRecord[] }) {
  if (alerts.length === 0) return null
  return (
    <div className="flex min-w-0 flex-col gap-2">
      {alerts.map((alert) => {
        // `alerts.ts` już ucina schemat do `https://` przy granicy Zod — ten
        // sam sprawdzian tutaj to obrona w głębi (jak `LineBadge` z
        // `route_color`), na wypadek gdyby `AlertRecord` trafił do banera
        // z innej ścieżki niż `parseAlertFeed`.
        const safeLink = alert.link.startsWith('https://') ? alert.link : ''
        const dates = alertDateRange(alert.body)
        return (
          <div
            key={alert.id}
            className="min-w-0 rounded-lg border border-amber-300/60 bg-amber-50 text-sm dark:border-amber-800/60 dark:bg-amber-950/40"
          >
            <details className="group">
              <summary className="flex min-h-11 cursor-pointer list-none items-start gap-2 p-3 [&::-webkit-details-marker]:hidden">
                <AlertCircleIcon size={16} className="mt-0.5 shrink-0 text-warning-text" />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-foreground [overflow-wrap:anywhere]">{alert.title || 'Utrudnienie'}</span>
                  {dates !== null && <span className="mt-0.5 block text-xs text-text-muted">Daty w komunikacie: {dates}</span>}
                </span>
                <span className="shrink-0 text-xs font-medium text-warning-text">
                  <span className="group-open:hidden">Rozwiń</span>
                  <span className="hidden group-open:inline">Zwiń</span>
                </span>
              </summary>
              {alert.body !== '' && <AlertBody body={alert.body} />}
            </details>
            {safeLink !== '' && (
              <a
                href={safeLink}
                target="_blank"
                rel="noreferrer"
                className="mb-3 ml-9 inline-block text-xs font-medium text-warning-text underline"
              >
                Szczegóły na wtp.waw.pl
              </a>
            )}
          </div>
        )
      })}
    </div>
  )
}
