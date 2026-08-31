'use client'

import { useEffect, useState } from 'react'
import { STATUS_TEXT } from './DelayBadge'
import type { RateLimitBudget } from '@/lib/pkp/client'
import type { PollerDiagnostics as FeedDiagnostics, PollerStatus } from '@/lib/board/poller'

/**
 * Kształt odpowiedzi `/api/health`. Typy `RateLimitBudget` i `PollerStatus`
 * importowane, nie przepisane: to ten sam kontrakt, który wystawia handler,
 * więc przepisany ręcznie milczałby przy rozjeździe zamiast go zgłosić.
 * Import samego TYPU (`import type`) nie wciąga kodu serwerowego do bundla
 * klienta -- znika przy kompilacji.
 */
type Health = {
  dataSource: 'live' | 'mock'
  pollerAwake: boolean
  pollerStatus: PollerStatus
  throttled: boolean
  intervalMs: number
  budget: RateLimitBudget | null
  /** Może zabraknąć, gdy panel odpyta starszą wersję serwera — panel nie ma prawa się na tym wywrócić. */
  feeds?: FeedDiagnostics
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

/**
 * Wiek w formie, którą da się ogarnąć wzrokiem. `null` (nigdy się nie udało)
 * to „—", nie „0 s" — ta sama zasada co w `formatBudget()` wyżej.
 */
function formatAge(iso: string | null, nowMs: number): string {
  if (iso === null) return '—'
  const seconds = Math.max(0, Math.round((nowMs - new Date(iso).getTime()) / 1000))
  if (seconds < 90) return `${seconds} s temu`
  const minutes = Math.round(seconds / 60)
  if (minutes < 90) return `${minutes} min temu`
  return `${Math.round(minutes / 60)} h temu`
}

/** Kolor kropki źródła: zielony gdy ostatnie pobranie się udało, czerwony gdy nie, szary gdy jeszcze nie próbowano. */
function feedColor(ok: boolean | null): string {
  if (ok === null) return 'var(--text-muted)'
  return ok ? STATUS_TEXT.onTime : STATUS_TEXT.cancelled
}

function FeedRow({
  label,
  health,
  nowMs,
  suffix,
}: {
  label: string
  health: { ok: boolean | null; lastSuccessAt: string | null; records: number | null }
  nowMs: number
  suffix?: string
}) {
  const records = health.records === null ? '—' : String(health.records)
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="flex items-center gap-1.5 text-text-muted">
        <span
          className="h-1.5 w-1.5 shrink-0 rounded-full"
          style={{ backgroundColor: feedColor(health.ok) }}
          aria-hidden="true"
        />
        {label}
      </span>
      <span className="font-medium tabular-nums">
        {records}
        {suffix ?? ''} · {formatAge(health.lastSuccessAt, nowMs)}
      </span>
    </div>
  )
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
  const [fetchedAtMs, setFetchedAtMs] = useState(() => Date.now())

  useEffect(() => {
    let cancelled = false

    async function tick(): Promise<void> {
      try {
        const response = await fetch('/api/health')
        if (!response.ok) throw new Error(String(response.status))
        const json = (await response.json()) as Health
        if (!cancelled) {
          setHealth(json)
          // Znacznik odczytu, od którego liczymy wiek każdego źródła.
          setFetchedAtMs(Date.now())
        }
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
  // Chwila ostatniego odczytu, nie żywy zegar: wiek odświeża się co REFRESH_MS
  // razem z danymi, a osobny interwał tylko po to, by przewijać sekundy, byłby
  // renderem bez informacji. Sekcja źródeł renderuje się dopiero, gdy `health`
  // istnieje, więc wartość początkowa i tak nigdy nie trafia na ekran.
  const nowMs = fetchedAtMs
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

      {health?.feeds !== undefined && (
        <div
          className="mt-2 flex flex-col gap-1 border-t pt-2"
          style={{ borderColor: 'var(--sidebar-border)' }}
        >
          <div className="mb-0.5 tracking-[0.1em] text-text-muted uppercase">Źródła PKP</div>
          <FeedRow label="Realizacja" health={health.feeds.operations} nowMs={nowMs} />
          <FeedRow label="Rozkład" health={health.feeds.schedules} nowMs={nowMs} />
          <FeedRow label="Utrudnienia" health={health.feeds.disruptions} nowMs={nowMs} />
          {health.feeds.schedules.usedFullRouteFallback && (
            /* Rozkład przyszedł bez przystanków i klient musiał ponowić bez
               `fullRoute` — tablica traci wtedy kierunek i estymatę. Dotąd ten
               fakt istniał wyłącznie w logu serwera. */
            <Row label="Rozkład" value="tryb awaryjny" color={STATUS_TEXT.delayed} />
          )}
          {health.feeds.dataVersion !== null && (
            /* Pojawia się TYLKO wtedy, gdy feed wyglądał na zamrożony i poller
               dopytał PKP o wersję danych. Wiek liczony od ICH znacznika, więc
               odpowiada na pytanie „czy oni w ogóle publikują". */
            <Row
              label="Dane PKP"
              value={formatAge(health.feeds.dataVersion.timestamp, nowMs)}
              color={STATUS_TEXT.delayed}
            />
          )}
        </div>
      )}
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
