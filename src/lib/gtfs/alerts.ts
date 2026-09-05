import { z } from 'zod'

/**
 * Kształt `alerts.json` (mkuran) — brak publicznego schematu, zweryfikowany
 * ręcznie 2026-09-05: { time, alerts: [{ id, routes, effect, link, title,
 * body, htmlbody }] }. `routes` to `route_short_name` (numery linii) — feed
 * NIE zna przystanków. `htmlbody` (obcy HTML) świadomie odrzucany w
 * transformie: nigdy nie trafia do `AlertRecord`, zero pola opóźnienia.
 */
export type AlertRecord = {
  id: string
  routes: string[]
  effect: string
  link: string
  title: string
  body: string
}

const alertSchema = z
  .object({
    id: z.string().min(1),
    routes: z.array(z.string()).optional(),
    effect: z.string().optional(),
    link: z.string().optional(),
    title: z.string().optional(),
    body: z.string().optional(),
  })
  .transform((r) => ({
    id: r.id,
    routes: r.routes ?? [],
    effect: r.effect ?? 'UNKNOWN_EFFECT',
    link: r.link ?? '',
    title: r.title ?? '',
    body: r.body ?? '',
  }))

const feedSchema = z.object({ time: z.string().optional(), alerts: z.array(z.unknown()) })

export function parseAlertFeed(json: unknown): {
  alerts: AlertRecord[]
  droppedAlerts: number
  feedTime: string | null
} {
  const feed = feedSchema.safeParse(json)
  if (!feed.success) return { alerts: [], droppedAlerts: 0, feedTime: null }

  const alerts: AlertRecord[] = []
  let droppedAlerts = 0
  for (const raw of feed.data.alerts) {
    const parsed = alertSchema.safeParse(raw)
    if (parsed.success) alerts.push(parsed.data)
    else droppedAlerts += 1
  }
  return { alerts, droppedAlerts, feedTime: feed.data.time ?? null }
}
