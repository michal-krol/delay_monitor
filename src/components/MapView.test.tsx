// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { MapPin, MapRoute } from './MapView'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as maplibregl from 'maplibre-gl'
import { MapView, STYLE_DARK, STYLE_LIGHT } from './MapView'
import { MODE_COLOR, UNKNOWN_COLOR, outlineFilter, strokeFor } from './map/mapData'
import { LINE_PALETTE } from './transitMode'
import { ChevronRightIcon } from './icons'

type PopupMock = { setDOMContent: (node: HTMLElement) => PopupMock; content: HTMLElement | null }

vi.mock('maplibre-gl', () => {
  const marker = {
    setLngLat: vi.fn().mockReturnThis(),
    setPopup: vi.fn().mockReturnThis(),
    addTo: vi.fn().mockReturnThis(),
    remove: vi.fn(),
    getPopup: vi.fn(() => ({ setDOMContent: vi.fn() })),
    setRotation: vi.fn().mockReturnThis(),
  }
  const map = {
    fitBounds: vi.fn(),
    remove: vi.fn(),
    isStyleLoaded: vi.fn(() => true),
    once: vi.fn(),
    getSource: vi.fn(() => undefined),
    addSource: vi.fn(),
    addLayer: vi.fn(),
  }
  // Funkcje zwykłe, nie strzałkowe — `new` na mocku strzałkowym rzuca „not a constructor".
  return {
    setWorkerUrl: vi.fn(),
    Map: vi.fn(function Map() {
      return map
    }),
    Marker: vi.fn(function Marker() {
      return marker
    }),
    Popup: vi.fn(function Popup() {
      const p: PopupMock = { content: null, setDOMContent: (node) => ((p.content = node), p) }
      return p
    }),
    LngLatBounds: vi.fn(function LngLatBounds() {
      return { extend: vi.fn() }
    }),
  }
})

/** Kolor po normalizacji jsdom (hex → `rgb(...)`), żeby porównywać z `MODE_COLOR` wprost. */
function css(color: string): string {
  const probe = document.createElement('div')
  probe.style.backgroundColor = color
  return probe.style.backgroundColor
}

function markerElementAt(callIndex: number): HTMLElement {
  const call = vi.mocked(maplibregl.Marker).mock.calls[callIndex]
  const options = call?.[0]
  if (options === undefined) throw new Error(`Marker nie zostało wywołane dla indeksu ${callIndex}`)
  return options.element as HTMLElement
}

