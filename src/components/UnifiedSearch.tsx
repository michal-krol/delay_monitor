'use client'

import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { useCities } from '@/hooks/useCities'
import { useCityLines, type CityLinesState } from '@/hooks/useCityLines'
import { useOnline } from '@/hooks/useOnline'
import { useRecentLines } from '@/hooks/useRecentLines'
import { useRecentPlaces } from '@/hooks/useRecentPlaces'
import { useUnifiedSearch, type SearchSourceState } from '@/hooks/useUnifiedSearch'
import { discoveryKey, MAX_PER_GROUP, type DiscoveryResult } from '@/lib/discovery'
import type { GtfsMode } from '@/lib/gtfs/types'
import { ChevronRightIcon, CloseIcon, ICON_SIZE, SearchIcon } from './icons'
import { HOVER } from './interaction'
import { LineBadge } from './LineBadge'
import { RecentLines } from './LineGrid'
import { RecentPlaces } from './RecentPlaces'
import { SEARCH_INPUT_CLASS } from './StationSearch'
import { MODE_ICON, MODE_LABEL } from './transitMode'

type Kind = DiscoveryResult['kind']

const ALL_KINDS: ReadonlyArray<Kind> = ['rail', 'stop', 'line']
const GROUPS: ReadonlyArray<{ kind: Kind; title: string }> = [
  { kind: 'rail', title: 'Stacje kolejowe' },
  { kind: 'stop', title: 'Przystanki' },
  { kind: 'line', title: 'Linie' },
]
/** Tyle znaków wymaga wyszukiwanie miejsc (`useUnifiedSearch`); linie szukają się od 1. */
const MIN_PLACES_QUERY = 3
const MAX_STOP_BADGES = 6
const MAX_STOP_ICONS = 3
/** Ile ostatnio wysłanych fraz pamiętamy, żeby odróżnić echo własnego pisania od nawigacji Wstecz. */
const MAX_PENDING_ECHOES = 20

/** Obrys fokusu na tokenie `--primary-text` (jasny i ciemny motyw) — wewnątrz, żeby kontener nie przycinał; `outline` (nie ring) przeżywa forced-colors. */
const ROW_FOCUS = 'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary-text'
const ROW_PRESSED = 'active:bg-black/10 dark:active:bg-white/15'

const SEARCH_FIELD_CLASS = `${SEARCH_INPUT_CLASS} min-h-11 pl-10 pr-12 focus:ring-primary-text! [&::-webkit-search-cancel-button]:appearance-none`

const modeKindLabel = (mode: GtfsMode) => (mode === 'rail' ? 'Kolej miejska' : MODE_LABEL[mode].charAt(0).toUpperCase() + MODE_LABEL[mode].slice(1))

function ModeTile({ modes }: { modes: GtfsMode[] }) {
  return (
    <span className="flex h-10 min-w-10 shrink-0 items-center justify-center gap-1 rounded-xl bg-primary-soft px-1.5 text-primary-text">
      {modes.map((mode) => {
        const Icon = MODE_ICON[mode]
        return <Icon key={mode} size={ICON_SIZE.tile} />
      })}
    </span>
  )
}

function Row({ label, leading, onClick, children }: { label: string; leading: React.ReactNode; onClick: () => void; children: React.ReactNode }) {
  return (
    <li className="border-t border-surface-border first:border-t-0">
      <button
        type="button"
        aria-label={label}
        onClick={onClick}
        className={`flex min-h-[52px] w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition ${HOVER} ${ROW_PRESSED} ${ROW_FOCUS}`}
      >
        {leading}
        <span className="min-w-0 flex-1">{children}</span>
        <ChevronRightIcon size={ICON_SIZE.button} className="shrink-0 text-text-muted" />
      </button>
    </li>
  )
}

const nameClass = 'block text-[15px] font-medium break-words text-foreground'
const contextClass = 'block text-xs break-words text-text-secondary'

