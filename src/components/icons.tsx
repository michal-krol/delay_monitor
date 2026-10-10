/**
 * Jedyne źródło ikon w aplikacji (AGENTS.md, `.claude/rules/ui-icons.md`): węzły Lucide
 * (`lucide`, ISC) rysowane przez `base()`. Tylko ten plik importuje `lucide` — pilnuje tego
 * reguła ESLint `no-restricted-imports` i `designTokens.test.ts`. Mapa (DOM poza Reactem,
 * raster SDF) bierze kształty stąd: `iconElement()`, `VEHICLE_HEADING_POLYGON`.
 * Własne rysunki zostają tylko trzy: `MetroIcon` („M” w kole), `AppLogo`, logotypy przewoźników.
 *
 * Słownik — jedno pojęcie = jedna ikona:
 * - Start `HomeIcon` · Mapa `MapIcon` · Szukaj `SearchIcon` · Linie `RouteIcon` · Odjazdy/Przyjazdy (nawigacja desktopowa) `DeparturesBoardIcon`
 * - widok listy (np. „Lista” na mapie, liczba połączeń) `ListIcon` · menu „Więcej” (akcje schowane na telefonie) `MoreIcon`
 * - odjazd `DepartureIcon` · przyjazd `ArrivalIcon` · data `CalendarIcon`
 * - kierunek jazdy („skąd → dokąd”) `ArrowRightIcon` · otwórz/dalej `ChevronRightIcon` · wstecz `ArrowLeftIcon`
 * - kolejność listy („W górę” / „W dół”) `ArrowUpIcon` / `ArrowDownIcon`
 * - rozwiń/zwiń `DisclosureIcon` (otwarte = obrót 180°, klasa `disclosure-chevron`)
 * - kolej (tryb, stacja) `TrainIcon` · pozycja pojazdu `VehiclePositionIcon` · kierunek jazdy pojazdu `VehicleHeadingIcon`
 * - utrudnienie `AlertCircleIcon` · objaśnienie „?” `HelpCircleIcon` · informacja `InfoIcon`
 * - przypięte `StarIcon filled` (sama nosi `PIN_COLOR`; przełączniki przez `PinStar`) · filtry `FilterIcon`
 * - lokalizacja użytkownika `LocateIcon` · celność (kafelek statystyk) `TargetIcon` — dwa różne pojęcia
 * - motyw jasny i pogoda „słonecznie” dzielą `SunIcon` (różne ekrany, świadomie)
 */
import { createElement as createReactElement } from 'react'
import {
  Accessibility,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowRightFromLine,
  ArrowRightLeft,
  ArrowRightToLine,
  ArrowUp,
  Building,
  BusFront,
  Calendar,
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  CircleDot,
  CircleEllipsis,
  CircleQuestionMark,
  Cloud,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  createElement as createLucideElement,
  Droplet,
  Ellipsis,
  Gauge,
  Hourglass,
  House,
  Info,
  Layers,
  List,
  ListClock,
  ListFilter,
  Locate,
  Map as MapGlyph,
  Maximize,
  Moon,
  Navigation2,
  Pause,
  Route,
  Search,
  Share,
  Signpost,
  Star,
  Sun,
  Target,
  Timer,
  TrainFront,
  TramFront,
  Wind,
  X,
  type IconNode,
} from 'lucide'

export type IconProps = {
  size?: number
  className?: string
  /** Ikona znacząca (bez tekstu obok): `role="img"` + `aria-label`. Bez `label` ikona jest dekoracyjna (`aria-hidden`). */
  label?: string
}

/** Rozmiar według roli, nie „na oko”: w czipie 13, w linii tekstu 14, w przycisku 16, w kafelku/KPI 18. */
export const ICON_SIZE = { chip: 13, inline: 14, button: 16, tile: 18 } as const

/** Jeden styl dla wszystkich ikon: siatka Lucide 24×24, obrys 2, zaokrąglone końce. */
function base(children: React.ReactNode, { size = ICON_SIZE.tile, className, label }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...(label !== undefined ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
    >
      {label !== undefined && <title>{label}</title>}
      {children}
    </svg>
  )
}

