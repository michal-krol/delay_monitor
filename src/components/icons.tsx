export type IconProps = {
  size?: number
  className?: string
  /** Ikona znacząca (bez tekstu obok): `role="img"` + `aria-label`. Bez `label` ikona jest dekoracyjna (`aria-hidden`). */
  label?: string
}

/** Jeden styl dla wszystkich ikon: viewBox 20×20, obrys 1.7, zaokrąglone końce. */
function base(children: React.ReactNode, { size = 18, className, label }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
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

export function HomeIcon(props: IconProps) {
  return base(
    <>
      <path d="M3 10.5 10 4l7 6.5" />
      <path d="M5.5 9v6.5a1 1 0 0 0 1 1H8.5v-5h3v5H13.5a1 1 0 0 0 1-1V9" />
    </>,
    props
  )
}

export function ListIcon(props: IconProps) {
  return base(<path d="M3 6h14M3 10h14M3 14h9" />, props)
}

/** Przypięcie: kontur = nieprzypięte, `filled` = przypięte. Kolor zawsze `PIN_COLOR`. */
export function StarIcon({ filled = false, ...props }: IconProps & { filled?: boolean }) {
  return base(
    <path d="m10 3 2.2 4.5 4.9.7-3.6 3.5.9 4.9L10 14.2l-4.4 2.4.9-4.9L2.9 8.2l4.9-.7z" fill={filled ? 'currentColor' : 'none'} />,
    props
  )
}

/** Jeden odcień przypięcia (gwiazdka; złota obwódka na mapie to ten sam #f59e0b) — amber-500. */
export const PIN_COLOR = 'text-amber-500'

export function RouteIcon(props: IconProps) {
  return base(
    <>
      <circle cx="5" cy="6" r="2" />
      <circle cx="15" cy="6" r="2" />
      <circle cx="10" cy="15" r="2" />
      <path d="M6.6 7.2 8.6 13.2M13.4 7.2 11.4 13.2M7 6h6" />
    </>,
    props
  )
}

export function MapIcon(props: IconProps) {
  return base(
    <>
      <path d="M10 17s6-5.1 6-9.5A6 6 0 0 0 4 7.5C4 11.9 10 17 10 17Z" />
      <circle cx="10" cy="7.5" r="2" />
    </>,
    props
  )
}

/** „Otwórz / dalej” oraz — obracany — rozwiń/zwiń. Nie kierunek jazdy (to `ArrowRightIcon`). */
export function ChevronRightIcon(props: IconProps) {
  return base(<path d="m8 5 5 5-5 5" />, props)
}

/** Wybrane / skopiowane. */
export function CheckIcon(props: IconProps) {
  return base(<path d="m4.5 10.5 3.5 3.5 7.5-8" />, props)
}

export function SunIcon(props: IconProps) {
  return base(
    <>
      <circle cx="10" cy="10" r="3.2" />
      <path d="M10 2.5v1.8M10 15.7v1.8M17.5 10h-1.8M4.3 10H2.5M15.3 4.7 14 6M6 14l-1.3 1.3M15.3 15.3 14 14M6 6 4.7 4.7" />
    </>,
    props
  )
}

export function MoonIcon(props: IconProps) {
  return base(<path d="M16 12.2A6.5 6.5 0 1 1 7.8 4a5.2 5.2 0 0 0 8.2 8.2Z" />, props)
}

export function CloseIcon(props: IconProps) {
  return base(<path d="M5 5l10 10M15 5 5 15" />, props)
}

export function ExpandIcon(props: IconProps) {
  return base(
    <>
      <path d="M7 3H3v4M13 3h4v4M17 13v4h-4M3 13v4h4" />
    </>,
    props
  )
}

export function MenuIcon(props: IconProps) {
  return base(<path d="M3 5h14M3 10h14M3 15h14" />, props)
}

/** Wstecz. */
export function ArrowLeftIcon(props: IconProps) {
  return base(<path d="M16 10H4m0 0 5-5m-5 5 5 5" />, props)
}

export function CalendarIcon(props: IconProps) {
  return base(
    <>
      <rect x="3" y="4.5" width="14" height="12" rx="2" />
      <path d="M3 8.5h14M7 3v3M13 3v3" />
    </>,
    props
  )
}

export function ClockIcon(props: IconProps) {
  return base(
    <>
      <circle cx="10" cy="10" r="7.2" />
      <path d="M10 6v4l3 2" />
    </>,
    props
  )
}

export function TrainIcon(props: IconProps) {
  return base(
    <>
      <path d="M5 12.5V6a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v6.5" />
      <rect x="4.3" y="12.5" width="11.4" height="2.4" rx="1.2" />
      <circle cx="7.3" cy="9" r="1" fill="currentColor" stroke="none" />
      <circle cx="12.7" cy="9" r="1" fill="currentColor" stroke="none" />
      <path d="M6.3 15.8 4.6 18M13.7 15.8l1.7 2.2" />
    </>,
    props
  )
}

export function BusIcon(props: IconProps) {
  return base(
    <>
      <rect x="4.3" y="3.5" width="11.4" height="11" rx="2" />
      <path d="M4.3 8.5h11.4" />
      <circle cx="7.3" cy="11.4" r="1" fill="currentColor" stroke="none" />
      <circle cx="12.7" cy="11.4" r="1" fill="currentColor" stroke="none" />
      <path d="M6.3 14.5 5 16.5M13.7 14.5l1.3 2" />
    </>,
    props
  )
}

export function TramIcon(props: IconProps) {
  return base(
    <>
      <rect x="5" y="4" width="10" height="11" rx="2.4" />
      <path d="M5 9h10" />
      <path d="M10 4V2M7.5 2.6 10 4l2.5-1.4" />
      <path d="M7 15l-1.6 2.4M13 15l1.6 2.4" />
    </>,
    props
  )
}

export function MetroIcon(props: IconProps) {
  return base(
    <>
      <path d="M4 15 10 4l6 11" />
      <path d="M6.3 15h7.4" />
      <path d="M8 10.5 10 7l2 3.5" />
    </>,
    props
  )
}

export function AccessibleIcon(props: IconProps) {
  return base(
    <>
      <circle cx="10" cy="3.6" r="1.5" fill="currentColor" stroke="none" />
      <path d="M10 6v4.5h3.5M10 8.2h-3" />
      <path d="M10 10.5c0 3.6-2.6 5.5-4.5 5.5S2 14 3.2 11.3" />
      <path d="M10 10.5l2 5.5" />
    </>,
    props
  )
}

export function AlertCircleIcon(props: IconProps) {
  return base(
    <>
      <circle cx="10" cy="10" r="7.5" />
      <path d="M10 9v4.5M10 6.8v.1" strokeWidth={2} />
    </>,
    props
  )
}

/** "?" w kółku -- świadomie inny glif niż `AlertCircleIcon` (zarezerwowany dla wskaźnika utrudnienia), żeby dwa różne znaczenia nie dzieliły jednej ikony na tym samym ekranie. */
export function HelpCircleIcon(props: IconProps) {
  return base(
    <>
      <circle cx="10" cy="10" r="7.5" />
      <path d="M7.8 8.2a2.2 2.2 0 1 1 3.6 1.7c-.7.6-1.2 1-1.2 1.9" />
      <path d="M10 14.2v.1" strokeWidth={2} />
    </>,
    props
  )
}

/** Kierunek jazdy („skąd → dokąd”). „Otwórz / dalej” to `ChevronRightIcon`. */
export function ArrowRightIcon(props: IconProps) {
  return base(<path d="M4 10h12m0 0-5-5m5 5-5 5" />, props)
}

/** Odjazdy (strzałka wychodzi od kreski peronu). */
export function DepartureIcon(props: IconProps) {
  return base(<path d="M4 4v12M8 10h9m0 0-3.5-3.5M17 10l-3.5 3.5" />, props)
}

/** Przyjazdy (strzałka dochodzi do kreski peronu). */
export function ArrivalIcon(props: IconProps) {
  return base(<path d="M16 4v12M3 10h9m0 0L8.5 6.5M12 10l-3.5 3.5" />, props)
}

/** Tryb „inne” — neutralny, żeby nieznany środek nie udawał autobusu. */
export function OtherModeIcon(props: IconProps) {
  return base(
    <>
      <rect x="3.5" y="3.5" width="13" height="13" rx="3" />
      <circle cx="6.8" cy="10" r="1" fill="currentColor" stroke="none" />
      <circle cx="10" cy="10" r="1" fill="currentColor" stroke="none" />
      <circle cx="13.2" cy="10" r="1" fill="currentColor" stroke="none" />
    </>,
    props
  )
}

/** Przystanek (słupek z tablicą) — liczba przystanków, nie tryb. */
export function StopIcon(props: IconProps) {
  return base(
    <>
      <path d="M6 2.5v15M4 17.5h4" />
      <rect x="6" y="3" width="9" height="6" rx="1.2" />
    </>,
    props
  )
}

/** Środki transportu (warstwy) — liczba rodzajów w mieście. */
export function LayersIcon(props: IconProps) {
  return base(
    <>
      <path d="M10 3 3 6.8l7 3.8 7-3.8Z" />
      <path d="m3 10.3 7 3.8 7-3.8M3 13.6l7 3.8 7-3.8" />
    </>,
    props
  )
}

/** „Pokaż całe miasto” — kadr na całe miasto, nie nawigacja „Mapa”. */
export function CityIcon(props: IconProps) {
  return base(
    <>
      <path d="M2.5 17h15M4.5 17V8.5H9M9 17V3.5h6.5V17" />
      <path d="M11.5 6.5h2M11.5 9.5h2M11.5 12.5h2M6.5 11.5h.01M6.5 14h.01" />
    </>,
    props
  )
}

/** Średnie opóźnienie (klepsydra) — godzina to `ClockIcon`. */
export function HourglassIcon(props: IconProps) {
  return base(
    <path d="M5.5 3h9M5.5 17h9M7 3v1.8c0 2 3 3.2 3 5.2s-3 3.2-3 5.2V17M13 3v1.8c0 2-3 3.2-3 5.2s3 3.2 3 5.2V17" />,
    props
  )
}

/** Punktualność (tarcza) — „wybrane” to `CheckIcon`. */
export function TargetIcon(props: IconProps) {
  return base(
    <>
      <circle cx="10" cy="10" r="7" />
      <circle cx="10" cy="10" r="3.8" />
      <circle cx="10" cy="10" r="1" fill="currentColor" stroke="none" />
    </>,
    props
  )
}

/** Czas podróży (stoper) — trasa to `RouteIcon`. */
export function TimerIcon(props: IconProps) {
  return base(
    <>
      <circle cx="10" cy="11" r="6" />
      <path d="M10 11V8M8.3 2.5h3.4M15 5.5l1.2-1.2" />
    </>,
    props
  )
}

/** Filtry warstw mapy. */
export function FilterIcon(props: IconProps) {
  return base(<path d="M3 5h14M6 10h8M9 15h2" />, props)
}

/**
 * Logo aplikacji — ten sam rysunek co `app/icon.svg` (czoło pociągu z dwiema szybami),
 * biały na gradiencie akcentu. `TrainIcon` zostaje wyłącznie dla kolei.
 */
export function AppLogo({ size = 36 }: { size?: number }) {
  return (
    <span
      className="grid shrink-0 place-items-center text-white shadow-lg"
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.3), background: 'var(--accent-gradient)' }}
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
export function SwapIcon(props: IconProps) {
  return base(
    <>
      <path d="M4 7h11l-3-3" />
      <path d="M16 13H5l3 3" />
    </>,
    props
  )
}