function ResultRow({ result, cityName, onSelect }: { result: DiscoveryResult; cityName: (id: string) => string | null; onSelect: (result: DiscoveryResult) => void }) {
  const select = () => onSelect(result)
  switch (result.kind) {
    case 'rail': {
      const { name } = result.station
      const context = 'Stacja kolejowa PKP'
      return (
        <Row label={`${name}, ${context}`} leading={<ModeTile modes={['rail']} />} onClick={select}>
          <span className={nameClass}>{name}</span>
          <span className={contextClass}>{context}</span>
        </Row>
      )
    }
    case 'stop': {
      const { stop } = result
      const city = cityName(result.city)
      const context = city === null ? 'Zespół przystanków' : `Zespół przystanków · ${city}`
      const modes = [...new Set<GtfsMode>(stop.modes !== undefined && stop.modes.length > 0 ? stop.modes : [stop.mode ?? 'other'])].slice(0, MAX_STOP_ICONS)
      const lines = stop.lines ?? []
      const shown = lines.slice(0, MAX_STOP_BADGES)
      const label = `${stop.name}, ${context}${shown.length > 0 ? `, linie ${shown.map((entry) => entry.line).join(' ')}` : ''}`
      return (
        <Row label={label} leading={<ModeTile modes={modes} />} onClick={select}>
          <span className={nameClass}>{stop.name}</span>
          <span className={contextClass}>{context}</span>
          {shown.length > 0 && (
            <span className="mt-1 flex flex-wrap items-center gap-1">
              {shown.map((entry) => (
                <LineBadge key={entry.routeId} line={entry.line} mode={entry.mode} kind={entry.kind} size="sm" />
              ))}
              {lines.length > shown.length && <span className="text-xs text-text-muted">+{lines.length - shown.length}</span>}
            </span>
          )}
        </Row>
      )
    }
    case 'line': {
      const { line } = result
      const city = cityName(result.city)
      const context = city === null ? modeKindLabel(line.mode) : `${modeKindLabel(line.mode)} · ${city}`
      const label = line.longName === '' ? `Linia ${line.line}, ${context}` : `Linia ${line.line}, ${line.longName}, ${context}`
      return (
        <Row label={label} leading={<LineBadge line={line.line} mode={line.mode} kind={line.kind} />} onClick={select}>
          {line.longName !== '' && <span className={nameClass}>{line.longName}</span>}
          <span className={contextClass}>{context}</span>
        </Row>
      )
    }
  }
}

type Message = { text: string; tone: 'neutral' | 'muted' | 'error' }
const TONE_CLASS: Record<Message['tone'], string> = { neutral: 'text-text-secondary', muted: 'text-text-muted', error: 'text-error-text' }

/**
 * Wspólne pole „Stacja, przystanek lub linia": jedno pole, wyniki w trzech grupach (stacje PKP, przystanki
 * miasta, linie miasta) jako zwykła lista przycisków — bez combobox/listbox. Enter w polu nie wybiera wyniku.
 * Routing zostaje po stronie konsumenta (`onSelect`); pole trzyma własną frazę, `initialQuery` tylko ją synchronizuje.
 */
