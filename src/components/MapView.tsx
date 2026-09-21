'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { createRoot, type Root } from 'react-dom/client'
import type { Map as MapLibreMap, Marker as MapLibreMarker } from 'maplibre-gl'
import { trapTab } from '@/lib/focusTrap'
import { MODE_ICON } from './transitMode'
import { ExpandIcon, CloseIcon, MapIcon } from './icons'

export type MapPin = {
  id: string
  lat: number
  lon: number
  label: string
  /** Ikona pinu — klucz `MODE_ICON` (transitMode.tsx, już używane przez `LineBadge`). Brak = neutralny pin lokalizacji. */
  mode?: keyof typeof MODE_ICON
  /** 2-3 gotowe, sformatowane linijki („18:12 → Kutno") — MapView niczego nie liczy, tylko wyświetla. Tylko w powiększonym popupie. */
  preview?: string[]
  /** Link w powiększonym popupie — dziś nieużywany przez wywołujących (byłby linkiem do siebie samego), gotowy na mapę z wieloma przystankami. */
  href?: string
}

const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty'

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
const WORKER_URL = '/maplibre-gl-worker.mjs'

/** Kółko z ikoną trybu zamiast domyślnej łezki MapLibre — `createRoot` do oderwanego diva, zero duplikacji SVG z `icons.tsx`. Kotwica na środku (poprawniejsze niż łezka: punkt = dokładna lokalizacja). */
function createMarkerElement(pin: MapPin): { element: HTMLDivElement; root: Root } {
  const element = document.createElement('div')
  element.className = 'grid h-8 w-8 cursor-pointer place-items-center rounded-full text-white shadow-lg ring-2 ring-white'
  element.style.background = 'var(--accent-gradient)'
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
    link.textContent = 'Zobacz pełną tablicę →'
    link.className = 'mt-1.5 block text-xs font-medium text-indigo-600 dark:text-indigo-400'
    wrap.appendChild(link)
  }

  return wrap
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
  rich: boolean
): () => void {
  let cancelled = false
  let map: MapLibreMap | null = null
  const markers: { marker: MapLibreMarker; root: Root }[] = []

  import('maplibre-gl').then((lib) => {
    if (cancelled) return

    lib.setWorkerUrl(WORKER_URL)
    map = new lib.Map({
      container,
      style: STYLE_URL,
      center: [pins[0].lon, pins[0].lat],
      zoom: pins.length === 1 ? 15 : 13,
    })

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
    for (const { marker, root } of markers) {
      marker.remove()
      root.unmount()
    }
    map?.remove()
  }
}

export function MapView({
  pins,
  onPinClick,
  ariaLabel,
}: {
  pins: MapPin[]
  onPinClick?: (id: string) => void
  ariaLabel: string
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const fullscreenContainerRef = useRef<HTMLDivElement>(null)
  const [expanded, setExpanded] = useState(false)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)

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

  useEffect(() => {
    if (containerRef.current === null || pins.length === 0) return
    return mountMap(containerRef.current, pins, onPinClick, false)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `pinsKey` to celowa sygnatura treści `pins`, patrz komentarz wyżej.
  }, [pinsKey, onPinClick])

  // Powiększona mapa montowana dopiero gdy `expanded` -- kontener istnieje w
  // DOM wyłącznie wtedy (portal niżej), więc efekt musi mieć `expanded` w
  // zależnościach: sama zmiana refa nie wywołuje ponownego uruchomienia.
  useEffect(() => {
    if (!expanded || fullscreenContainerRef.current === null || pins.length === 0) return
    return mountMap(fullscreenContainerRef.current, pins, onPinClick, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- jak wyżej + `expanded` steruje montowaniem.
  }, [expanded, pinsKey, onPinClick])

  // Escape zamyka powiększenie -- ten sam wzorzec co `MobileNav.tsx`.
  useEffect(() => {
    if (!expanded) return
    closeButtonRef.current?.focus()
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
    }
  }, [expanded])

  if (pins.length === 0) return null

  return (
    <>
      <div className="relative">
        <div ref={containerRef} role="region" aria-label={ariaLabel} className="h-64 w-full overflow-hidden rounded-2xl" />
        <button
          type="button"
          onClick={() => setExpanded(true)}
          aria-label="Powiększ mapę"
          className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-lg bg-white/90 text-gray-700 shadow transition hover:bg-white"
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
              <button
                ref={closeButtonRef}
                type="button"
                onClick={() => setExpanded(false)}
                aria-label="Zamknij powiększoną mapę"
                className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-white/90 text-gray-700 shadow transition hover:bg-white"
              >
                <CloseIcon size={16} />
              </button>
            </div>
          </div>,
          document.body
        )}
    </>
  )
}