describe('MapView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders nic, gdy brak pinów — nie inicjalizuje mapy', () => {
    const { container } = render(<MapView dark={false} pins={[]} ariaLabel="Mapa" />)
    expect(container).toBeEmptyDOMElement()
    expect(maplibregl.Map).not.toHaveBeenCalled()
  })

  it('wystawia dostępny region dla czytnika ekranu, gdy są piny', () => {
    render(<MapView dark={false} pins={[{ id: 'a', lat: 52.1, lon: 21.0, label: 'Przystanek A' }]} ariaLabel="Mapa przystanku Foo" />)
    expect(screen.getByRole('region', { name: 'Mapa przystanku Foo' })).toBeInTheDocument()
  })

  it('tworzy jeden marker na pin i wyśrodkowuje na pierwszym', async () => {
    render(
      <MapView
        dark={false}
        pins={[
          { id: 'a', lat: 52.1, lon: 21.0, label: 'Przystanek A' },
          { id: 'b', lat: 52.2, lon: 21.1, label: 'Przystanek B' },
        ]}
        ariaLabel="Mapa"
      />
    )

    await waitFor(() => expect(maplibregl.Marker).toHaveBeenCalledTimes(2))
    expect(maplibregl.Map).toHaveBeenCalledTimes(1)
    const mapCall = vi.mocked(maplibregl.Map).mock.calls[0][0]
    expect(mapCall.center).toEqual([21.0, 52.1])
  })

  it('renderuje ikonę trybu w markerze (reużyta z transitMode.tsx, zero duplikacji SVG)', async () => {
    render(<MapView dark={false} pins={[{ id: 'a', lat: 52.1, lon: 21.0, label: 'Tramwaj X', mode: 'tram' }]} ariaLabel="Mapa" />)

    await waitFor(() => expect(maplibregl.Marker).toHaveBeenCalledTimes(1))
    const element = markerElementAt(0)
    // Marker to zamockowany DOM node spoza drzewa renderowanego przez RTL
    // (prawdziwy MapLibre sam wstawiłby go do canvasu mapy) — `screen`/`within` go nie widzą.
    // eslint-disable-next-line testing-library/no-node-access
    await waitFor(() => expect(element.querySelector('svg')).not.toBeNull())
  })

  it('bez `mode` renderuje neutralną ikonę lokalizacji zamiast się wywalać', async () => {
    render(<MapView dark={false} pins={[{ id: 'a', lat: 52.1, lon: 21.0, label: 'Stacja' }]} ariaLabel="Mapa" />)

    await waitFor(() => expect(maplibregl.Marker).toHaveBeenCalledTimes(1))
    const element = markerElementAt(0)
    // eslint-disable-next-line testing-library/no-node-access -- jak wyżej
    await waitFor(() => expect(element.querySelector('svg')).not.toBeNull())
  })

  it('pinezka ma kolor rodzaju środka (MODE_COLOR), jak kropki na mapie miasta', async () => {
    render(<MapView dark={false} pins={[{ id: 'a', lat: 52.1, lon: 21.0, label: 'Tramwaj X', mode: 'tram' }]} ariaLabel="Mapa" />)
    await waitFor(() => expect(maplibregl.Marker).toHaveBeenCalledTimes(1))
    expect(markerElementAt(0).style.backgroundColor).toBe(css(MODE_COLOR.tram))
  })

  it('pinezka z `kind` ma kolor rodzaju linii (autobus nocny = czerń, jak plakietka i trasa), a pierścień z tej samej palety', async () => {
    render(<MapView dark={false} pins={[{ id: 'a', lat: 52.1, lon: 21.0, label: 'Przystanek', mode: 'bus', kind: 'night' }]} ariaLabel="Mapa" />)
    await waitFor(() => expect(maplibregl.Marker).toHaveBeenCalledTimes(1))
    const element = markerElementAt(0)
    expect(element.style.backgroundColor).toBe(css(LINE_PALETTE.night.bg))
    expect(element.style.color).toBe(css(LINE_PALETTE.night.fg))
    expect(element.style.getPropertyValue('--tw-ring-color')).toBe(strokeFor(LINE_PALETTE.night.bg))
  })

  it('pinezka bez `kind` zostaje w kolorze rodzaju środka (mapy przystanków)', async () => {
    render(<MapView dark={false} pins={[{ id: 'a', lat: 52.1, lon: 21.0, label: 'Przystanek', mode: 'bus' }]} ariaLabel="Mapa" />)
    await waitFor(() => expect(maplibregl.Marker).toHaveBeenCalledTimes(1))
    expect(markerElementAt(0).style.backgroundColor).toBe(css(MODE_COLOR.bus))
  })

  it('pinezka bez `mode` ma neutralny kolor', async () => {
    render(<MapView dark={false} pins={[{ id: 'a', lat: 52.1, lon: 21.0, label: 'Stacja' }]} ariaLabel="Mapa" />)
    await waitFor(() => expect(maplibregl.Marker).toHaveBeenCalledTimes(1))
    expect(markerElementAt(0).style.backgroundColor).toBe(css(UNKNOWN_COLOR))
  })

  it('mała mapa: cooperativeGestures z polskimi podpowiedziami (strona przewija się jednym palcem); powiększona — bez', async () => {
    render(<MapView dark={false} pins={[{ id: 'a', lat: 52.1, lon: 21.0, label: 'A' }]} ariaLabel="Mapa" />)
    await waitFor(() => expect(maplibregl.Map).toHaveBeenCalledTimes(1))
    const inline = vi.mocked(maplibregl.Map).mock.calls[0][0]
    expect(inline.cooperativeGestures).toBe(true)
    expect(inline.locale).toEqual({
      'CooperativeGesturesHandler.WindowsHelpText': 'Użyj Ctrl + kółko myszy, aby przybliżyć mapę',
      'CooperativeGesturesHandler.MacHelpText': 'Użyj ⌘ + kółko myszy, aby przybliżyć mapę',
      'CooperativeGesturesHandler.MobileHelpText': 'Przesuwaj mapę dwoma palcami',
    })

    fireEvent.click(screen.getByRole('button', { name: 'Powiększ mapę' }))
    await waitFor(() => expect(maplibregl.Map).toHaveBeenCalledTimes(2))
    expect(vi.mocked(maplibregl.Map).mock.calls[1][0].cooperativeGestures).toBeFalsy()
  })

  it('podkład jak na mapie miasta: jasny bez `dark`, ciemny z `dark`; zmiana motywu montuje mapę od nowa', async () => {
    const pins: MapPin[] = [{ id: 'a', lat: 52.1, lon: 21.0, label: 'A' }]
    const { rerender } = render(<MapView dark={false} pins={pins} ariaLabel="Mapa" />)
    await waitFor(() => expect(maplibregl.Map).toHaveBeenCalledTimes(1))
    expect(vi.mocked(maplibregl.Map).mock.calls[0][0].style).toBe(STYLE_LIGHT)

    rerender(<MapView dark pins={pins} ariaLabel="Mapa" />)
    await waitFor(() => expect(maplibregl.Map).toHaveBeenCalledTimes(2))
    expect(vi.mocked(maplibregl.Map).mock.calls[1][0].style).toBe(STYLE_DARK)
    expect(vi.mocked(maplibregl.Map).mock.results[0].value.remove).toHaveBeenCalled()
  })

  it('przemontowanie (zmiana motywu) nie odmontowuje korzeni ikon pinów w trakcie renderu Reacta', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const pins: MapPin[] = [{ id: 'a', lat: 52.1, lon: 21.0, label: 'A', mode: 'tram' }]
    const { rerender } = render(<MapView dark={false} pins={pins} ariaLabel="Mapa" />)
    await waitFor(() => expect(maplibregl.Marker).toHaveBeenCalledTimes(1))
    rerender(<MapView dark pins={pins} ariaLabel="Mapa" />)
    await waitFor(() => expect(maplibregl.Marker).toHaveBeenCalledTimes(2))
    expect(consoleError.mock.calls.flat().join(' ')).not.toContain('synchronously unmount a root')
    consoleError.mockRestore()
  })

  it('klik na pin woła onPinClick z jego id', async () => {
    const onPinClick = vi.fn()
    render(<MapView dark={false} pins={[{ id: 'stop-1', lat: 52.1, lon: 21.0, label: 'Przystanek 1' }]} onPinClick={onPinClick} ariaLabel="Mapa" />)

    await waitFor(() => expect(maplibregl.Marker).toHaveBeenCalledTimes(1))
    markerElementAt(0).dispatchEvent(new MouseEvent('click', { bubbles: true }))

    expect(onPinClick).toHaveBeenCalledWith('stop-1')
  })

  it('nie przeinicjalizowuje mapy, gdy `pins` to nowa referencja o tej samej treści (poller tablicy odświeża co ~30s)', async () => {
    const pinsA: MapPin[] = [{ id: 'a', lat: 52.1, lon: 21.0, label: 'Przystanek A' }]
    const { rerender } = render(<MapView dark={false} pins={pinsA} ariaLabel="Mapa" />)
    await waitFor(() => expect(maplibregl.Map).toHaveBeenCalledTimes(1))

    // Nowa tablica, identyczna treść -- tak jak po kolejnym pollu w TransitStopDetail/StationAside.
    const pinsB: MapPin[] = [{ id: 'a', lat: 52.1, lon: 21.0, label: 'Przystanek A' }]
    rerender(<MapView dark={false} pins={pinsB} ariaLabel="Mapa" />)

    expect(maplibregl.Map).toHaveBeenCalledTimes(1)
    expect(vi.mocked(maplibregl.Map).mock.results[0]?.value.remove).not.toHaveBeenCalled()
  })

  describe('trasa i ruchome punkty (mapa linii)', () => {
    const PIN: MapPin = { id: 'a', lat: 52, lon: 21, label: 'A' }
    const ROUTE: MapRoute = { points: [{ lat: 52, lon: 21 }, { lat: 52.01, lon: 21.02 }], mode: 'metro', kind: 'regular' }

    /** Kolor trasy i obwódki pod nią (kolejność: trasa, potem obwódka wstawiona `przed` trasą). */
    async function lineColors(route: MapRoute): Promise<{ line: string; casing: string }> {
      render(<MapView dark={false} pins={[PIN]} route={route} ariaLabel="Mapa" />)
      await waitFor(() => expect(maplibregl.Map).toHaveBeenCalledTimes(1))
      const map = vi.mocked(maplibregl.Map).mock.results[0].value
      await waitFor(() => expect(map.addLayer).toHaveBeenCalledTimes(2))
      expect(map.addLayer.mock.calls[1][1]).toBe('route')
      return { line: map.addLayer.mock.calls[0][0].paint['line-color'], casing: map.addLayer.mock.calls[1][0].paint['line-color'] }
    }

    it('rysuje trasę jako linię po punktach (lon, lat); metro w kolorze metra z palety, z ciemną obwódką', async () => {
      expect(await lineColors(ROUTE)).toEqual({ line: MODE_COLOR.metro, casing: LINE_PALETTE.metro.fg })
      const map = vi.mocked(maplibregl.Map).mock.results[0].value
      expect(map.addSource.mock.calls[0][1].data.geometry.coordinates).toEqual([[21, 52], [21.02, 52.01]])
    })

    it('styl jeszcze niezaładowany: trasa czeka na `style.load` (nie `load`, który czeka na kafle i bywa, że nie przychodzi)', async () => {
      // Mock zwraca zawsze ten sam obiekt mapy — sięgamy po niego przed renderem.
      const map = new (maplibregl.Map as unknown as new () => { isStyleLoaded: ReturnType<typeof vi.fn>; once: ReturnType<typeof vi.fn>; addLayer: ReturnType<typeof vi.fn> })()
      vi.mocked(maplibregl.Map).mockClear()
      map.isStyleLoaded.mockReturnValueOnce(false)
      render(<MapView dark={false} pins={[PIN]} route={ROUTE} ariaLabel="Mapa" />)
      await waitFor(() => expect(map.once).toHaveBeenCalledWith('style.load', expect.any(Function)))
      expect(map.addLayer).not.toHaveBeenCalled()
      map.once.mock.calls.find((call: unknown[]) => call[0] === 'style.load')![1]()
      expect(map.addLayer).toHaveBeenCalledTimes(2)
    })

    it('na ciemnym podkładzie obwódka trasy metra jest biała (ciemnoczerwona brudziłaby żółć na pomarańcz)', async () => {
      render(<MapView dark pins={[PIN]} route={ROUTE} ariaLabel="Mapa" />)
      await waitFor(() => expect(maplibregl.Map).toHaveBeenCalledTimes(1))
      const map = vi.mocked(maplibregl.Map).mock.results[0].value
      await waitFor(() => expect(map.addLayer).toHaveBeenCalledTimes(2))
      expect(map.addLayer.mock.calls[0][0].paint['line-color']).toBe(MODE_COLOR.metro)
      expect(map.addLayer.mock.calls[1][0].paint['line-color']).toBe('#ffffff')
    })

    it('tramwaj: kolor rodzaju z palety, biała obwódka — jak na mapie miasta', async () => {
      expect(await lineColors({ ...ROUTE, mode: 'tram' })).toEqual({ line: MODE_COLOR.tram, casing: '#ffffff' })
    })

    it('kolej (pociąg PKP, bez rodzaju linii): kolor rodzaju', async () => {
      expect((await lineColors({ ...ROUTE, mode: 'rail' })).line).toBe(MODE_COLOR.rail)
    })

    it('autobus nocny: kolor rodzaju linii, jak plakietka', async () => {
      expect((await lineColors({ ...ROUTE, mode: 'bus', kind: 'night' })).line).toBe(LINE_PALETTE.night.bg)
    })

    it('bez `route` nie dodaje warstwy', async () => {
      render(<MapView dark={false} pins={[PIN]} ariaLabel="Mapa" />)
      await waitFor(() => expect(maplibregl.Marker).toHaveBeenCalledTimes(1))
      expect(vi.mocked(maplibregl.Map).mock.results[0].value.addLayer).not.toHaveBeenCalled()
    })

    it('pojazdy: marker per pojazd, aktualizacja w miejscu bez przebudowy mapy, usunięcie po zniknięciu', async () => {
      const mover = { id: 'v1', lat: 52.001, lon: 21.001, label: '#1', mode: 'tram' as const, kind: 'regular' as const, bearing: null }
      const { rerender } = render(<MapView dark={false} pins={[PIN]} movers={[mover]} ariaLabel="Mapa" />)
      // 1 pin + 1 pojazd
      await waitFor(() => expect(maplibregl.Marker).toHaveBeenCalledTimes(2))
      const marker = vi.mocked(maplibregl.Marker).mock.results[0].value

      marker.setLngLat.mockClear()
      rerender(<MapView dark={false} pins={[PIN]} movers={[{ ...mover, lat: 52.002 }]} ariaLabel="Mapa" />)
      expect(maplibregl.Marker).toHaveBeenCalledTimes(2)
      expect(maplibregl.Map).toHaveBeenCalledTimes(1)
      expect(marker.setLngLat).toHaveBeenCalledWith([21.001, 52.002])

      marker.remove.mockClear()
      rerender(<MapView dark={false} pins={[PIN]} movers={[]} ariaLabel="Mapa" />)
      expect(marker.remove).toHaveBeenCalledTimes(1)
    })

    it('pojazd metra: kropka, pierścień i strzałka mają ciemnoczerwony obrys (żółć bez niego ~1,3:1 na jasnym podkładzie)', async () => {
      const mover = { id: 'm1', lat: 52.001, lon: 21.001, label: '#1', mode: 'metro' as const, kind: 'regular' as const, bearing: 90 }
      render(<MapView dark={false} pins={[PIN]} movers={[mover]} ariaLabel="Mapa" />)
      await waitFor(() => expect(maplibregl.Marker).toHaveBeenCalledTimes(2))
      const element = vi.mocked(maplibregl.Marker).mock.calls[0][0]?.element as HTMLElement
      // eslint-disable-next-line testing-library/no-node-access -- marker spoza drzewa RTL
      const [dot, arrow] = [element.querySelector<HTMLElement>('[data-part="dot"]'), element.querySelector<HTMLElement>('[data-part="arrow"]')]
      expect(dot?.style.getPropertyValue('--tw-ring-color')).toBe(LINE_PALETTE.metro.fg)
      expect(arrow?.style.filter).toBe(outlineFilter(MODE_COLOR.metro))
      expect(arrow?.style.filter).toContain(LINE_PALETTE.metro.fg)
    })

    it('pojazd: kropka w kolorze rodzaju, strzałka kierunku obrócona wg `bearing` (jak na mapie miasta)', async () => {
      const mover = { id: 'v1', lat: 52.001, lon: 21.001, label: '#1', mode: 'tram' as const, kind: 'regular' as const, bearing: 90 }
      const { rerender } = render(<MapView dark={false} pins={[PIN]} movers={[mover]} ariaLabel="Mapa" />)
      await waitFor(() => expect(maplibregl.Marker).toHaveBeenCalledTimes(2))
      const options = vi.mocked(maplibregl.Marker).mock.calls[0][0]
      const element = options?.element as HTMLElement
      expect(element.dataset.testid).toBe('map-mover')
      expect(options?.rotation).toBe(90)
      expect(options?.rotationAlignment).toBe('map')
      // eslint-disable-next-line testing-library/no-node-access -- marker spoza drzewa RTL
      const [dot, arrow] = [element.querySelector<HTMLElement>('[data-part="dot"]'), element.querySelector<HTMLElement>('[data-part="arrow"]')]
      expect(dot?.style.backgroundColor).toBe(css(MODE_COLOR.tram))
      expect(arrow?.hidden).toBe(false)
      // Ta sama strzałka co `VehicleHeadingIcon` i warstwa `vehicles-arrows` (Lucide navigation-2), nie trójkąt z obramowań.
      // eslint-disable-next-line testing-library/no-node-access -- marker spoza drzewa RTL
      expect(arrow?.querySelector('svg')).toHaveAttribute('fill', MODE_COLOR.tram)
      // Glif zajmuje ~58% szerokości siatki — pudełko 16 px daje grot ~9×13 px, jak dawny trójkąt 10×8, nie zmniejszony do ~7 px.
      // eslint-disable-next-line testing-library/no-node-access -- marker spoza drzewa RTL
      expect(arrow?.querySelector('svg')).toHaveAttribute('width', '16')

      const marker = vi.mocked(maplibregl.Marker).mock.results[0].value
      rerender(<MapView dark={false} pins={[PIN]} movers={[{ ...mover, bearing: 180 }]} ariaLabel="Mapa" />)
      expect(marker.setRotation).toHaveBeenLastCalledWith(180)

      // Brak kierunku w feedzie (albo pociąg szacowany wg rozkładu) = sama kropka.
      rerender(<MapView dark={false} pins={[PIN]} movers={[{ ...mover, bearing: null }]} ariaLabel="Mapa" />)
      expect(arrow?.hidden).toBe(true)
    })
  })

  it('ustawia workerUrl na własny statyczny asset przed konstrukcją mapy', async () => {
    render(<MapView dark={false} pins={[{ id: 'a', lat: 52.1, lon: 21.0, label: 'Przystanek A' }]} ariaLabel="Mapa" />)

    await waitFor(() => expect(maplibregl.Map).toHaveBeenCalledTimes(1))
    // Bez tego `new Worker("", {type:"module"})` w buildzie produkcyjnym --
    // patrz komentarz w MapView.tsx. Musi się wykonać PRZED `new Map(...)`.
    expect(maplibregl.setWorkerUrl).toHaveBeenCalledWith('/maplibre-gl-worker.mjs')
    const workerCallOrder = vi.mocked(maplibregl.setWorkerUrl).mock.invocationCallOrder[0]
    const mapCallOrder = vi.mocked(maplibregl.Map).mock.invocationCallOrder[0]
    expect(workerCallOrder).toBeLessThan(mapCallOrder)
  })

  it('mini popup pokazuje sam label, bez `preview`/`href` nawet gdy podane', async () => {
    render(
      <MapView
        dark={false}
        pins={[{ id: 'a', lat: 52.1, lon: 21.0, label: 'Centrum 02', preview: ['18:12 → Kutno'], href: '/station/1' }]}
        ariaLabel="Mapa"
      />
    )

    await waitFor(() => expect(maplibregl.Popup).toHaveBeenCalledTimes(1))
    const content = vi.mocked(maplibregl.Popup).mock.results[0].value.content as HTMLElement
    expect(content.textContent).toContain('Centrum 02')
    expect(content.textContent).not.toContain('Kutno')
    // `content` to węzeł przechwycony z zamockowanego `Popup.setDOMContent`, nigdy nie
    // trafia do drzewa renderowanego przez RTL -- prawdziwy MapLibre wstawiłby go do popupu.
    // eslint-disable-next-line testing-library/no-node-access
    expect(content.querySelector('a')).toBeNull()
  })

  describe('powiększenie na pełny ekran', () => {
    const PIN: MapPin = { id: 'a', lat: 52.1, lon: 21.0, label: 'Centrum 02', preview: ['18:12 → Kutno', '18:20 → Łódź'], href: '/station/1' }

    it('przycisk „Powiększ mapę" otwiera dialog i montuje drugą mapę z bogatym popupem', async () => {
      const user = userEvent.setup()
      render(<MapView dark={false} pins={[PIN]} ariaLabel="Mapa przystanku Centrum" />)
      await waitFor(() => expect(maplibregl.Map).toHaveBeenCalledTimes(1))

      await user.click(screen.getByRole('button', { name: 'Powiększ mapę' }))

      const dialog = screen.getByRole('dialog', { name: 'Mapa przystanku Centrum' })
      expect(dialog).toBeInTheDocument()
      await waitFor(() => expect(maplibregl.Map).toHaveBeenCalledTimes(2))

      const richContent = vi.mocked(maplibregl.Popup).mock.results.at(-1)?.value.content as HTMLElement
      expect(richContent.textContent).toContain('Centrum 02')
      expect(richContent.textContent).toContain('18:12 → Kutno')
      // eslint-disable-next-line testing-library/no-node-access -- jak w teście mini popupu wyżej
      expect(richContent.querySelector('a')).toHaveAttribute('href', '/station/1')
    })

    it('link w popupie ma ikonę chevron (SVG z createElementNS, aria-hidden), a nie tekstowe „→”', async () => {
      const user = userEvent.setup()
      render(<MapView dark={false} pins={[PIN]} ariaLabel="Mapa" />)
      await user.click(screen.getByRole('button', { name: 'Powiększ mapę' }))
      await waitFor(() => expect(maplibregl.Map).toHaveBeenCalledTimes(2))
      const richContent = vi.mocked(maplibregl.Popup).mock.results.at(-1)?.value.content as HTMLElement
      // eslint-disable-next-line testing-library/no-node-access -- jak wyżej: węzeł poza drzewem RTL
      const link = richContent.querySelector('a') as HTMLAnchorElement
      expect(link.textContent).toBe('Zobacz pełną tablicę')
      expect(link.textContent).not.toContain('→')
      // eslint-disable-next-line testing-library/no-node-access
      const svg = link.querySelector('svg[aria-hidden="true"]')
      expect(svg).not.toBeNull()
      expect(svg?.namespaceURI).toBe('http://www.w3.org/2000/svg')
      // Ten sam glif co `ChevronRightIcon` (jedno źródło ikon), nie kopia ścieżki.
      const { container } = render(<ChevronRightIcon />)
      // eslint-disable-next-line testing-library/no-node-access, testing-library/no-container
      expect(svg?.querySelector('path')?.getAttribute('d')).toBe(container.querySelector('path')?.getAttribute('d'))
    })

    it.each([
      ['Escape', async (user: ReturnType<typeof userEvent.setup>) => user.keyboard('{Escape}')],
      ['tło', async (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByTestId('map-fullscreen-backdrop'))],
      ['przycisk ✕', async (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByRole('button', { name: 'Zamknij powiększoną mapę' }))],
    ])('po zamknięciu (%s) fokus wraca na „Powiększ mapę"', async (_name, close) => {
      const user = userEvent.setup()
      render(<MapView dark={false} pins={[PIN]} ariaLabel="Mapa" />)
      const opener = screen.getByRole('button', { name: 'Powiększ mapę' })
      await user.click(opener)
      expect(screen.getByRole('button', { name: 'Zamknij powiększoną mapę' })).toHaveFocus()
      await close(user)
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(opener).toHaveFocus()
    })

    it('Escape zamyka dialog i odmontowuje powiększoną mapę', async () => {
      const user = userEvent.setup()
      render(<MapView dark={false} pins={[PIN]} ariaLabel="Mapa" />)
      await user.click(screen.getByRole('button', { name: 'Powiększ mapę' }))
      await waitFor(() => expect(maplibregl.Map).toHaveBeenCalledTimes(2))
      const fullscreenMap = vi.mocked(maplibregl.Map).mock.results[1].value

      await user.keyboard('{Escape}')

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(fullscreenMap.remove).toHaveBeenCalled()
    })

    it('zamknięcie powiększonej mapy to wspólny IconButton', async () => {
      const user = userEvent.setup()
      render(<MapView dark={false} pins={[PIN]} ariaLabel="Mapa" />)
      await user.click(screen.getByRole('button', { name: 'Powiększ mapę' }))
      expect(screen.getByRole('button', { name: 'Zamknij powiększoną mapę' })).toHaveClass('border-surface-border')
    })

    it('klik w tło zamyka dialog', async () => {
      const user = userEvent.setup()
      render(<MapView dark={false} pins={[PIN]} ariaLabel="Mapa" />)
      await user.click(screen.getByRole('button', { name: 'Powiększ mapę' }))
      expect(screen.getByRole('dialog')).toBeInTheDocument()

      await user.click(screen.getByTestId('map-fullscreen-backdrop'))

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })
})

describe('public/maplibre-gl-worker.mjs + maplibre-gl-shared.mjs (wendorowane kopie)', () => {
  // ponytail: brak automatycznego kopiowania przy buildzie -- to jedyny
  // strażnik przed cichym rozjazdem po `npm update maplibre-gl`. Jeśli któryś
  // padnie: `npm run vendor:maplibre` (kopiuje oba pliki z node_modules do public/).
  it.each(['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs'])('%s jest bajt-w-bajt tym samym plikiem co w node_modules', async (file) => {
    const { readFile } = await import('node:fs/promises')
    const path = await import('node:path')
    const { createRequire } = await import('node:module')
    // Rozwiązywanie modułu, nie `process.cwd()/node_modules` -- w worktree agenta
    // node_modules leży w głównym checkoucie, wyżej w drzewie.
    const pkgDir = path.dirname(createRequire(import.meta.url).resolve('maplibre-gl/package.json'))
    const [vendored, source] = await Promise.all([
      readFile(path.join(process.cwd(), 'public', file), 'utf-8'),
      readFile(path.join(pkgDir, 'dist', file), 'utf-8'),
    ])
    expect(vendored).toBe(source)
  })
})
