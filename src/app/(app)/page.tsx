'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { pinnedItemFromOption, pinnedKey, usePinned, type PinnedItem } from '@/hooks/usePinned'
import { Dashboard } from '@/components/Dashboard'
import { EmptyState } from '@/components/EmptyState'
import { RecentPlaces } from '@/components/RecentPlaces'
import { SearchDialog } from '@/components/SearchDialog'
import type { StationOption } from '@/components/StationSearch'
import { TopBar } from '@/components/TopBar'
import { NetworkStatsCard } from '@/components/NetworkStatsCard'
import { PageShell } from '@/components/aside'
import { STATION_ID_PATTERN } from '@/lib/validation'

// `/` nie ma dynamicznego segmentu, więc build próbuje ją prerenderować
// statycznie -- useSearchParams() wymaga wtedy granicy <Suspense> (inaczej
// błąd "missing-suspense-with-csr-bailout"), inaczej niż na /station/[stationId],
// gdzie sam dynamiczny segment już wyklucza prerender. Fallback trafia do HTML-a
// z prerenderu, więc to ten sam szkielet co przy `!loaded` — nie pusty ekran (#7).
export default function Page() {
  return (
    <Suspense fallback={<PulpitSkeleton />}>
      <PulpitPage />
    </Suspense>
  )
}

const PULPIT_SUBTITLE = 'Przypięte stacje i przystanki z najbliższymi odjazdami'

/** Dwie karty-szkielety Pulpitu przed odczytem przypiętych z `localStorage` — zamiast pustego ekranu. */
function SkeletonCards() {
  return (
    <div aria-busy="true" data-testid="pulpit-skeleton" className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,17rem),1fr))] gap-5">
      <span className="sr-only">Wczytywanie…</span>
      {[0, 1].map((i) => (
        <div key={i} aria-hidden="true" className="h-48 animate-pulse rounded-2xl bg-black/5 dark:bg-white/5" />
      ))}
    </div>
  )
}

/** Fallback granicy `Suspense` (trafia do HTML-a z prerenderu). */
function PulpitSkeleton() {
  return (
    <PageShell aside={<NetworkStatsCard />}>
      <TopBar title="Pulpit" subtitle={PULPIT_SUBTITLE} />
      <SkeletonCards />
    </PageShell>
  )
}

/** Potwierdzenie akcji na Pulpicie; `undo` = odpięty wpis i jego dawne miejsce („Cofnij"). */
type Notice = { text: string; undo?: { pinnedItem: PinnedItem; index: number } }

/** Wygląd przycisków Pulpitu („Dodaj", „Edytuj ulubione", „Cofnij") — jak „Udostępnij". */
const PULPIT_BUTTON_CLASS =
  'touch-44 relative inline-flex h-9 items-center rounded-full border border-surface-border px-3.5 text-sm font-medium text-text-secondary transition hover:bg-black/5 focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none dark:hover:bg-white/10'

function PulpitPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { pinnedItems, loaded, addPinned, removePinned, movePinned, replacePinned, isPinned } = usePinned()
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)
  const undoRef = useRef<HTMLButtonElement>(null)
  const editRef = useRef<HTMLButtonElement>(null)
  const addRef = useRef<HTMLButtonElement>(null)
  // Przyciski Pulpitu stoją w stanie pustym i w wierszu `Dashboard` — przejście między nimi montuje je na nowo,
  // więc fokus ustawiamy dopiero po renderze, na przycisku, który już jest w DOM.
  const focusAfterRender = useRef<'add' | 'edit' | null>(null)

  useEffect(() => {
    if (focusAfterRender.current === null) return
    ;(focusAfterRender.current === 'add' ? addRef : editRef).current?.focus()
    focusAfterRender.current = null
  })

  // Kliknięty przycisk odpięcia znika razem z wierszem — fokus przechodzi na „Cofnij", zamiast wypaść na `<body>`.
  useEffect(() => {
    if (notice?.undo !== undefined) undoRef.current?.focus()
  }, [notice])

  function pin(option: StationOption, city: string | null): void {
    const pinnedItem = pinnedItemFromOption(option, city)
    focusAfterRender.current = 'add'
    if (pinnedItem === null) {
      setNotice({ text: `Nie udało się przypiąć: ${option.name}` })
    } else if (isPinned(pinnedKey(pinnedItem))) {
      setNotice({ text: `${pinnedItem.name} jest już na Pulpicie` })
    } else {
      addPinned(pinnedItem)
      setNotice({ text: `Przypięto do Pulpitu: ${pinnedItem.name}` })
    }
  }

  function unpin(key: string): void {
    const index = pinnedItems.findIndex((pinnedItem) => pinnedKey(pinnedItem) === key)
    if (index === -1) return
    removePinned(key)
    setNotice({ text: `Odpięto z Pulpitu: ${pinnedItems[index].name}`, undo: { pinnedItem: pinnedItems[index], index } })
  }

  function undo(): void {
    if (notice?.undo !== undefined) addPinned(notice.undo.pinnedItem, notice.undo.index)
    setNotice(null)
    focusAfterRender.current = 'edit'
  }

  // „Cofnij" żyje do końca trybu edycji (bez limitu czasu — WCAG 2.2.1); każda nowa akcja zastępuje komunikat.
  function toggleEditing(): void {
    setEditing((current) => !current)
    setNotice(null)
  }

  const rawFocus = searchParams.get('focus')
  const focusedStationId = rawFocus && STATION_ID_PATTERN.test(rawFocus) ? rawFocus : null

  /**
   * `?focus=` to stary adres rozwiniętej stacji na pulpicie. Widok stacji jest
   * teraz jeden — pełna strona `/station/{id}` z kafelkami KPI i prawą kolumną
   * — więc stare linki przekierowujemy, zamiast utrzymywać drugi, uboższy
   * widok tej samej rzeczy (to właśnie ten rodzaj rozjazdu, o którym mówi
   * AGENTS.md #2).
   *
   * `replace`, nie `push`: przekierowanie nie ma zostawiać wpisu w historii,
   * bo „wstecz" wracałoby na adres, który natychmiast przekierowuje ponownie.
   */
  useEffect(() => {
    if (focusedStationId === null || !loaded) return
    const name = pinnedItems.find(
      (pinnedItem) => pinnedItem.kind === 'pkp' && pinnedItem.id === focusedStationId
    )?.name
    const query = name === undefined ? '' : `?name=${encodeURIComponent(name)}`
    router.replace(`/station/${focusedStationId}${query}`)
  }, [focusedStationId, loaded, pinnedItems, router])

  // Ten sam korzeń co niżej (`PageShell`): po wczytaniu podmienia się treść, a nagłówek, przejście i karta statystyk
  // nie montują się od nowa.
  if (!loaded) {
    return (
      <PageShell aside={<NetworkStatsCard />}>
        <TopBar title="Pulpit" subtitle={PULPIT_SUBTITLE} />
        <SkeletonCards />
      </PageShell>
    )
  }
  // Przekierowanie leci w efekcie wyżej; przez tę jedną klatkę nie ma po co
  // pokazywać pulpitu, który zaraz zniknie.
  if (focusedStationId !== null) return null

  // „Dodaj" przypina (okno w trybie przypinania); „Szukaj" w nagłówku dalej otwiera tablicę.
  // Jedna grupa: na telefonie oba przyciski schodzą razem pod plakietkę świeżości, nie pojedynczo.
  const actions = (
    <div className="flex gap-2">
      {/* Bez czyszczenia komunikatu: „Cofnij” z edycji przetrwa otwarcie i zamknięcie okna bez wyboru. */}
      <button ref={addRef} type="button" onClick={() => setAdding(true)} className={PULPIT_BUTTON_CLASS}>
        Dodaj
      </button>
      {(editing || pinnedItems.length > 0) && (
        <button ref={editRef} type="button" onClick={toggleEditing} className={PULPIT_BUTTON_CLASS}>
          {editing ? 'Gotowe' : 'Edytuj ulubione'}
        </button>
      )}
    </div>
  )

  return (
    <PageShell aside={<NetworkStatsCard />}>
      <TopBar title="Pulpit" subtitle={PULPIT_SUBTITLE} />
      <RecentPlaces limit={4} />

      {/* Zawsze w DOM: region `status` ogłasza zmianę treści, nie swoje pojawienie się. */}
      <div className={notice === null ? undefined : 'mb-3 flex flex-wrap items-center gap-x-3 gap-y-1'}>
        <p role="status" className="text-sm text-text-secondary">
          {notice?.text}
        </p>
        {notice?.undo !== undefined && (
          <button ref={undoRef} type="button" onClick={undo} className={PULPIT_BUTTON_CLASS}>
            Cofnij
          </button>
        )}
      </div>

      {pinnedItems.length === 0 ? (
        <>
          <div className="mb-5 flex flex-wrap items-center gap-2">{actions}</div>
          <EmptyState />
        </>
      ) : (
        <Dashboard
          pinnedItems={pinnedItems}
          onRemove={unpin}
          onMove={movePinned}
          onNormalize={replacePinned}
          editing={editing}
          actions={actions}
        />
      )}
      <SearchDialog open={adding} onClose={() => setAdding(false)} onPick={pin} />
    </PageShell>
  )
}
