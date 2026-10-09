---
paths:
  - "src/components/*Map*"
  - "src/components/map/**"
  - "src/lib/board/mapPosition.ts"
  - "src/components/StationThumb*"
  - "src/components/BottomSheet*"
  - "src/components/InfoSheet*"
  - "public/maplibre-*"
  - "src/app/globals.css"
  - "e2e/map.spec.ts"
  - "next.config*"
  - "src/lib/weather/**"
  - "data/**"
  - "scripts/**"
  - "src/app/api/train/**"
  - "src/app/**/city/**/map/**"
---

# #6 Network only at the edges — and the map exception with its traps

All HTTP lives in edge clients: `src/lib/pkp/client.ts` (PKP), `src/lib/weather/client.ts`
(Open-Meteo, keyless) and the GTFS feed clients `src/lib/gtfs/client.ts` (static feed, range
requests), `vehicleClient.ts` and `alertClient.ts` (live JSON feeds). Domain logic (`lib/board/`,
`lib/weather/format.ts`) = pure functions over the `PkpClient` interface or a plain payload,
not over `fetch`. Tests need neither network nor key — keep it that way. New source = new edge
client. Live/mock selection happens once, at startup, in `lib/board/instance.ts`.

Station coordinates (weather, maps): static `data/station-coordinates.json` (regenerate with
`scripts/stations-from-gtfs.mjs`, matched by PKP ID; fallback: `enrich-station-coords.mjs` —
`city-fallback` is the town centroid, not the station position), included in the image
(`.next/standalone`). Two
consumers, two different degradations for a missing station: `/api/weather` returns
`available:false` (**cached, not an error**); `/api/train` (`attachStopCoordinates()` in
`src/app/api/train/coordinates.ts`) simply doesn't add `lat`/`lon` to the stop
(`.catch(() => null)` — a file-read failure doesn't break the whole `/api/train`, only the map
enrichment).

## Colours on the map

Every map colour (pins, vehicles, route and backbone lines) comes from `lineColor()` /
`MODE_COLOR` (`adr/0005`, `gtfs.md`), never from the feed. Yellow metro: every outline,
casing, ring and arrow outline goes through `strokeFor()` / `casingFor()` in `mapData.ts`
(one rule). On the dark basemap casings are translucent white — a dark-red casing tints the
yellow orange there.

## Exception: map tiles

`MapView.tsx` (MapLibre GL JS + `tiles.openfreemap.org`, free, no key/limit, ODbL) is the only
case in the project of the browser talking directly to a foreign origin — deliberately,
self-hosting a tile pyramid is beyond this project's scale. `next.config.ts` (`connect-src`,
`worker-src`) allows exactly this one host; `next.config.test.ts` guards that it is the ONLY
foreign origin in the CSP. Don't "fix" this with a server-side tile proxy — it is not an
oversight.

## Don't remove `color-scheme: light`/`dark` in `:root`/`.dark` (`860dc57`)

Without it axe-core (contrast) walks up the tree looking for an opaque `background-color`,
finds none (the app background is a `background-image` gradient, `.glass`/`.glass-strong` are
deliberately translucent), and computes contrast against the browser's default WHITE canvas —
a false a11y alarm on every element sitting only on glass in dark mode (caught on the city tile
map in dark mode, but the risk is general, not map-only).

## Trap 1: MapLibre worker in production builds

MapLibre ESM creates its Web Worker via an `import.meta.url` read of `maplibre-gl-worker.mjs`
from the npm package — webpack (Next.js production build, NOT `next dev`) resolves it to an
empty string, so `new Worker("", {type:"module"})` requests the current HTML page instead of
the script. Effect: pins and attribution render normally (positioned synchronously from
`center`/`zoom` at `new Map()`), but tiles never draw — the canvas stays empty, with no console
error except one cryptic "non-JavaScript MIME type". Only `npm run build && npm run start` /
a real deploy catches it, never `next dev` — it reached production unnoticed in local QA once.

Fix: `public/maplibre-gl-worker.mjs` + `public/maplibre-gl-shared.mjs` (the worker statically
imports the latter) as vendored, byte-for-byte copies from `node_modules/maplibre-gl/dist/`,
plus `maplibregl.setWorkerUrl('/maplibre-gl-worker.mjs')` BEFORE the first `new Map()`.
`MapView.test.tsx` guards that the copies match `node_modules` on dependency updates —
after every maplibre-gl bump (Dependabot included) run `npm run vendor:maplibre` and commit;
`e2e/map.spec.ts` really renders tiles (not just pins) and measures the canvas PNG size —
`toDataURL`/`readPixels` without `preserveDrawingBuffer` can return a transparent read despite
correct drawing, so **never verify map rendering via raw WebGL buffer reads** — only via a
screenshot/locator (compositor, not buffer).

