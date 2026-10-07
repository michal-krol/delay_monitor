'use client'

import type { ReactNode } from 'react'
import { useScrollableFocus } from '@/hooks/useScrollableFocus'
import { pluralPl } from '@/lib/plural'
import { NavTransition } from './NavTransition'

/**
 * Prawa kolumna kontekstowa — pozycjonowanie wspólne dla czterech ekranów
 * (pulpit, miasto, linie, linia). Dzieci to karty. Od `xl` to kolumna po
 * prawej (szerokość `w-aside`, przyklejona, własne przewijanie); poniżej `xl`
 * karty lądują pod treścią głównej kolumny, na pełną szerokość i z tym samym
 * odstępem od krawędzi co `main` — nic nie znika na węższych ekranach (#7).
 * Zakłada, że rodzic to kontener `flex` (kolumna → wiersz od `xl`); daje go
 * `PageShell`, przez który zwykle się z niej korzysta — patrz tam.
 */
export function PageAside({ children }: { children: ReactNode }) {
  // Od `xl` `max-h-dvh overflow-y-auto` czyni z kolumny region przewijalny; fokusowalny
  // tylko wtedy, gdy karty faktycznie przekraczają wysokość ekranu (`useScrollableFocus`).
  const [scrollRef, tabIndex] = useScrollableFocus<HTMLElement>()
  return (
    <aside
      ref={scrollRef}
      tabIndex={tabIndex}
      aria-label="Panel kontekstowy"
      className="flex flex-col gap-4 px-4 pb-5 sm:px-8 sm:pb-7 xl:sticky xl:top-0 xl:w-aside xl:shrink-0 xl:self-start xl:max-h-dvh xl:overflow-y-auto xl:px-0 xl:py-7 xl:pr-8"
    >
      {children}
    </aside>
  )
}

/**
 * Rama treści wspólna dla wszystkich stron `(app)` (dawniej N kopii tego
 * samego `<main className="…">` w każdej stronie, z rozjeżdżającymi się
 * detalami — patrz docs/superpowers/specs/2026-09-13-nav-ux-recommendations.md
 * §B1). `aside` pominięte = strona bez trzeciej kolumny — świadoma decyzja
 * wywołującego, nie awaria: `FullBoard`/`ConnectionDetails`/`TransitStopDetail`
 * mają WŁASNĄ, wewnętrzną siatkę main+aside (bo muszą działać też osadzone
 * w liście, gdzie ta zewnętrzna kolumna jest już zajęta czymś innym), więc ich
 * strony celowo nie dublują drugiej.
 */
export function PageShell({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    // `NavTransition` MUSI być zewnętrznym elementem strony: zagnieżdżony wewnątrz węzła DOM, który sam się
    // wstawia/usuwa, nie dostaje wejścia/wyjścia (potwierdzone w przeglądarce). Dlatego owija cały korzeń.
    <NavTransition>
      {/* Kolumna na węższych ekranach (aside pod treścią), wiersz od `xl`. */}
      <div className="flex min-w-0 flex-1 flex-col xl:flex-row">
        <main className="flex min-w-0 flex-1 flex-col gap-5 px-4 py-5 sm:px-8 sm:py-7">{children}</main>
        {aside !== undefined && <PageAside>{aside}</PageAside>}
      </div>
    </NavTransition>
  )
}

/** Karta prawej kolumny kontekstowej — wspólna dla widoku stacji i przystanku. */
export function AsideCard({ title, children, className = '' }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={`glass rounded-2xl p-4 ${className}`.trim()}>
      <h3 className="font-heading text-sm font-bold tracking-tight text-foreground">{title}</h3>
      <div className="mt-3">{children}</div>
    </section>
  )
}

export function EmptyHint({ children }: { children: ReactNode }) {
  return <p className="text-xs text-text-muted">{children}</p>
}

/**
 * Słupkowy wykres odjazdów w ciągu doby (24 kubełki). `null` = nie znamy
 * rozkładu; sam zerowy szczyt = rozkład bez odjazdów. Godzina bieżąca podświetlona.
 */
export function HourlyTraffic({
  hourly,
  loading,
  currentHour,
  emptyLabel = 'Rozkład na dziś nie zawiera odjazdów z tego miejsca.',
  unknownLabel = 'Nie udało się pobrać rozkładu, więc nie znamy rozkładu ruchu w dobie.',
}: {
  hourly: number[] | null
  loading: boolean
  currentHour: number
  emptyLabel?: string
  /** Nadpisanie komunikatu dla `hourly === null` — odróżnia „nie udało się
   * pobrać" od „pobrano, ale dzisiejszy dzień wypadł z rozkładu" (AGENTS.md
   * #9/#10), które inaczej wyglądałyby identycznie. */
  unknownLabel?: string
}) {
  if (loading) return <EmptyHint>Wczytywanie rozkładu…</EmptyHint>
  if (hourly === null) {
    return <EmptyHint>{unknownLabel}</EmptyHint>
  }

  const peak = Math.max(...hourly)
  if (peak === 0) return <EmptyHint>{emptyLabel}</EmptyHint>

  return (
    <div>
      <div
        className="flex h-16 items-end gap-[2px]"
        role="img"
        aria-label={`Odjazdy w ciągu doby, szczyt ${peak} o godzinie ${hourly.indexOf(peak)}`}
      >
        {hourly.map((count, hour) => (
          <span
            key={hour}
            title={`${String(hour).padStart(2, '0')}:00 — ${count} ${pluralPl(count, 'odjazd', 'odjazdy', 'odjazdów')}`}
            className="flex-1 rounded-sm transition"
            style={{
              // Minimalna wysokość 2px dla godziny z zerem: pusty słupek i brak
              // słupka wyglądałyby identycznie, a to dwie różne rzeczy.
              height: `${Math.max(2, (count / peak) * 100)}%`,
              backgroundColor: hour === currentHour ? 'var(--status-enRoute-bg)' : 'var(--surface-border)',
              opacity: count === 0 ? 0.4 : 1,
            }}
          />
        ))}
      </div>
      <div className="mt-1 flex justify-between text-xs text-text-muted tabular-nums">
        <span>00</span>
        <span>12</span>
        <span>23</span>
      </div>
    </div>
  )
}
