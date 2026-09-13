// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { MapPin } from './MapView'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as maplibregl from 'maplibre-gl'
import { MapView } from './MapView'

type PopupMock = { setDOMContent: (node: HTMLElement) => PopupMock; content: HTMLElement | null }

vi.mock('maplibre-gl', () => {
  const marker = {
    setLngLat: vi.fn().mockReturnThis(),
    setPopup: vi.fn().mockReturnThis(),
    addTo: vi.fn().mockReturnThis(),
    remove: vi.fn(),
  }
  const map = { fitBounds: vi.fn(), remove: vi.fn() }
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
    const { container } = render(<MapView pins={[]} ariaLabel="Mapa" />)
    expect(container).toBeEmptyDOMElement()
    expect(maplibregl.Map).not.toHaveBeenCalled()
  })

  it('wystawia dostępny region dla czytnika ekranu, gdy są piny', () => {
    render(<MapView pins={[{ id: 'a', lat: 52.1, lon: 21.0, label: 'Słupek A' }]} ariaLabel="Mapa przystanku Foo" />)
    expect(screen.getByRole('region', { name: 'Mapa przystanku Foo' })).toBeInTheDocument()
  })

  it('tworzy jeden marker na pin i wyśrodkowuje na pierwszym', async () => {
    render(
      <MapView
        pins={[
          { id: 'a', lat: 52.1, lon: 21.0, label: 'Słupek A' },
          { id: 'b', lat: 52.2, lon: 21.1, label: 'Słupek B' },
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
    render(<MapView pins={[{ id: 'a', lat: 52.1, lon: 21.0, label: 'Tramwaj X', mode: 'tram' }]} ariaLabel="Mapa" />)

    await waitFor(() => expect(maplibregl.Marker).toHaveBeenCalledTimes(1))
    const element = markerElementAt(0)
    // Marker to zamockowany DOM node spoza drzewa renderowanego przez RTL
    // (prawdziwy MapLibre sam wstawiłby go do canvasu mapy) — `screen`/`within` go nie widzą.
    // eslint-disable-next-line testing-library/no-node-access
    await waitFor(() => expect(element.querySelector('svg')).not.toBeNull())
  })

  it('bez `mode` renderuje neutralną ikonę lokalizacji zamiast się wywalać', async () => {
    render(<MapView pins={[{ id: 'a', lat: 52.1, lon: 21.0, label: 'Stacja' }]} ariaLabel="Mapa" />)

    await waitFor(() => expect(maplibregl.Marker).toHaveBeenCalledTimes(1))
    const element = markerElementAt(0)
    // eslint-disable-next-line testing-library/no-node-access -- jak wyżej
    await waitFor(() => expect(element.querySelector('svg')).not.toBeNull())
  })

  it('klik na pin woła onPinClick z jego id', async () => {
    const onPinClick = vi.fn()
    render(<MapView pins={[{ id: 'slupek-1', lat: 52.1, lon: 21.0, label: 'Słupek 1' }]} onPinClick={onPinClick} ariaLabel="Mapa" />)

    await waitFor(() => expect(maplibregl.Marker).toHaveBeenCalledTimes(1))
    markerElementAt(0).dispatchEvent(new MouseEvent('click', { bubbles: true }))

    expect(onPinClick).toHaveBeenCalledWith('slupek-1')
  })

  it('nie przeinicjalizowuje mapy, gdy `pins` to nowa referencja o tej samej treści (poller tablicy odświeża co ~30s)', async () => {
    const pinsA: MapPin[] = [{ id: 'a', lat: 52.1, lon: 21.0, label: 'Słupek A' }]
    const { rerender } = render(<MapView pins={pinsA} ariaLabel="Mapa" />)
    await waitFor(() => expect(maplibregl.Map).toHaveBeenCalledTimes(1))

    // Nowa tablica, identyczna treść -- tak jak po kolejnym pollu w TransitStopDetail/StationAside.
    const pinsB: MapPin[] = [{ id: 'a', lat: 52.1, lon: 21.0, label: 'Słupek A' }]
    rerender(<MapView pins={pinsB} ariaLabel="Mapa" />)

    expect(maplibregl.Map).toHaveBeenCalledTimes(1)
    expect(vi.mocked(maplibregl.Map).mock.results[0]?.value.remove).not.toHaveBeenCalled()
  })

  it('ustawia workerUrl na własny statyczny asset przed konstrukcją mapy', async () => {
    render(<MapView pins={[{ id: 'a', lat: 52.1, lon: 21.0, label: 'Słupek A' }]} ariaLabel="Mapa" />)

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
      render(<MapView pins={[PIN]} ariaLabel="Mapa przystanku Centrum" />)
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

    it('Escape zamyka dialog i odmontowuje powiększoną mapę', async () => {
      const user = userEvent.setup()
      render(<MapView pins={[PIN]} ariaLabel="Mapa" />)
      await user.click(screen.getByRole('button', { name: 'Powiększ mapę' }))
      await waitFor(() => expect(maplibregl.Map).toHaveBeenCalledTimes(2))
      const fullscreenMap = vi.mocked(maplibregl.Map).mock.results[1].value

      await user.keyboard('{Escape}')

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(fullscreenMap.remove).toHaveBeenCalled()
    })

    it('klik w tło zamyka dialog', async () => {
      const user = userEvent.setup()
      render(<MapView pins={[PIN]} ariaLabel="Mapa" />)
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
  // padnie: `cp node_modules/maplibre-gl/dist/maplibre-gl-{worker,shared}.mjs public/`.
  it.each(['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs'])('%s jest bajt-w-bajt tym samym plikiem co w node_modules', async (file) => {
    const { readFile } = await import('node:fs/promises')
    const path = await import('node:path')
    const [vendored, source] = await Promise.all([
      readFile(path.join(process.cwd(), 'public', file), 'utf-8'),
      readFile(path.join(process.cwd(), 'node_modules/maplibre-gl/dist', file), 'utf-8'),
    ])
    expect(vendored).toBe(source)
  })
})