## Trap 2 and 3: popups (`MapView.tsx`, both once broke the pin popup)

- **`Marker` toggles its own popup** — `_onMapClick`, registered in `addTo()`, listens to
  `click` on the whole map. Don't call `marker.togglePopup()` from your own listener on the pin
  element: a double toggle = the popup opens and immediately closes.
- **`pinsKey` = only `id:lat:lon:label`** — no `preview`/`href`/`mode`. Clicking a GTFS pin
  selects a stop → refetch → `preview` changes; if it were in the key, the map would
  re-initialize mid-click and destroy the fresh popup. Same for `routeKey`
  (`points.length:color`) — a content signature, not the whole object.

## Trap 4: container positioning (transport map, today `map/TransitMap.tsx`, `d41b99a`+1)

The map container must NOT be positioned with `absolute inset-0` directly on the element passed
to `new Map({container})`. MapLibre adds the class `maplibregl-map`, and `maplibre-gl.css`
(`globals.css`, `@import` WITHOUT `@layer`) sits outside any named cascade layer — such
unlayered CSS beats EVERY layered Tailwind rule (including `@layer utilities`), regardless of
file order. `.maplibregl-map{position:relative}` thus overrides `absolute`, `inset-0` stops
working, the container gets height `0` — in a desktop `flex-row` `align-items:stretch` masks
it, in the phone `flex-col` (`(app)/layout.tsx`) it doesn't.

Fix: an outer plain `<div className="absolute inset-0">` (no MapLibre class) as the parent,
the map container inside with `h-full w-full` — one level of percentage height from an
explicitly positioned ancestor works, and MapLibre still gets `position:relative` without
conflict. Applies to EVERY new component mounting a map outside `MapView.tsx` (that one doesn't
suffer, its containers have explicit height `h-64`/`inset-4`, not `absolute inset-0` on the
MapLibre element itself).

## Bottom sheet over the map (phones, PR3)

Below `sm` every transport-map panel renders inside `src/components/BottomSheet.tsx`: a
`pointer-events: none` scroll-snap container laid over the map, a transparent spacer and an
opaque `pointer-events: auto` panel; snap markers at 25/55/90 % of the map area (CSS
`.bottom-sheet*` in `globals.css`). The transparent part passes gestures to MapLibre, dragging
the panel scrolls the container. Rules:

- Dialog semantics, „×”, Escape and focus return live in `PanelFrame` inside the sheet — never
  add a second dialog/close to the sheet.
- Content adapts through `useInSheet()` (context from `BottomSheet`), not props: `PanelFrame`
  drops its glass card and marks its body `data-sheet-scroll`, `AlertBanner` collapses into
  „Komunikaty (n)”.
- Map controls rise above the sheet only while something in them is expanded
  (`has-[[aria-expanded=true]]:z-30`); a new dropdown there needs `aria-expanded` on its trigger.
- Inner scrolling (`[data-sheet-scroll]` = `PanelFrame` body) is locked below `full`, otherwise
  a drag scrolls the content instead of lifting the sheet. New scrollable panel content must
  use the `PanelFrame` body or carry `data-sheet-scroll`.
- A new object remounts the sheet (`key`) so it opens at `initialSnap` (default `peek`).
- Things that must stay visible over the open sheet (filter chips, `role=status` messages) go in
  the `above` slot: it rides on the panel's top edge and scrolls with it. At `full` only about
  one row fits (~55 px on iPhone 15) — put the most important item last (nearest the edge).
- Board pages' „Info” and the `WeatherChip` sheet are NOT this sheet: `InfoSheet`
  (`src/components/InfoSheet.tsx`) is a native modal `<dialog>` from the bottom (`adr/0009-modalne-info.md`):
  no gestures to pass through, so background inert + scroll lock. Close paths (×, Escape via `cancel`,
  backdrop) call `onClose` directly — never rely on the `close` event (the Claude in-app browser
  never fired it). Content adapts through `useInInfoSheet()`; `InfoSection collapsible` = `<details>`
  mounting its content only when open (the board map is lazy). Never put `BottomSheet`/`PanelFrame` in it.
- `MapView`'s enlarged map portals into the nearest `<dialog>` (else `body`): outside a modal dialog
  everything is inert. `dialog.info-sheet` keeps `translate: none` (entry is a keyframe animation) —
  a `translate` makes the dialog the containing block of the `fixed` overlay.
- Gestures are verified in e2e only on mobile-chromium (CDP touch); WebKit in Playwright has
  no touch API — iOS momentum/drag needs click-QA on a real iPhone (staging).
- Inline maps (`MapView` without `rich`) use `cooperativeGestures` with Polish strings so they
  don't trap page scroll; the enlarged dialog map keeps normal gestures.