/** Węzły Lucide → elementy Reacta (`filled` = kształt wypełniony kolorem tekstu). */
function shapes(node: IconNode, filled = false) {
  return node.map(([tag, attrs], index) =>
    createReactElement(tag, { key: index, ...attrs, ...(filled ? { fill: 'currentColor' } : {}) })
  )
}

function lucideIcon(node: IconNode, filled = false) {
  // Elementy Reacta są niezmienne — budujemy je raz na ikonę, nie przy każdym renderze.
  const children = shapes(node, filled)
  return function Icon(props: IconProps) {
    return base(children, props)
  }
}

export const HomeIcon = /* @__PURE__ */ lucideIcon(House)
/** Widok listy — nie nawigacja „Odjazdy” (to `DeparturesBoardIcon`). */
export const ListIcon = /* @__PURE__ */ lucideIcon(List)
export const MoreIcon = /* @__PURE__ */ lucideIcon(Ellipsis)
/** Nawigacja „Odjazdy / Przyjazdy” — tablica z godzinami. */
export const DeparturesBoardIcon = /* @__PURE__ */ lucideIcon(ListClock)

/** Jeden odcień przypięcia (gwiazdka; złota obwódka na mapie to ten sam #f59e0b) — amber-500. */
export const PIN_COLOR = 'text-amber-500'

const STAR = { outline: shapes(Star), filled: shapes(Star, true) }

/** Przypięcie: kontur = nieprzypięte, `filled` = przypięte — wtedy ikona sama nosi `PIN_COLOR`. */
export function StarIcon({ filled = false, className, ...props }: IconProps & { filled?: boolean }) {
  if (!filled) return base(STAR.outline, { ...props, className })
  return base(STAR.filled, { ...props, className: className === undefined ? PIN_COLOR : `${PIN_COLOR} ${className}` })
}

export const RouteIcon = /* @__PURE__ */ lucideIcon(Route)
export const MapIcon = /* @__PURE__ */ lucideIcon(MapGlyph)
/** „Otwórz / dalej”. Nie kierunek jazdy (to `ArrowRightIcon`), nie rozwiń/zwiń (to `DisclosureIcon`). */
export const ChevronRightIcon = /* @__PURE__ */ lucideIcon(ChevronRight)
const ChevronDownIcon = /* @__PURE__ */ lucideIcon(ChevronDown)

/**
 * Rozwiń/zwiń: chevron w dół, obrócony o 180°, gdy rodzic `<details>` jest otwarty albo przycisk
 * ma `aria-expanded="true"` — klasa `disclosure-chevron` w `globals.css`, bez obrotu per miejsce.
 */
export function DisclosureIcon({ className, ...props }: IconProps) {
  return <ChevronDownIcon {...props} className={className === undefined ? 'disclosure-chevron' : `disclosure-chevron ${className}`} />
}
/** Wybrane / skopiowane. */
export const CheckIcon = /* @__PURE__ */ lucideIcon(Check)
export const SunIcon = /* @__PURE__ */ lucideIcon(Sun)
export const MoonIcon = /* @__PURE__ */ lucideIcon(Moon)
export const CloseIcon = /* @__PURE__ */ lucideIcon(X)
export const ExpandIcon = /* @__PURE__ */ lucideIcon(Maximize)
/** Wstecz. */
export const ArrowLeftIcon = /* @__PURE__ */ lucideIcon(ArrowLeft)
/** Kolejność listy („W górę” / „W dół” w edycji Startu) — nie kierunek jazdy. */
export const ArrowUpIcon = /* @__PURE__ */ lucideIcon(ArrowUp)
export const ArrowDownIcon = /* @__PURE__ */ lucideIcon(ArrowDown)
export const CalendarIcon = /* @__PURE__ */ lucideIcon(Calendar)
/** Kolej jako tryb lub stacja — nie pozycja pociągu (to `VehiclePositionIcon`). */
export const TrainIcon = /* @__PURE__ */ lucideIcon(TrainFront)
export const BusIcon = /* @__PURE__ */ lucideIcon(BusFront)
export const TramIcon = /* @__PURE__ */ lucideIcon(TramFront)