export function ShareIcon(props: IconProps) {
  return base(
    <>
      <path d="M14 6.5V4.5a1 1 0 0 0-1-1H4.5a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1H13a1 1 0 0 0 1-1v-2" />
      <path d="M10 10h6.5m0 0L14 7.5M16.5 10 14 12.5" />
    </>,
    props
  )
}

export function InfoIcon(props: IconProps) {
  return base(
    <>
      <circle cx="10" cy="10" r="7.2" />
      <path d="M10 9.2v4.3" />
      <path d="M10 6.5h.01" strokeWidth={2} />
    </>,
    props
  )
}

/** Postój na trasie — dwie pauzy, ten sam znak co na odtwarzaczu. */
export function PauseIcon(props: IconProps) {
  return base(<path d="M7.5 5v10M12.5 5v10" />, props)
}

// --- Ikony pogodowe (widżet "Pogoda dziś" w StationAside) ---

export function CloudIcon(props: IconProps) {
  return base(<path d="M5.7 14.5a3 3 0 0 1-.4-6 4.2 4.2 0 0 1 8-1.4A3.3 3.3 0 0 1 14.3 14.5H5.7Z" strokeLinejoin="round" />, props)
}

export function FogIcon(props: IconProps) {
  return base(<path d="M3 7.5h10M5 10.5h12M3 13.5h10" />, props)
}

