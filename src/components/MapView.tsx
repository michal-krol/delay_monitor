'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { createRoot, type Root } from 'react-dom/client'
import type { Map as MapLibreMap, Marker as MapLibreMarker } from 'maplibre-gl'
import { trapTab } from '@/lib/focusTrap'
import type { GtfsMode, LineKind } from '@/lib/gtfs/types'
import { MODE_ICON, lineColor } from './transitMode'
import { ExpandIcon, CloseIcon, MapIcon } from './icons'
import { IconButton } from './IconButton'
import { MODE_COLOR, UNKNOWN_COLOR, casingFor, outlineFilter, strokeFor } from './map/mapData'

export type MapPin = {
  id: string
  lat: number
  lon: number
  label: string
  /** Ikona pinu — klucz `MODE_ICON` (transitMode.tsx, już używane przez `LineBadge`). Brak = neutralny pin lokalizacji. */
  mode?: keyof typeof MODE_ICON
  /** 2-3 gotowe, sformatowane linijki („18:12 → Kutno") — MapView niczego nie liczy, tylko wyświetla. Tylko w powiększonym popupie. */
  preview?: string[]
  /** Link w powiększonym popupie — używany przez mapę trasy linii (piny = różne przystanki); mapy jednego przystanku go nie podają (byłby linkiem do siebie samego). */
  href?: string
}

/**
 * Ruchomy punkt (pojazd) — markery aktualizowane w miejscu, bez przebudowy mapy.
 * Ta sama konwencja co na mapie miasta: kropka w kolorze rodzaju + strzałka kierunku
 * (`bearing`, azymut od północy); bez `bearing` sama kropka.
 */
export type MapMover = { id: string; lat: number; lon: number; label: string; mode: GtfsMode; /** Rodzaj linii (kolor); pociąg PKP przekazuje `'regular'` jawnie. */ kind: LineKind; bearing?: number | null }
/**
 * Trasa rysowana po kolejnych punktach — kontur ulic z `shapes.txt` gdy wzorzec go ma, inaczej łamana po przystankach (`schedule.ts`/`query.ts` decydują, MapView tylko rysuje).
 * Kolor liczy `lineColor(mode, kind)` — ta sama paleta co plakietki i mapa miasta; pociąg PKP przekazuje `'regular'` jawnie.
 */
export type MapRoute = { points: { lat: number; lon: number }[]; mode: GtfsMode; kind: LineKind }

type MoverHandle = { sync: (movers: MapMover[]) => void }

/** Podkłady OpenFreeMap — wspólne dla `MapView` i mapy miasta (`map/TransitMap.tsx`). */
export const STYLE_LIGHT = 'https://tiles.openfreemap.org/styles/liberty'
export const STYLE_DARK = 'https://tiles.openfreemap.org/styles/dark'

/**
 * `setWorkerUrl` PRZED pierwszym `new Map()` -- MapLibre w wersji ESM tworzy
 * swój Web Worker przez `import.meta.url`-owy odczyt `maplibre-gl-worker.mjs`
 * z paczki npm; webpack (Next.js production build) rozwiązuje to na PUSTY
 * string, więc `new Worker("", {type:"module"})` żąda bieżącej strony HTML
 * zamiast skryptu -- mapa dostaje transform (piny widać, pozycjonowane
 * synchronicznie z `center`/`zoom`), ale worker nigdy nie startuje, więc
 * canvas zostaje całkowicie pusty (żadnych kafelków, nawet warstwy `background`).
 * Zaobserwowane na produkcyjnym buildzie (`next build && next start`), NIE w
 * `next dev` -- stąd łatwo przeoczyć lokalnie. Naprawa: własna kopia skryptu
 * workera jako statyczny asset (`public/maplibre-gl-worker.mjs`, ten sam plik
 * co `node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs`). Worker
 * statycznie importuje `./maplibre-gl-shared.mjs` (kod współdzielony z
 * głównym wątkiem) -- musi być wendorowany OBOK, pod tą samą ścieżką
 * względną, inaczej worker startuje i po cichu pada na 404 tego importu.
 * Oba pliki pilnowane testem porównującym z `node_modules` przy zmianie
 * wersji zależności.
 */
export const WORKER_URL = '/maplibre-gl-worker.mjs'

