---
paths:
  - "src/components/**"
  - "src/hooks/**"
  - "src/app/globals.css"
  - "src/app/(app)/**"
  - "e2e/motion.spec.ts"
---

# Motion and glass (PR6)

Why: `adr/0007-efekty-ruchu.md`. Native first (View Transitions, CSS scroll-driven animation,
`@starting-style`); two small MIT dependencies only where native cannot do it.

## One source per effect

- **Rolling numbers:** `AnimatedNumber` (`@number-flow/react`, its only importer, loaded lazily via
  `lazy`+`Suspense`: the number is plain text (`data-number-fallback`, same box as the element) until the chunk
  arrives — eager import cost ~100–250 ms LCP on the stop page). Visible digits are
  `aria-hidden`; the text for assistive tech and `getByText` is a separate `sr-only` node. Only digits
  animate: `parseDisplayNumber()` turns a display string into parts, anything else („brak danych”, „—”,
  `null`) stays plain text — unknown never becomes `0` (#7). jsdom has no custom element, so
  `vitest.setup.ts` mocks the library (it threw on every value change) and tells Testing Library to ignore
  `number-flow-react span`.
- **Rows:** `useRowAnimation()` (`@formkit/auto-animate`, its only importer, dynamic `import()` inside the ref
  callback, cancelled if the element unmounts first): enter fade, instant remove,
  160 ms move, zero duration above 60 children. Attach to the list/`tbody`, never to something that is
  swapped wholesale.
- **Page transitions:** `NavTransition` (in `PageShell`), `PlaceTitle`, `TabCrossfade`; constants and
  `placeTransitionName()` in `src/lib/navTransition.ts`. Direction is chosen by OUR code: deeper =
  `NAV_FORWARD_OPTIONS` (`router.push`), parent = `NAV_BACK_TYPES` (`<Link>`), bottom nav/sidebar =
  `NAV_TAB_TYPES`. `router.back()`/browser back carry no type and do not slide.
- **Glass:** `glass-chrome` / `glass-chrome-strong` only on floating chrome (header, bottom nav, sidebar, map
  controls and menus, offline pill; sheet panels are 94 % `--sheet-surface` with NO blur — invisible at that opacity and
  it cost INP when the sheet opened). Content cards stay `.glass`/`.glass-strong` — near-opaque,
  **no `backdrop-filter`**. `prefers-reduced-transparency` and `forced-colors` fall back to `--sheet-surface`.
  Blur only — no `saturate()` (measured: it alone added ~8 ms to INP when the search dialog opens).
  Keep chrome alpha ≥ ~0.6 (axe contrast, `maps.md` `color-scheme`).

## Traps (each cost a debugging round)

- **`ViewTransition` enter/exit only fire at the outermost mounted element of the page.** Wrapped inside a host
  `<div>` that itself mounts, it silently does nothing (no pseudo-elements, no `startViewTransition`). So
  `NavTransition` wraps the root of `PageShell`, not `<main>`. Check in a real browser: `document.getAnimations()`
  must list `::view-transition-new(_t_…)`.
- **A duplicate `view-transition-name` aborts the whole transition.** One name per id on screen: only Pulpit cards
  and board headings carry `PlaceTitle`, never search results (they sit beside the cards). Names must be valid CSS
  identifiers — GTFS ids contain `:` — hence `placeTransitionName()`.
- **View transitions run only in Chromium engines and without `prefers-reduced-motion`**, enforced by
  `src/lib/viewTransitionGate.ts` (installed in `AppChrome`): it shadows `document.startViewTransition` with an accessor
  that is `undefined` elsewhere (preference read per access). Why not via `<ViewTransition>` props: React still calls
  `startViewTransition` when every prop is `'none'`, and Playwright's WebKit crashes the page on that call (8 mobile-safari
  e2e failures); mounting/unmounting the boundaries by engine would reshape the tree after hydration. Safari is
  unlocked after real-iPhone click-QA — delete the `userAgentData` condition then.
- **State changes only animate inside `startTransition`** (tab switches); plain `setState` does not start a transition.
- **Never hand-write `-webkit-backdrop-filter` in `globals.css`.** With a hand-written twin the build emitted ONLY the
  prefixed property and Chromium rendered no blur (also true for `.glass` before PR6). Write `backdrop-filter` alone
  (guard: `designTokens.test.ts`).
- **Everything that moves sits under `@media (prefers-reduced-motion: no-preference)`** (pulses, `:active` scale,
  `@starting-style`, scroll-driven header title); under `reduce` the gate hides `startViewTransition`, so the browser
  never calls it (`e2e/motion.spec.ts` asserts zero). Menu entries (`.enter-pop`) never `scale`: a scaled panel shrinks
  its 44 px touch targets while opening.
- **No new element in flow above the board on phones** (`e2e/boards-mobile.spec.ts`). The header title swap
  (`useHeaderTitle`, scroll-driven, `@supports (animation-timeline: scroll())`) was chosen over a collapsing hero
  for exactly that reason. The page only scrolls when content exceeds the viewport — e2e uses a 375×520 viewport.
  A swap into a freed slot is fine: the station's direction select took the removed KPI pills' place (no disruption
  banner above the board — user decision 2026-10-09).
- Live dot (`LiveDot`) uses the accent colour, never the status green (#13), and only while data is fresh and the
  last fetch succeeded (#7).
