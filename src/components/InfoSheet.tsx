import { createContext, useCallback, useContext, useId, useRef, useState, type ReactNode } from 'react'
import { SM_UP, useMediaQuery } from '@/hooks/useMediaQuery'
import { useModalDialog } from '@/hooks/useModalDialog'
import { useScrollableFocus } from '@/hooks/useScrollableFocus'
import { AsideCard } from './aside'
import { IconButton } from './IconButton'
import { CloseIcon, DisclosureIcon, InfoIcon, ICON_SIZE } from './icons'
import { FOCUS_RING, HOVER } from './interaction'

/**
 * Pasek zakładek tablicy na telefonie: przyklejony pod nagłówkiem aplikacji, nieprzezroczysty (wiersze
 * jadą pod nim). Ujemne marginesy znoszą `max-sm:p-4` sekcji, w której leży — zmieniasz jedno, zmień drugie.
 */
export const STICKY_TABS_BAR =
  'max-sm:sticky max-sm:top-[var(--header-h)] max-sm:z-20 max-sm:-mx-4 max-sm:-mt-4 max-sm:rounded-t-2xl max-sm:bg-[var(--sheet-surface)] max-sm:px-4 max-sm:py-2'

/**
 * Gdzie stoi kontekst tablicy (kafelki, pogoda, mapa…): od `sm` w prawej kolumnie (`wide`), na telefonie
 * tylko w arkuszu „Info”. Jedno miejsce naraz — ukryta klasą kopia montowałaby drugą mapę MapLibre
 * i dublowała tekst (`ui-states.md`). W SSR „szeroko”; do hydracji kolumnę na telefonie chowa CSS.
 */
export function useBoardContext(): { wide: boolean; infoOpen: boolean; toggleInfo: () => void; openInfo: () => void; closeInfo: () => void } {
  const wide = useMediaQuery(SM_UP, true)
  const [infoOpen, setInfoOpen] = useState(false)
  const toggleInfo = useCallback(() => setInfoOpen((open) => !open), [])
  const openInfo = useCallback(() => setInfoOpen(true), [])
  const closeInfo = useCallback(() => setInfoOpen(false), [])
  return { wide, infoOpen: infoOpen && !wide, toggleInfo, openInfo, closeInfo }
}

/** Przycisk „Info” w pasku zakładek tablicy — tylko telefon (od `sm` kontekst stoi w prawej kolumnie). */
export function InfoButton({ open, onClick }: { open: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      // Safari nie fokusuje przycisku po kliknięciu — bez tego arkusz nie miałby dokąd oddać fokusu.
      onClick={(event) => {
        event.currentTarget.focus()
        onClick()
      }}
      aria-haspopup="dialog"
      aria-expanded={open}
      className="press inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full border border-surface-border px-3 text-sm font-medium text-text-secondary transition hover:text-foreground sm:hidden"
    >
      <InfoIcon size={ICON_SIZE.button} />
      Info
    </button>
  )
}

const InInfoSheetContext = createContext(false)

/** Treść wie, że leży w modalnym arkuszu „Info” (telefon): sekcje zwijane, kolejność briefu §8. */
export function useInInfoSheet(): boolean {
  return useContext(InInfoSheetContext)
}

/**
 * Arkusz „Info” na telefonie (tablica stacji/przystanku, pogoda z `WeatherChip`): natywny modalny
 * `<dialog>` od dołu, nad dolnym paskiem (`useModalDialog`: `showModal`, Escape, tło, zwrot fokusu); „×”
 * też woła `onClose`, rodzic odmontowuje arkusz; `body:has(dialog[open])` w `globals.css` blokuje przewijanie
 * strony. Bez przeciągania — „×”, Escape i tap w tło zamykają. Mapa transportu zostaje przy
 * niemodalnym `BottomSheet` (przepuszcza gesty do MapLibre) — `adr/0009-modalne-info.md`.
 * Renderowany tylko na telefonie i tylko otwarty (montowanie = otwarcie).
 */
export function InfoSheet({ title, onClose, closeLabel = 'Zamknij informacje', children }: { title: string; onClose: () => void; closeLabel?: string; children: ReactNode }) {
  const headingRef = useRef<HTMLHeadingElement>(null)
  const headingId = useId()
  const [bodyRef, bodyTabIndex] = useScrollableFocus<HTMLDivElement>()
  const { ref, dialogProps } = useModalDialog({ onClose, onOpen: () => headingRef.current?.focus({ preventScroll: true }) })

  return (
    <dialog
      ref={ref}
      aria-labelledby={headingId}
      {...dialogProps}
      className="info-sheet m-0 mt-auto max-h-[88dvh] w-full max-w-none flex-col overflow-hidden rounded-t-2xl bg-[var(--sheet-surface)] p-0 text-foreground shadow-2xl backdrop:bg-black/50 open:flex"
      style={{ overscrollBehavior: 'contain' }}
    >
      <header className="flex items-center gap-3 border-b border-surface-border px-4 py-3">
        <h2 ref={headingRef} id={headingId} tabIndex={-1} className="font-heading min-w-0 flex-1 text-lg font-bold leading-tight outline-none">
          {title}
        </h2>
        <IconButton label={closeLabel} onClick={onClose} size="lg">
          <CloseIcon size={ICON_SIZE.button} />
        </IconButton>
      </header>
      <div
        ref={bodyRef}
        tabIndex={bodyTabIndex}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]"
      >
        <InInfoSheetContext.Provider value={true}>
          <div className="flex flex-col gap-4">{children}</div>
        </InInfoSheetContext.Provider>
      </div>
    </dialog>
  )
}

/**
 * Sekcja kontekstu tablicy: poza arkuszem zwykła karta (`AsideCard`, prawa kolumna od `sm`);
 * w arkuszu `collapsible` = wzorzec disclosure (WAI: `h3` z przyciskiem `aria-expanded`, nie `<summary>`,
 * które część czytników spłaszcza do przycisku i gubi nagłówek), domyślnie zwinięta. Treść montuje się
 * przy pierwszym rozwinięciu — mapa MapLibre nie startuje, dopóki ktoś jej nie otworzy (brief §8) —
 * a zwinięcie tylko ją chowa (`hidden`), bez stawiania mapy od zera.
 */
export function InfoSection({ title, collapsible = false, className, children }: { title: string; collapsible?: boolean; className?: string; children: ReactNode }) {
  const inSheet = useInInfoSheet()
  const [open, setOpen] = useState(false)
  const [opened, setOpened] = useState(false)
  const bodyId = useId()
  if (!inSheet || !collapsible) return <AsideCard title={title} className={className}>{children}</AsideCard>
  return (
    <section className="glass rounded-2xl">
      <h3 className="font-heading text-sm font-bold tracking-tight text-foreground">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={opened ? bodyId : undefined}
          onClick={() => {
            setOpen(!open)
            setOpened(true)
          }}
          className={`flex min-h-11 w-full items-center gap-2 rounded-2xl px-4 py-2.5 text-left ${HOVER} ${FOCUS_RING}`}
        >
          <span className="flex-1">{title}</span>
          <DisclosureIcon size={ICON_SIZE.button} className="text-text-muted" />
        </button>
      </h3>
      {opened && (
        <div id={bodyId} hidden={!open} className="px-4 pb-4">
          {children}
        </div>
      )}
    </section>
  )
}