/** Kółko w kolorze rodzaju (`MODE_COLOR`, jak kropki i legenda mapy miasta) z ikoną trybu zamiast domyślnej łezki MapLibre — `createRoot` do oderwanego diva, zero duplikacji SVG z `icons.tsx`. Kotwica na środku (poprawniejsze niż łezka: punkt = dokładna lokalizacja). */
function createMarkerElement(pin: MapPin): { element: HTMLDivElement; root: Root } {
  const element = document.createElement('div')
  element.className = 'grid h-8 w-8 cursor-pointer place-items-center rounded-full text-white shadow-lg ring-2 ring-white'
  const color = pin.mode !== undefined ? MODE_COLOR[pin.mode] : UNKNOWN_COLOR
  element.style.backgroundColor = color
  // Żółte metro: biała ikona i biały pierścień znikałyby — tekst/pierścień z palety (`fg`).
  if (pin.mode !== undefined) element.style.color = lineColor(pin.mode, 'regular').fg
  element.style.setProperty('--tw-ring-color', strokeFor(color))
  const root = createRoot(element)
  const Icon = pin.mode !== undefined ? MODE_ICON[pin.mode] : MapIcon
  root.render(<Icon size={16} />)
  return { element, root }
}

/**
 * Treść popupu budowana przez DOM API, nie `setHTML(string)` -- `label`/`preview`
 * pochodzą z feedu GTFS/PKP (AGENTS.md #4: wejście spoza aplikacji jest zawsze
 * wrogie), `textContent` nie interpretuje znaczników. Mini popup = sam label;
 * powiększony dokłada `preview` i `href`, gdy podane.
 */
function buildPopupContent(pin: MapPin, rich: boolean): HTMLElement {
  const wrap = document.createElement('div')
  wrap.className = 'text-sm'

  const title = document.createElement('div')
  title.className = 'font-semibold text-foreground'
  title.textContent = pin.label
  wrap.appendChild(title)

  if (rich && pin.preview !== undefined && pin.preview.length > 0) {
    const list = document.createElement('div')
    list.className = 'mt-1 flex flex-col gap-0.5 text-xs text-text-secondary'
    for (const line of pin.preview) {
      const row = document.createElement('div')
      row.textContent = line
      list.appendChild(row)
    }
    wrap.appendChild(list)
  }

  if (rich && pin.href !== undefined) {
    const link = document.createElement('a')
    link.href = pin.href
    link.textContent = 'Zobacz pełną tablicę'
    link.className = 'mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-indigo-600 dark:text-indigo-400'
    link.appendChild(createChevronElement())
    wrap.appendChild(link)
  }

  return wrap
}

/**
 * Chevron „dalej” do popupu (DOM poza Reactem) — ta sama geometria co `ChevronRightIcon`
 * z `icons.tsx` (viewBox 20×20, obrys 1.7). `createElementNS`, nie innerHTML (#4).
 */
function createChevronElement(): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg'
  const svg = document.createElementNS(ns, 'svg')
  const attrs: Record<string, string> = {
    viewBox: '0 0 20 20',
    width: '14',
    height: '14',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': '1.7',
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'aria-hidden': 'true',
  }
  for (const [name, value] of Object.entries(attrs)) svg.setAttribute(name, value)
  const path = document.createElementNS(ns, 'path')
  path.setAttribute('d', 'm8 5 5 5-5 5')
  svg.appendChild(path)
  return svg
}

/**
 * Pojazd jak na mapie miasta (`vehicles` + `vehicles-arrows` w `TransitMap`): kropka w kolorze
 * rodzaju, strzałka przed nią. Cały marker obraca MapLibre (`rotation`), więc strzałka stoi
 * „na górze" elementu; bez kierunku jest ukryta.
 */
