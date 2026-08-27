'use client'

import { useEffect, useState } from 'react'
import { STATUS_TEXT } from './DelayBadge'

type PollerStatus = 'ok' | 'configError' | 'degraded'

type Budget = {
  hourly: number | null
  daily: number | null
  hourlyLimit: number | null
  dailyLimit: number | null
}

type Health = {
  dataSource: 'live' | 'mock'
  pollerAwake: boolean
  pollerStatus: PollerStatus
  throttled: boolean
  intervalMs: number
  budget: Budget | null
}

/** `/api/health` czyta tylko pamięć procesu — odpytywanie go nie kosztuje ani jednego zapytania do PKP (AGENTS.md #3). */
const REFRESH_MS = 15_000

/**
 * Paleta statusu pollera to ta sama paleta co statusy pociągu — świadome
 * użycie istniejących tokenów zamiast trzeciego zestawu kolorów w aplikacji.
 * Mapowanie jest jawne, bo to dwa różne pojęcia, które tylko dzielą kolory.
 */
const STATUS_COLOR: Record<PollerStatus, string> = {
  ok: STATUS_TEXT.onTime,
  degraded: STATUS_TEXT.delayed,
  configError: STATUS_TEXT.cancelled,
}

/**
 * `null` to „nie wiadomo" (PKP nie odesłało nagłówka albo poller nie zrobił
 * jeszcze pierwszego przebiegu), nigdy „zero" — AGENTS.md #3. Potraktowanie
 * jednego jak drugiego raz już zepchnęło poller na stały interwał awaryjny,
 * więc panel, który ma to diagnozować, tym bardziej nie może tego mylić.
 */
function formatBudget(remaining: number | null, limit: number | null): string {
  if (remaining === null) return '—'
  if (limit === null) return String(remaining)
  return `${remaining} / ${limit}`
}

function Row({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-text-muted">{label}</span>
      <span className="font-medium tabular-nums" style={color === undefined ? undefined : { color }}>
        {value}
      </span>
    </div>
  )
}

function Panel() {
  const [health, setHealth] = useState<Health | null>(null)

  useEffect(() => {
    let cancelled = false

    async function tick(): Promise<void> {
      try {
        const response = await fetch('/api/health')
        if (!response.ok) throw new Error(String(response.status))
        const json = (await response.json()) as Health
        if (!cancelled) setHealth(json)
      } catch {
        // Panel deweloperski nie ma prawa wywrócić paska bocznego — przy
        // awarii zostaje ostatni znany stan (albo brak wartości), bez alarmu.
      }
    }

    void tick()
    const timer = setInterval(() => void tick(), REFRESH_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [])

  const budget = health?.budget ?? null
  const pace =
    health === null
      ? '—'
      : `co ${Math.round(health.intervalMs / 1000)} s${health.throttled ? ' (zdławiony)' : ''}`

  return (
    <div className="mt-auto rounded-xl border p-3 text-[11px]" style={{ borderColor: 'var(--sidebar-border)' }}>
      <div className="mb-2 flex items-center gap-1.5 tracking-[0.1em] text-text-muted uppercase">
        <span
          className="h-1.5 w-1.5 rounded-full"
          style={{ backgroundColor: health === null ? 'var(--text-muted)' : STATUS_COLOR[health.pollerStatus] }}
          aria-hidden="true"
        />
        Diagnostyka
      </div>
      <div className="flex flex-col gap-1">
        <Row label="Źródło" value={health?.dataSource ?? '—'} />
        <Row
          label="Poller"
          value={health === null ? '—' : health.pollerAwake ? 'czuwa' : 'śpi'}
          color={health === null ? undefined : STATUS_COLOR[health.pollerStatus]}
        />
        <Row label="Stan" value={health?.pollerStatus ?? '—'} />
        <Row label="Tempo" value={pace} />
        <Row label="Limit / h" value={formatBudget(budget?.hourly ?? null, budget?.hourlyLimit ?? null)} />
        <Row label="Limit / doba" value={formatBudget(budget?.daily ?? null, budget?.dailyLimit ?? null)} />
      </div>
    </div>
  )
}

/**
 * Stan pollera i zużycie limitu PKP w pasku bocznym — **wyłącznie na
 * środowiskach deweloperskich**.
 *
 * Bramka jest allowlistą wyliczaną w czasie builda (`next.config.ts`), nie
 * denylistą typu „wszystko poza gałęzią main": `detectGitBranch()` ma trzy
 * poziomy zapasowe i na Railway potrafi zwrócić `"production"` zamiast
 * nazwy gałęzi, więc denylista pokazałaby panel dokładnie tam, gdzie nie
 * wolno. Nieznana albo pusta wartość znaczy „produkcja" i panel nie istnieje.
 *
 * Porównanie do literału jest celowe: `process.env.NEXT_PUBLIC_*` jest
 * wstawiane w build jako stała, więc w buildzie produkcyjnym cały `<Panel />`
 * wypada z bundla, zamiast tylko się nie renderować.
 *
 * Bramka nie ma własnych hooków, a `Panel` odmontowuje się razem ze zwinięciem
 * paska — dzięki temu „nie widać" znaczy też „nie odpytuje".
 */
export function PollerDiagnostics({ collapsed }: { collapsed: boolean }) {
  if (process.env.NEXT_PUBLIC_SHOW_DIAGNOSTICS !== 'true') return null
  if (collapsed) return null
  return <Panel />
}