export function MetroIcon(props: IconProps) {
  return base(
    // `<g>`, nie fragment: Satori (karty podglądu linków, `lib/share/render.tsx`) nie przyjmuje fragmentów w `<svg>`.
    <g>
      {/* Własny piktogram (koło + „M”), nie oficjalne logo Metra Warszawskiego. */}
      <circle cx="12" cy="12" r="9.1" />
      <path d="M7.7 16.1V8.2l4.3 5.3 4.3-5.3v7.9" />
    </g>,
    props
  )
}

export const AccessibleIcon = /* @__PURE__ */ lucideIcon(Accessibility)
/** Utrudnienie — zarezerwowane dla tego jednego znaczenia. */
export const AlertCircleIcon = /* @__PURE__ */ lucideIcon(CircleAlert)
/** "?" w kółku -- świadomie inny glif niż `AlertCircleIcon` (wskaźnik utrudnienia), żeby dwa różne znaczenia nie dzieliły jednej ikony. */
export const HelpCircleIcon = /* @__PURE__ */ lucideIcon(CircleQuestionMark)
/** Kierunek jazdy („skąd → dokąd”). „Otwórz / dalej” to `ChevronRightIcon`. */
export const ArrowRightIcon = /* @__PURE__ */ lucideIcon(ArrowRight)
/** Odjazdy (strzałka wychodzi od kreski peronu). */
export const DepartureIcon = /* @__PURE__ */ lucideIcon(ArrowRightFromLine)
/** Przyjazdy (strzałka dochodzi do kreski peronu). */
export const ArrivalIcon = /* @__PURE__ */ lucideIcon(ArrowRightToLine)
/** Tryb „inne” — neutralny, żeby nieznany środek nie udawał autobusu. */
export const OtherModeIcon = /* @__PURE__ */ lucideIcon(CircleEllipsis)
/** Przystanek — liczba przystanków, nie tryb. */
export const StopIcon = /* @__PURE__ */ lucideIcon(Signpost)
/** Środki transportu (warstwy) — liczba rodzajów w mieście. */
export const LayersIcon = /* @__PURE__ */ lucideIcon(Layers)
/** „Pokaż całe miasto” — kadr na całe miasto, nie nawigacja „Mapa”. */
export const CityIcon = /* @__PURE__ */ lucideIcon(Building)
/** Średnie opóźnienie (klepsydra). */
export const HourglassIcon = /* @__PURE__ */ lucideIcon(Hourglass)
/** Celność / punktualność (tarcza) — „wybrane” to `CheckIcon`, „gdzie jestem” to `LocateIcon`. */
export const TargetIcon = /* @__PURE__ */ lucideIcon(Target)
/** Lokalizacja użytkownika („Pokaż moją pozycję”) — nie celność (to `TargetIcon`). */
export const LocateIcon = /* @__PURE__ */ lucideIcon(Locate)
/** Czas podróży (stoper) — trasa to `RouteIcon`. */
export const TimerIcon = /* @__PURE__ */ lucideIcon(Timer)
/** Filtry warstw mapy. */
export const FilterIcon = /* @__PURE__ */ lucideIcon(ListFilter)
export const SearchIcon = /* @__PURE__ */ lucideIcon(Search)
/** Pozycja pojazdu (np. „Pociąg jest tutaj”) — ta sama kropka co pojazd na mapie. */
export const VehiclePositionIcon = /* @__PURE__ */ lucideIcon(CircleDot)
/** Kierunek jazdy pojazdu (strzałka przy kropce) — wypełniona, w kolorze rodzaju. */
export const VehicleHeadingIcon = /* @__PURE__ */ lucideIcon(Navigation2, true)

/** Gradient akcentu wprost — lustro `--accent-gradient` z `globals.css` dla tras ikon (`app/icon.tsx`), gdzie nie ma CSS. */
export const ACCENT_GRADIENT = 'linear-gradient(135deg, #38bdf8, #6366f1)'

