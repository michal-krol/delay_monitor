'use client'

import { NAV_FORWARD_OPTIONS } from '@/lib/navTransition'
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
// gdzie sam dynamiczny segment już wyklucza prerender. Fallback `null` to
// dokładnie to, co strona i tak pokazywała wcześniej przez `!loaded`.
export default function Page() {
  return (
    <Suspense fallback={null}>
      <PulpitPage />
    </Suspense>
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

  // Kliknięty przycisk odpięcia znika razem z wierszem — fokus przechodzi na „Cofnij", zamiast wypaść na `<body>`.
  useEffect(() => {
    if (notice?.undo !== undefined) undoRef.current?.focus()
  }, [notice])

  function pin(option: StationOption, city: string | null): void {
    const pinnedItem = pinnedItemFromOption(option, city)
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
    editRef.current?.focus()
  }

  // „Cofnij" żyje do końca trybu edycji (bez limitu czasu — WCAG 2.2.1); każda nowa akcja zastępuje komunikat.
  function toggleEditing(): void {
    setEditing((current) => !current)
    setNotice(null)
  }

  const rawFocus = searchParams.get('focus')
  const focusedStationId = rawFocus && STATION_ID_PATTERN.test(rawFocus) ? rawFocus : null

  function goToBoard(station: StationOption): void {
    router.push(`/station/${station.id}?name=${encodeURIComponent(station.name)}`, NAV_FORWARD_OPTIONS)
  }

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

  if (!loaded) return null
  // Przekierowanie leci w efekcie wyżej; przez tę jedną klatkę nie ma po co
  // pokazywać pulpitu, który zaraz zniknie.
  if (focusedStationId !== null) return null

  // „Dodaj" przypina (okno w trybie przypinania); „Szukaj" w nagłówku dalej otwiera tablicę.
  // Jedna grupa: na telefonie oba przyciski schodzą razem pod plakietkę świeżości, nie pojedynczo.
  const actions = (
    <div className="flex gap-2">
      <button
        type="button"
        onClick={() => {
          setNotice(null)
          setAdding(true)
        }}
        className={PULPIT_BUTTON_CLASS}
      >
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
      <TopBar title="Pulpit" subtitle="Przypięte stacje i przystanki z najbliższymi odjazdami" />
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
          onExpand={goToBoard}
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
