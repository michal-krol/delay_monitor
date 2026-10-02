import { afterEach, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { clearPollingCache } from './src/hooks/pollingCache'

// Cache `usePolling` to stan modułu -- każdy test zaczyna od pustego.
afterEach(() => clearPollingCache())

/**
 * Auto-mock globalny -- `maplibre-gl` dotyka `window`/WebGL przy inicjalizacji
 * mapy i nie ma czego robić pod jsdom. Bez tego KAŻDY test renderujący
 * `MapView.tsx` pośrednio (np. `TransitStopDetail.test.tsx`) łapie
 * unhandled rejection z prawdziwej biblioteki. `MapView.test.tsx` nadpisuje
 * to własnym `vi.mock` ze szpiegami, gdy trzeba asercji na wywołaniach.
 */
vi.mock('maplibre-gl', () => ({
  setWorkerUrl: () => {},
  Map: class {
    fitBounds() {}
    remove() {}
  },
  Marker: class {
    setLngLat() {
      return this
    }
    setPopup() {
      return this
    }
    addTo() {
      return this
    }
    remove() {}
  },
  Popup: class {
    setDOMContent() {
      return this
    }
  },
  LngLatBounds: class {
    extend() {
      return this
    }
  },
}))

// jsdom nie implementuje `Element.scrollTo` (przewijanie bez układu) — `BottomSheet` go woła.
if (typeof HTMLElement !== 'undefined' && HTMLElement.prototype.scrollTo === undefined) {
  HTMLElement.prototype.scrollTo = () => {}
}