function createMoverElement(mover: MapMover): HTMLDivElement {
  const color = lineColor(mover.mode, mover.kind).bg
  const element = document.createElement('div')
  element.className = 'relative h-4 w-4 cursor-pointer'
  element.setAttribute('data-testid', 'map-mover')
  const dot = document.createElement('div')
  dot.dataset.part = 'dot'
  dot.className = 'h-4 w-4 rounded-full shadow ring-2 ring-white'
  dot.style.backgroundColor = color
  dot.style.setProperty('--tw-ring-color', strokeFor(color))
  const arrow = document.createElement('div')
  arrow.dataset.part = 'arrow'
  // Trójkąt z obramowań (ostrzem do góry), 3 px nad kropką.
  arrow.className = 'absolute -top-[11px] left-[3px] h-0 w-0 border-x-[5px] border-b-[8px] border-x-transparent'
  arrow.style.borderBottomColor = color
  // Trójkąt z obramowań nie ma własnego obrysu — `drop-shadow` w kolorze `strokeFor` (żółte metro ~1,3:1 na jasnym podkładzie).
  arrow.style.filter = outlineFilter(color)
  arrow.hidden = mover.bearing === null || mover.bearing === undefined
  element.append(dot, arrow)
  return element
}

function moverPopup(label: string): HTMLElement {
  const el = document.createElement('div')
  el.className = 'text-sm font-semibold text-foreground'
  el.textContent = label
  return el
}

/**
 * Montuje mapę+markery w podanym kontenerze. Wspólna dla miniatury i widoku
 * powiększonego — różni je tylko `rich` (treść popupu) i to, kiedy efekt
 * wywołujący to faktycznie odpala (`active`).
 */
function mountMap(
  container: HTMLDivElement,
  pins: MapPin[],
  onPinClick: ((id: string) => void) | undefined,
  rich: boolean,
  route: MapRoute | undefined,
  moverHandle: { current: MoverHandle | null },
  initialMovers: MapMover[],
  dark: boolean
): () => void {
  let cancelled = false
  let map: MapLibreMap | null = null
  const markers: { marker: MapLibreMarker; root: Root }[] = []
  const moverMarkers = new Map<string, MapLibreMarker>()
  const moverArrows = new Map<string, HTMLElement>()

  import('maplibre-gl').then((lib) => {
    if (cancelled) return

    lib.setWorkerUrl(WORKER_URL)
    map = new lib.Map({
      container,
      style: dark ? STYLE_DARK : STYLE_LIGHT,
      center: [pins[0].lon, pins[0].lat],
      zoom: pins.length === 1 ? 15 : 13,
    })

    const mapInstance = map
    function syncMovers(movers: MapMover[]): void {
      const seen = new Set<string>()
      for (const mover of movers) {
        seen.add(mover.id)
        const existing = moverMarkers.get(mover.id)
        if (existing !== undefined) {
          existing.setLngLat([mover.lon, mover.lat])
          existing.setRotation(mover.bearing ?? 0)
          const arrow = moverArrows.get(mover.id)
          if (arrow !== undefined) arrow.hidden = mover.bearing === null || mover.bearing === undefined
          existing.getPopup()?.setDOMContent(moverPopup(mover.label))
          continue
        }
        const element = createMoverElement(mover)
        const arrow = element.querySelector<HTMLElement>('[data-part="arrow"]')
        if (arrow !== null) moverArrows.set(mover.id, arrow)
        const marker = new lib.Marker({ element, rotation: mover.bearing ?? 0, rotationAlignment: 'map' })
          .setLngLat([mover.lon, mover.lat])
          .setPopup(new lib.Popup({ offset: 10 }).setDOMContent(moverPopup(mover.label)))
          .addTo(mapInstance)
        moverMarkers.set(mover.id, marker)
      }
      for (const [id, marker] of moverMarkers) {
        if (seen.has(id)) continue
        marker.remove()
        moverMarkers.delete(id)
        moverArrows.delete(id)
      }
    }
    moverHandle.current = { sync: syncMovers }
    syncMovers(initialMovers)

    if (route !== undefined && route.points.length >= 2) {
      const color = lineColor(route.mode, route.kind).bg
      const addRoute = (): void => {
        if (mapInstance.getSource('route') !== undefined) return
        mapInstance.addSource('route', {
          type: 'geojson',
          data: {
            type: 'Feature',
            properties: {},
            geometry: { type: 'LineString', coordinates: route.points.map((p) => [p.lon, p.lat]) },
          },
        })
        mapInstance.addLayer({
          id: 'route',
          type: 'line',
          source: 'route',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': color, 'line-width': 4, 'line-opacity': 0.85 },
        })
        // Obwódka pod trasą (jak `route-casing` na mapie miasta): żółte metro na jasnym podkładzie bez niej znika.
        mapInstance.addLayer(
          {
            id: 'route-casing',
            type: 'line',
            source: 'route',
            layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: { 'line-color': casingFor(color, dark), 'line-width': 7, 'line-opacity': 0.85 },
          },
          'route'
        )
      }
      if (mapInstance.isStyleLoaded()) addRoute()
      // `style.load`, nie `load`: `load` czeka na wszystkie kafle i potrafi nie przyjść, a trasa musi się narysować (jak w `TransitMap`).
      else mapInstance.once('style.load', addRoute)
    }

    const bounds = new lib.LngLatBounds()
    for (const pin of pins) {
      const { element, root } = createMarkerElement(pin)
      const marker = new lib.Marker({ element })
        .setLngLat([pin.lon, pin.lat])
        .setPopup(new lib.Popup({ offset: 16 }).setDOMContent(buildPopupContent(pin, rich)))
        .addTo(map)
      // Popup toggle na klik jest WBUDOWANY w Marker (`_onMapClick`, rejestrowany
      // w `addTo()`) -- nie wywołuj `marker.togglePopup()` tutaj. Zrobiliśmy to
      // raz i klik otwierał popup i w tej samej interakcji od razu go zamykał:
      // mój listener na `element` odpala `togglePopup()` (otwiera), a zaraz
      // potem WŁASNY mechanizm markera, spięty ze zdarzeniem `click` całej mapy
      // (nie DOM-owym `click` na elemencie), widzi ten sam klik i toggle'uje
      // DRUGI RAZ (zamyka). Tu tylko `onPinClick` — reszta dzieje się sama.
      const id = pin.id
      if (onPinClick !== undefined) {
        element.addEventListener('click', () => onPinClick(id))
      }
      markers.push({ marker, root })
      bounds.extend([pin.lon, pin.lat])
    }
    if (pins.length > 1) map.fitBounds(bounds, { padding: 40, maxZoom: 16 })
  })

  return () => {
    cancelled = true
    moverHandle.current = null
    for (const { marker, root } of markers) {
      marker.remove()
      // Sprzątanie efektu biegnie w trakcie commitu Reacta (np. przemontowanie po zmianie
      // motywu) — synchroniczne `unmount()` osobnego korzenia daje tam ostrzeżenie o wyścigu.
      queueMicrotask(() => root.unmount())
    }
    for (const marker of moverMarkers.values()) marker.remove()
    map?.remove()
  }
}