/**
 * Logo aplikacji (czoło pociągu z dwiema szybami), biały na gradiencie akcentu. To samo źródło
 * rysuje faviconę i ikony PWA (`app/icon.tsx`, `app/apple-icon.tsx`), dlatego układ w stylach
 * inline i flexem — `ImageResponse` (Satori) nie zna klas Tailwinda. `TrainIcon` zostaje dla kolei.
 */
export function AppLogo({
  size = 36,
  background = 'var(--accent-gradient)',
  rounded = true,
}: {
  size?: number
  background?: string
  /** `false` dla ikony iOS — system sam nakłada maskę z zaokrągleniem. */
  rounded?: boolean
}) {
  return (
    <span
      className="shrink-0 shadow-lg"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'white',
        width: size,
        height: size,
        borderRadius: rounded ? Math.round(size * 0.3) : 0,
        background,
      }}
      aria-hidden="true"
    >
      <svg width={Math.round(size * 0.6)} height={Math.round(size * 0.6)} viewBox="0 0 24 24" fill="currentColor">
        <path
          fillRule="evenodd"
          d="M8 4h8a4 4 0 0 1 4 4v5a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V8a4 4 0 0 1 4-4Zm0 3a1 1 0 0 0-1 1v2a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1Zm6 0a1 1 0 0 0-1 1v2a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1Z"
        />
        <rect x="3" y="16" width="18" height="2" rx="1" />
        <circle cx="8" cy="20" r="2" />
        <circle cx="16" cy="20" r="2" />
      </svg>
    </span>
  )
}

/** Dwie strzałki w przeciwnych kierunkach — przełącznik kierunku linii. */
export const SwapIcon = /* @__PURE__ */ lucideIcon(ArrowRightLeft)
export const ShareIcon = /* @__PURE__ */ lucideIcon(Share)
export const InfoIcon = /* @__PURE__ */ lucideIcon(Info)
/** Postój na trasie — dwie pauzy, ten sam znak co na odtwarzaczu. */
export const PauseIcon = /* @__PURE__ */ lucideIcon(Pause)

// --- Ikony pogodowe (widżet "Pogoda dziś" w StationAside) ---

export const CloudIcon = /* @__PURE__ */ lucideIcon(Cloud)
export const FogIcon = /* @__PURE__ */ lucideIcon(CloudFog)
export const RainIcon = /* @__PURE__ */ lucideIcon(CloudRain)
export const SnowIcon = /* @__PURE__ */ lucideIcon(CloudSnow)
export const ThunderIcon = /* @__PURE__ */ lucideIcon(CloudLightning)
export const WindIcon = /* @__PURE__ */ lucideIcon(Wind)
export const DropletIcon = /* @__PURE__ */ lucideIcon(Droplet)
export const GaugeIcon = /* @__PURE__ */ lucideIcon(Gauge)

// --- Mapa: DOM poza Reactem i raster (te same węzły Lucide) ---

const DOM_ICONS = { chevronRight: ChevronRight, vehicleHeading: Navigation2 } as const

/** `<svg>` do DOM budowanego ręcznie (popup, marker pojazdu): `createElementNS`, nie innerHTML (#4). Dekoracyjny. */
export function iconElement(icon: keyof typeof DOM_ICONS, attrs: Record<string, string> = {}): SVGSVGElement {
  return createLucideElement(DOM_ICONS[icon], { 'aria-hidden': 'true', ...attrs }) as SVGSVGElement
}

/** Wierzchołki `navigation-2` na siatce 24×24 — z nich raster SDF strzałek pojazdów (`arrowImage`). */
export const VEHICLE_HEADING_POLYGON: readonly (readonly [number, number])[] = (() => {
  const numbers = String(Navigation2[0][1].points).trim().split(/[\s,]+/).map(Number)
  return numbers.flatMap((value, index) => (index % 2 === 0 ? [[value, numbers[index + 1]] as const] : []))
})()
