/**
 * Jedyne źródło ikon w aplikacji (AGENTS.md, `.claude/rules/ui-icons.md`): węzły Lucide
 * (`lucide`, ISC) rysowane przez `base()`. Tylko ten plik importuje `lucide` — pilnuje tego
 * reguła ESLint `no-restricted-imports` i `designTokens.test.ts`. Mapa (DOM poza Reactem,
 * raster SDF) bierze kształty stąd: `iconElement()`, `VEHICLE_HEADING_POLYGON`.
 * Własne rysunki zostają tylko trzy: `MetroIcon` („M” w kole), `AppLogo`, logotypy przewoźników.
 *
 * Słownik — jedno pojęcie = jedna ikona:
 * - Pulpit `HomeIcon` · Odjazdy/Przyjazdy (nawigacja) `DeparturesBoardIcon` · Linie `RouteIcon` · Mapa `MapIcon`
 * - widok listy (np. „Lista” na mapie, liczba połączeń) `ListIcon`
 * - odjazd `DepartureIcon` · przyjazd `ArrivalIcon` · godzina `ClockIcon` · data `CalendarIcon`
 * - kierunek jazdy („skąd → dokąd”) `ArrowRightIcon` · otwórz/dalej `ChevronRightIcon` · wstecz `ArrowLeftIcon`
 * - rozwiń/zwiń `ChevronDownIcon` (otwarte = obrót 180°)
 * - kolej (tryb, stacja) `TrainIcon` · pozycja pojazdu `VehiclePositionIcon` · kierunek jazdy pojazdu `VehicleHeadingIcon`
 * - utrudnienie `AlertCircleIcon` · objaśnienie „?” `HelpCircleIcon` · informacja `InfoIcon`
 * - przypięte `StarIcon filled` (zawsze `PIN_COLOR`) · szukaj `SearchIcon` · filtry `FilterIcon`
 * - motyw jasny i pogoda „słonecznie” dzielą `SunIcon` (różne ekrany, świadomie)
 */
import { createElement as createReactElement } from 'react'
import {
  Accessibility,
  ArrowLeft,
  ArrowRight,
  ArrowRightFromLine,
  ArrowRightLeft,
  ArrowRightToLine,
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
  Clock,
  Cloud,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  createElement as createLucideElement,
  Droplet,
  Gauge,
  Hourglass,
  House,
  Info,
  Layers,
  List,
  ListClock,
  ListFilter,
  Map as MapGlyph,
  Maximize,
  Menu,
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
  return function Icon(props: IconProps) {
    return base(shapes(node, filled), props)
  }
}

export const HomeIcon = lucideIcon(House)
/** Widok listy — nie nawigacja „Odjazdy” (to `DeparturesBoardIcon`). */
export const ListIcon = lucideIcon(List)
/** Nawigacja „Odjazdy / Przyjazdy” — tablica z godzinami. */
export const DeparturesBoardIcon = lucideIcon(ListClock)

/** Przypięcie: kontur = nieprzypięte, `filled` = przypięte. Kolor zawsze `PIN_COLOR`. */
export function StarIcon({ filled = false, ...props }: IconProps & { filled?: boolean }) {
  return base(shapes(Star, filled), props)
}

/** Jeden odcień przypięcia (gwiazdka; złota obwódka na mapie to ten sam #f59e0b) — amber-500. */
export const PIN_COLOR = 'text-amber-500'

export const RouteIcon = lucideIcon(Route)
export const MapIcon = lucideIcon(MapGlyph)
/** „Otwórz / dalej”. Nie kierunek jazdy (to `ArrowRightIcon`), nie rozwiń/zwiń (to `ChevronDownIcon`). */
export const ChevronRightIcon = lucideIcon(ChevronRight)
/** Rozwiń/zwiń (`<details>`, panele): w dół = zwinięte, obrót 180° = rozwinięte. */
export const ChevronDownIcon = lucideIcon(ChevronDown)
/** Wybrane / skopiowane. */
export const CheckIcon = lucideIcon(Check)
export const SunIcon = lucideIcon(Sun)
export const MoonIcon = lucideIcon(Moon)
export const CloseIcon = lucideIcon(X)
export const ExpandIcon = lucideIcon(Maximize)
export const MenuIcon = lucideIcon(Menu)
/** Wstecz. */
export const ArrowLeftIcon = lucideIcon(ArrowLeft)
export const CalendarIcon = lucideIcon(Calendar)
/** Godzina. Odjazd/przyjazd mają własne ikony (`DepartureIcon`/`ArrivalIcon`). */
export const ClockIcon = lucideIcon(Clock)
/** Kolej jako tryb lub stacja — nie pozycja pociągu (to `VehiclePositionIcon`). */
export const TrainIcon = lucideIcon(TrainFront)
export const BusIcon = lucideIcon(BusFront)
export const TramIcon = lucideIcon(TramFront)