export function UnifiedSearch({
  city,
  onSelect,
  autoFocus = false,
  initialQuery = '',
  onQueryChange,
  lineSource,
  kinds = ALL_KINDS,
  recents = true,
}: {
  city: string | null
  onSelect: (result: DiscoveryResult) => void
  autoFocus?: boolean
  initialQuery?: string
  onQueryChange?: (query: string) => void
  lineSource?: CityLinesState
  /** Które grupy wyników są oferowane (dialog „Dodaj" nie ma sensu z liniami). Domyślnie wszystkie trzy. */
  kinds?: ReadonlyArray<Kind>
  /** „Ostatnio oglądane" pod pustym polem; dialog „Dodaj" je wyłącza (to linki, wyprowadziłyby z dialogu). */
  recents?: boolean
}) {
  const [query, setQuery] = useState(initialQuery)
  const inputRef = useRef<HTMLInputElement>(null)
  const uid = useId()
  const online = useOnline()
  const { state: citiesState, cities, retry: retryCities } = useCities()
  // Jedno pobranie listy linii: własne, gdy rodzic nie dał `lineSource` (mapa daje); to samo zasila „Ostatnio oglądane”.
  const ownLines = useCityLines(lineSource === undefined ? city : null)
  const lines = lineSource ?? ownLines
  const { results, sources, retry } = useUnifiedSearch({ city, query, lineSource: lines })
  const recentPlaces = useRecentPlaces()
  const recentLines = useRecentLines(city ?? '')

  // Frazy wysłane przez `onQueryChange`, na które rodzic jeszcze nie odpowiedział zmianą `initialQuery`.
  const pendingEchoes = useRef<string[]>([])
  const seenInitial = useRef(initialQuery)
  useEffect(() => {
    if (seenInitial.current === initialQuery) return
    seenInitial.current = initialQuery
    const echo = pendingEchoes.current.indexOf(initialQuery)
    if (echo >= 0) {
      // Rodzic odbił to, co sami wpisaliśmy — pole nie może się cofnąć do starszej frazy.
      pendingEchoes.current = pendingEchoes.current.slice(echo + 1)
      return
    }
    // Inny adres (Wstecz): przejmujemy go bez `onQueryChange`, więc bez pętli z `replace`.
    pendingEchoes.current = []
    setQuery(initialQuery)
  }, [initialQuery])

  function change(next: string): void {
    pendingEchoes.current = [...pendingEchoes.current, next].slice(-MAX_PENDING_ECHOES)
    setQuery(next)
    onQueryChange?.(next)
  }

  const focusInput = useCallback(() => inputRef.current?.focus(), [])

  function submit(event: FormEvent): void {
    // Enter nigdy nie wybiera „pierwszego” wyniku; chowa tylko klawiaturę ekranową.
    event.preventDefault()
    inputRef.current?.blur()
  }

  const cityName = (id: string) => cities.find((entry) => entry.id === id)?.name ?? null

  const trimmed = query.trim()
  const has = (kind: Kind) => kinds.includes(kind)
  const shown = results.filter((result) => has(result.kind))
  // Źródło ukrytego rodzaju nie liczy się do stanu (jego awaria nie jest widoczna dla użytkownika).
  const visibleSources: Array<{ state: SearchSourceState; failed: string }> = [
    ...(has('rail') ? [{ state: sources.rail, failed: 'stacji kolejowych' }] : []),
    ...(has('stop') ? [{ state: sources.transit, failed: 'przystanków' }] : []),
    ...(has('line') ? [{ state: sources.lines, failed: 'linii' }] : []),
  ]
  const failedSources = visibleSources.filter((source) => source.state === 'failed')
  const loading = visibleSources.some((source) => source.state === 'loading')
  const placesWanted = has('rail') || has('stop')
  const needsCity = (has('stop') && sources.transit === 'disabled') || (has('line') && sources.lines === 'disabled')
  // „Brak wyników” tylko gdy przeszukano miejsca (od 3 znaków); same linie (od 1 znaku, gdy lista gotowa) = „Brak linii”.
  const placesSearched = placesWanted && trimmed.length >= MIN_PLACES_QUERY
  const linesSearched = has('line') && sources.lines === 'ready'
  // Bez miasta przystanki i linie nie mają skąd się wziąć: powód zależy od stanu rejestru miast, nie od „wybierz miasto”.
  const cityListFailed = needsCity && citiesState === 'failed'

  const messages: Message[] = []
  if (trimmed !== '') {
    if (placesWanted && trimmed.length < MIN_PLACES_QUERY) messages.push({ text: 'Wpisz co najmniej 3 znaki, aby znaleźć miejsca', tone: 'neutral' })
    if (loading) messages.push({ text: 'Wczytywanie…', tone: 'neutral' })
    for (const source of failedSources) messages.push({ text: `Nie udało się wczytać ${source.failed}`, tone: 'error' })
    if (needsCity) {
      if (citiesState === 'loading') messages.push({ text: 'Wczytywanie miast…', tone: 'neutral' })
      else if (citiesState === 'failed') messages.push({ text: 'Nie udało się wczytać listy miast', tone: 'error' })
      else messages.push({ text: 'Brak skonfigurowanych miast', tone: 'muted' })
    }
    if (shown.length === 0 && failedSources.length === 0 && !loading && !needsCity) {
      if (placesSearched) messages.push({ text: 'Brak wyników dla tej frazy', tone: 'neutral' })
      else if (linesSearched) messages.push({ text: 'Brak linii dla tej frazy', tone: 'neutral' })
    }
    if (!online) messages.push({ text: 'Brak połączenia — wyniki mogą być nieaktualne', tone: 'muted' })
  }
  const canRetry = failedSources.length > 0 || (trimmed !== '' && cityListFailed)

  const empty = trimmed === ''
  const lineList = lines.lines
  const showRecentLines = recents && empty && has('line') && city !== null && lineList !== null
  const hasRecentLines = showRecentLines && lineList.some((entry) => recentLines.recent.includes(entry.routeId))
  const hasRecentPlaces = recents && recentPlaces.places.length > 0
  const showInstruction = empty && recentPlaces.loaded && !hasRecentPlaces && !hasRecentLines

  return (
    <div className="w-full">
      <form role="search" onSubmit={submit} className="relative">
        <SearchIcon size={ICON_SIZE.button} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-text-muted" />
        <input
          ref={inputRef}
          type="search"
          enterKeyHint="search"
          autoFocus={autoFocus}
          autoComplete="off"
          maxLength={100}
          aria-label="Stacja, przystanek lub linia"
          placeholder="Stacja, przystanek lub linia"
          className={SEARCH_FIELD_CLASS}
          value={query}
          onChange={(event) => change(event.target.value)}
        />
        {query !== '' && (
          <button
            type="button"
            aria-label="Wyczyść"
            onClick={() => {
              change('')
              focusInput()
            }}
            className={`control-44 absolute top-1/2 right-0.5 flex -translate-y-1/2 items-center justify-center rounded-lg text-text-secondary transition ${HOVER} ${ROW_PRESSED} ${ROW_FOCUS}`}
          >
            <CloseIcon size={ICON_SIZE.button} />
          </button>
        )}
      </form>

      {/* Zawsze zamontowany, żeby czytnik ekranu zauważył zmianę tekstu; pusty nie zajmuje miejsca. */}
      <p role="status" aria-live="polite" className={`text-sm ${messages.length > 0 ? 'mt-3' : ''}`}>
        {messages.map((message) => (
          <span key={message.text} className={`block ${TONE_CLASS[message.tone]}`}>
            {message.text}
          </span>
        ))}
      </p>
      {canRetry && (
        <button
          type="button"
          onClick={() => {
            // Jeden przycisk ponawia wszystko, co zawiodło; po udanym ponowieniu znika, więc fokus idzie do pola.
            if (failedSources.length > 0) retry()
            if (cityListFailed) retryCities()
            focusInput()
          }}
          className="chip-filter mt-2"
        >
          Spróbuj ponownie
        </button>
      )}

      {GROUPS.filter((group) => has(group.kind)).map((group) => {
        const rows = shown.filter((result) => result.kind === group.kind)
        if (rows.length === 0) return null
        const headingId = `${uid}-${group.kind}`
        return (
          <section key={group.kind} aria-labelledby={headingId} className="mt-4">
            <h3 id={headingId} className="px-1 text-xs font-semibold tracking-wide text-text-secondary uppercase">
              {group.title}
            </h3>
            <ul className="mt-1">
              {rows.map((result) => (
                <ResultRow key={discoveryKey(result)} result={result} cityName={cityName} onSelect={onSelect} />
              ))}
            </ul>
            {rows.length >= MAX_PER_GROUP && <p className="mt-1 px-1 text-xs text-text-muted">Pokazano do {MAX_PER_GROUP} wyników — doprecyzuj frazę</p>}
          </section>
        )
      })}

      {empty && recents && (
        <RecentPlaces
          limit={8}
          headingLevel="h3"
          onCleared={() => {
            recentPlaces.clear()
            focusInput()
          }}
        />
      )}
      {showRecentLines && lineList !== null && city !== null && (
        <div className="mt-3">
          <RecentLines recent={recentLines.recent} lines={lineList} city={city} />
        </div>
      )}
      {showInstruction && (
        <p className="mt-4 px-1 text-sm text-text-secondary">
          {has('line') ? 'Wpisz nazwę stacji, przystanku albo numer linii' : 'Wpisz nazwę stacji lub przystanku'}
        </p>
      )}
    </div>
  )
}
