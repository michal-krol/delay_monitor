---
paths:
  - "src/components/**"
  - "src/app/**/*.tsx"
---

# Icons: one source, one icon per concept

Why: `adr/0006-ikony-lucide.md`.

- **Single source.** Every icon or pictogram — UI, map DOM, map raster, favicon, PWA icons —
  comes from `src/components/icons.tsx`. Only that file imports `lucide` (ESLint
  `no-restricted-imports` + `designTokens.test.ts`). `lucide-react` is not used: it exports
  no icon nodes, and the map needs them outside React. Never paste an SVG path into a
  component; add a named export to `icons.tsx` instead (inline `<svg>` outside it is limited
  to charts and the station-card art, guarded by `designTokens.test.ts`).
- **Outside React** (hand-built DOM in `MapView`, MapLibre images): `iconElement()` (lucide
  `createElement` = `createElementNS`, never innerHTML, #4) and `VEHICLE_HEADING_POLYGON`
  (`arrowImage()` rasterises it for the `vehicles-arrows` SDF layer).
- **Kept custom drawings:** `MetroIcon` („M" in a circle, not the official Metro logo,
  `adr/0005`), `AppLogo` (also drawn by `app/icon.tsx` / `app/apple-icon.tsx` via
  `ImageResponse` — keep its layout in inline flex styles, Satori ignores Tailwind classes),
  carrier logos (`public/carriers/`). Line-timeline dot/ring/square and map dots are diagram
  marks, not icons.
- **Concept → icon** (the dictionary lives in the `icons.tsx` header; change both together):
  - nav: Pulpit `HomeIcon`, Odjazdy `DeparturesBoardIcon`, Linie `RouteIcon`, Mapa `MapIcon`;
    `ListIcon` only for list views („Lista" on the map, trip counts)
  - overflow menu „Więcej" (actions hidden on phones) `MoreIcon`
  - departure `DepartureIcon`, arrival `ArrivalIcon` (not a clock)
  - travel direction „A → B" `ArrowRightIcon` (with `label="do"` when it is the only link
    between two names read aloud); open/next `ChevronRightIcon`; back `ArrowLeftIcon`
  - expand/collapse `DisclosureIcon`: the `disclosure-chevron` class in `globals.css` turns it
    180° inside the `<summary>` of an open `<details>` or under `aria-expanded="true"` — no
    per-site rotate or `group-open:` classes; sidebar collapse is a panel, not a disclosure,
    and keeps the horizontal chevron
  - rail mode/station `TrainIcon`; a vehicle's position `VehiclePositionIcon`; its heading
    `VehicleHeadingIcon` (same glyph as the map arrows)
  - disruption `AlertCircleIcon` only (help „?" is `HelpCircleIcon`)
  - pinned = `StarIcon filled`, everywhere (also menus); a filled star carries `PIN_COLOR`
    itself — don't add it at the call site
  - theme toggle and „sunny" weather share `SunIcon` — different screens, accepted
- **Size by role** — `ICON_SIZE`: `chip` 13, `inline` 14 (in a line of text), `button` 16,
  `tile` 18 (tiles, KPIs, headers; the default). No `size={10..19}` literals
  (`designTokens.test.ts`); ≥ 20 px are illustrations and stay literal. A glyph inside a
  fixed-size mark may be sized with CSS (`h-2.5 w-2.5`) instead.
- **Accessibility:** no `label` = decorative (`aria-hidden`). Add `label` only when the icon
  alone carries meaning („do", „Utrudnienie na trasie", „zmień kierunek"). Don't put
  `aria-label` on a control whose visible text already names it — it hides that text from
  screen readers; between flex children use explicit `{' '}` so the computed name doesn't
  glue words.