export function MetroIcon(props: IconProps) {
  return base(
    <>
      {/* Własny piktogram (koło + „M”), nie oficjalne logo Metra Warszawskiego. */}
      <circle cx="12" cy="12" r="9.1" />
      <path d="M7.7 16.1V8.2l4.3 5.3 4.3-5.3v7.9" />
    </>,
    props
  )
}

export const AccessibleIcon = lucideIcon(Accessibility)
/** Utrudnienie — zarezerwowane dla tego jednego znaczenia. */
export const AlertCircleIcon = lucideIcon(CircleAlert)
/** "?" w kółku -- świadomie inny glif niż `AlertCircleIcon` (wskaźnik utrudnienia), żeby dwa różne znaczenia nie dzieliły jednej ikony. */
export const HelpCircleIcon = lucideIcon(CircleQuestionMark)
/** Kierunek jazdy („skąd → dokąd”). „Otwórz / dalej” to `ChevronRightIcon`. */
export const ArrowRightIcon = lucideIcon(ArrowRight)
/** Odjazdy (strzałka wychodzi od kreski peronu). */
export const DepartureIcon = lucideIcon(ArrowRightFromLine)
/** Przyjazdy (strzałka dochodzi do kreski peronu). */
export const ArrivalIcon = lucideIcon(ArrowRightToLine)
/** Tryb „inne” — neutralny, żeby nieznany środek nie udawał autobusu. */
export const OtherModeIcon = lucideIcon(CircleEllipsis)
/** Przystanek — liczba przystanków, nie tryb. */
export const StopIcon = lucideIcon(Signpost)
/** Środki transportu (warstwy) — liczba rodzajów w mieście. */
export const LayersIcon = lucideIcon(Layers)
/** „Pokaż całe miasto” — kadr na całe miasto, nie nawigacja „Mapa”. */
export const CityIcon = lucideIcon(Building)
/** Średnie opóźnienie (klepsydra) — godzina to `ClockIcon`. */
export const HourglassIcon = lucideIcon(Hourglass)
/** Punktualność (tarcza) — „wybrane” to `CheckIcon`. */
export const TargetIcon = lucideIcon(Target)
/** Czas podróży (stoper) — trasa to `RouteIcon`. */
export const TimerIcon = lucideIcon(Timer)
/** Filtry warstw mapy. */
export const FilterIcon = lucideIcon(ListFilter)
export const SearchIcon = lucideIcon(Search)
/** Pozycja pojazdu (np. „Pociąg jest tutaj”) — ta sama kropka co pojazd na mapie. */
export const VehiclePositionIcon = lucideIcon(CircleDot)
/** Kierunek jazdy pojazdu (strzałka przy kropce) — wypełniona, w kolorze rodzaju. */
export const VehicleHeadingIcon = lucideIcon(Navigation2, true)

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
export const SwapIcon = lucideIcon(ArrowRightLeft)
export const ShareIcon = lucideIcon(Share)
export const InfoIcon = lucideIcon(Info)
/** Postój na trasie — dwie pauzy, ten sam znak co na odtwarzaczu. */
export const PauseIcon = lucideIcon(Pause)

// --- Ikony pogodowe (widżet "Pogoda dziś" w StationAside) ---

export const CloudIcon = lucideIcon(Cloud)
export const FogIcon = lucideIcon(CloudFog)
export const RainIcon = lucideIcon(CloudRain)
export const SnowIcon = lucideIcon(CloudSnow)
export const ThunderIcon = lucideIcon(CloudLightning)
export const WindIcon = lucideIcon(Wind)
export const DropletIcon = lucideIcon(Droplet)
export const GaugeIcon = lucideIcon(Gauge)

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
