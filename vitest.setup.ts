import { afterEach, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { configure } from '@testing-library/react'
import { clearPollingCache } from './src/hooks/pollingCache'

// `AnimatedNumber` (@number-flow/react) trzyma w swoim elemencie zapasowy <span> z tym samym napisem co
// węzeł `sr-only` — bez wykluczenia każde `getByText('+3 min')` trafiałoby w dwa elementy.
configure({ defaultIgnore: 'script, style, number-flow-react span, [data-number-fallback]' })

// jsdom nie ma zarejestrowanego elementu niestandardowego, więc każda ZMIANA wartości (`rerender` z innym
// opóźnieniem) rzuca w bibliotece `this.el.willUpdate is not a function`. Zastępnik zachowuje kształt DOM
// (element + zapasowy <span>), wartość animowanej liczby i jej napis jako zwykły tekst.
vi.mock('@number-flow/react', async () => {
  const { createElement } = await import('react')
  return {
    default: ({ value, prefix = '', suffix = '', ...rest }: { value: number; prefix?: string; suffix?: string }) =>
      createElement('number-flow-react', rest, createElement('span', null, `${prefix}${value}${suffix}`)),
  }
})

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