export function RainIcon(props: IconProps) {
  return base(
    <>
      <path d="M5.7 11.5a2.7 2.7 0 0 1-.3-5.4A3.8 3.8 0 0 1 12.8 4.6a3 3 0 0 1 1.5 5.9H5.7Z" strokeLinejoin="round" />
      <path d="M6.5 13.5 5.8 15.7M10 13.5 9.3 15.7M13.5 13.5 12.8 15.7" />
    </>,
    props
  )
}

export function SnowIcon(props: IconProps) {
  return base(
    <>
      <path d="M5.7 11.5a2.7 2.7 0 0 1-.3-5.4A3.8 3.8 0 0 1 12.8 4.6a3 3 0 0 1 1.5 5.9H5.7Z" strokeLinejoin="round" />
      <path d="M6.5 14v.1M10 14.5v.1M13.5 14v.1" strokeWidth={2.4} />
    </>,
    props
  )
}

export function ThunderIcon(props: IconProps) {
  return base(
    <>
      <path d="M5.7 10.5a2.7 2.7 0 0 1-.3-5.4A3.8 3.8 0 0 1 12.8 3.6a3 3 0 0 1 1.5 5.9H5.7Z" strokeLinejoin="round" />
      <path d="M10.3 11.5 7.8 15.5h2.4L9 18.5 13.3 13h-2.6l1.6-1.5Z" strokeLinejoin="round" />
    </>,
    props
  )
}

export function WindIcon(props: IconProps) {
  return base(
    <path
      d="M3 8h8.5a2 2 0 1 0-1.8-2.8M3 11.5h11a2 2 0 1 1-1.8 2.8M3 15h6.5a1.6 1.6 0 1 0-1.4-2.3"
     
    />,
    props
  )
}

export function DropletIcon(props: IconProps) {
  return base(<path d="M10 3.5s5 6 5 9.5a5 5 0 0 1-10 0c0-3.5 5-9.5 5-9.5Z" strokeLinejoin="round" />, props)
}

export function GaugeIcon(props: IconProps) {
  return base(
    <>
      <path d="M3.5 13.5a6.5 6.5 0 0 1 13 0" />
      <path d="M10 13.5 13 9" />
      <circle cx="10" cy="13.5" r="1" fill="currentColor" stroke="none" />
    </>,
    props
  )
}