export function MapView({
  pins,
  onPinClick,
  ariaLabel,
  route,
  movers,
  dark,
}: {
  /** Motyw z `resolvedTheme` wołającego — podkład jak na mapie miasta. Zmiana = mapa montowana od nowa (rzadkie: klik w przełącznik motywu). */
  dark: boolean
  pins: MapPin[]
  onPinClick?: (id: string) => void
  ariaLabel: string
  route?: MapRoute
  movers?: MapMover[]
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const fullscreenContainerRef = useRef<HTMLDivElement>(null)
  const [expanded, setExpanded] = useState(false)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const expandButtonRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  // Ruchome punkty aktualizowane w miejscu (dwie mapy: miniatura i pełny ekran) -- `movers`
  // celowo NIE wchodzi do zależności montowania, inaczej każdy poll pojazdów resetowałby mapę.
  const moversRef = useRef<MapMover[]>(movers ?? [])
  const miniHandle = useRef<MoverHandle | null>(null)
  const fullHandle = useRef<MoverHandle | null>(null)

  // Sygnatura TOŻSAMOŚCI/POZYCJI pinów, celowo BEZ `mode`/`preview`/`href`.
  // Dwa powody: (1) wołający (np. `TransitStopDetail`) przelicza `pins` na
  // nowo przy każdym pollu tablicy (~30 s) nawet gdy słupki się nie zmieniły
  // -- pełna tablica w dep array przeinicjalizowywałaby mapę (reset
  // zoomu/pana) co poll. (2) klik pinu woła `onPinClick`, co w GTFS wybiera
  // słupek i odświeża `board` -> `mapPins.preview` się zmienia -- gdyby
  // `preview` był w tej sygnaturze, KAŻDY klik pinu przeinicjalizowywałby
  // mapę i niszczył popup, który sam ten klik otworzył (zaobserwowane
  // ręcznie: popup migał i znikał). `mode` per pin faktycznie nie zmienia
  // się nigdy dla tego samego `id`, więc brak w sygnaturze nic nie kosztuje.
  // Efekty niżej celowo zamykają się nad `pins` z bieżącego renderu zamiast
  // dodawać je do zależności: uruchamiają się tylko, gdy ta sygnatura
  // faktycznie się zmieni, więc treść w domknięciu jest wtedy aktualna.
  const pinsKey = pins.map((p) => `${p.id}:${p.lat}:${p.lon}:${p.label}`).join('|')
  // Trasa zmienia się razem z pinami (kierunek linii); kolor dopisany, bo zmienia rysunek.
  const routeKey = route === undefined ? '' : `${route.points.length}:${lineColor(route.mode, route.kind).bg}`

  useEffect(() => {
    moversRef.current = movers ?? []
    miniHandle.current?.sync(moversRef.current)
    fullHandle.current?.sync(moversRef.current)
  }, [movers])

  useEffect(() => {
    if (containerRef.current === null || pins.length === 0) return
    return mountMap(containerRef.current, pins, onPinClick, false, route, miniHandle, moversRef.current, dark)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `pinsKey`/`routeKey` to celowe sygnatury treści `pins`/`route`, patrz komentarz wyżej.
  }, [pinsKey, routeKey, onPinClick, dark])

  // Powiększona mapa montowana dopiero gdy `expanded` -- kontener istnieje w
  // DOM wyłącznie wtedy (portal niżej), więc efekt musi mieć `expanded` w
  // zależnościach: sama zmiana refa nie wywołuje ponownego uruchomienia.
  useEffect(() => {
    if (!expanded || fullscreenContainerRef.current === null || pins.length === 0) return
    return mountMap(fullscreenContainerRef.current, pins, onPinClick, true, route, fullHandle, moversRef.current, dark)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- jak wyżej + `expanded` steruje montowaniem.
  }, [expanded, pinsKey, routeKey, onPinClick, dark])

  // Escape zamyka powiększenie -- ten sam wzorzec co `MobileNav.tsx`.
  useEffect(() => {
    if (!expanded) return
    closeButtonRef.current?.focus()
    const opener = expandButtonRef.current
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') setExpanded(false)
      trapTab(event, dialogRef.current)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
      // Zamknięcie (Escape, tło, ✕) oddaje fokus przyciskowi, który otworzył powiększenie.
      opener?.focus({ preventScroll: true })
    }
  }, [expanded])

  if (pins.length === 0) return null

  return (
    <>
      <div className="relative">
        <div ref={containerRef} role="region" aria-label={ariaLabel} className="h-64 w-full overflow-hidden rounded-2xl" />
        <button
          ref={expandButtonRef}
          type="button"
          onClick={() => setExpanded(true)}
          aria-label="Powiększ mapę"
          className="touch-44 glass absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-lg text-foreground transition hover:bg-[var(--surface-strong)]"
        >
          <ExpandIcon size={16} />
        </button>
      </div>

      {/* Portal do `document.body`: `.glass`/`.card-hover` (AsideCard) używają
          `backdrop-filter`, co tworzy containing block dla `position: fixed`
          potomków -- bez portalu overlay byłby przycięty do karty mapy, nie
          pokrywał viewportu. */}
      {expanded &&
        createPortal(
          <div className="fixed inset-0 z-50">
            <div
              onClick={() => setExpanded(false)}
              data-testid="map-fullscreen-backdrop"
              className="absolute inset-0 bg-black/60"
              aria-hidden="true"
            />
            <div ref={dialogRef} role="dialog" aria-modal="true" aria-label={ariaLabel} className="absolute inset-4 overflow-hidden rounded-2xl shadow-2xl sm:inset-10">
              <div ref={fullscreenContainerRef} className="h-full w-full" />
              {/* Tło na opakowaniu, nie na przycisku: tło i hover `IconButton` to ta sama
                  właściwość, więc na przycisku jedno kasowałoby drugie. */}
              <div className="absolute right-3 top-3 rounded-full bg-surface-strong shadow-md backdrop-blur-xl">
                <IconButton ref={closeButtonRef} label="Zamknij powiększoną mapę" onClick={() => setExpanded(false)}>
                  <CloseIcon size={16} />
                </IconButton>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  )
}
