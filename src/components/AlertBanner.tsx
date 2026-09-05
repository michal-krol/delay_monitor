import { AlertCircleIcon } from './icons'
import type { AlertRecord } from '@/lib/gtfs/alerts'

/**
 * Jeden styl dla wszystkich `effect` (decyzja usera, spec §1/§9) — bursztyn,
 * konwencja z `NetworkStatsCard.tsx` (`text-amber-600 dark:text-amber-400`).
 * `body` renderowany jako plain text (`htmlbody` nigdy nie dotarł do
 * `AlertRecord` — patrz `alerts.ts`), `link` jako zwykłe `<a href>`.
 */
export function AlertBanner({ alerts }: { alerts: AlertRecord[] }) {
  if (alerts.length === 0) return null
  return (
    <div className="flex flex-col gap-2">
      {alerts.map((alert) => (
        <div
          key={alert.id}
          className="flex gap-2 rounded-lg border border-amber-300/60 bg-amber-50 p-3 text-sm dark:border-amber-800/60 dark:bg-amber-950/40"
        >
          <AlertCircleIcon size={16} className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
          <div className="flex flex-col gap-1">
            <p className="font-medium text-foreground">{alert.title}</p>
            <p className="whitespace-pre-line text-text-secondary">{alert.body}</p>
            {alert.link !== '' && (
              <a
                href={alert.link}
                target="_blank"
                rel="noreferrer"
                className="text-xs font-medium text-amber-700 underline dark:text-amber-400"
              >
                Szczegóły na wtp.waw.pl
              </a>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
