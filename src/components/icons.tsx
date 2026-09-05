type IconProps = {
  size?: number
  className?: string
}

function base(children: React.ReactNode, { size = 18, className }: IconProps, viewBox = '0 0 20 20') {
  return (
    <svg
      width={size}
      height={size}
      viewBox={viewBox}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

export function HomeIcon(props: IconProps) {
  return base(
    <>
      <path d="M3 10.5 10 4l7 6.5" stroke="currentColor" />
      <path d="M5.5 9v6.5a1 1 0 0 0 1 1H8.5v-5h3v5H13.5a1 1 0 0 0 1-1V9" stroke="currentColor" />
    </>,
    props
  )
}

export function ListIcon(props: IconProps) {
  return base(<path d="M3 6h14M3 10h14M3 14h9" stroke="currentColor" />, props)
}

export function StarIcon(props: IconProps) {
  return base(
    <path d="m10 3 2.2 4.5 4.9.7-3.6 3.5.9 4.9L10 14.2l-4.4 2.4.9-4.9L2.9 8.2l4.9-.7z" stroke="currentColor" strokeLinejoin="round" />,
    props
  )
}

export function BellIcon(props: IconProps) {
  return base(
    <>
      <path d="M5.5 8a4.5 4.5 0 0 1 9 0c0 3.2 1.2 4.2 1.8 5.3H3.7C4.3 12.2 5.5 11.2 5.5 8Z" stroke="currentColor" />
      <path d="M8.3 15.8a1.8 1.8 0 0 0 3.4 0" stroke="currentColor" />
    </>,
    props
  )
}

export function RouteIcon(props: IconProps) {
  return base(
    <>
      <circle cx="5" cy="6" r="2" stroke="currentColor" />
      <circle cx="15" cy="6" r="2" stroke="currentColor" />
      <circle cx="10" cy="15" r="2" stroke="currentColor" />
      <path d="M6.6 7.2 8.6 13.2M13.4 7.2 11.4 13.2M7 6h6" stroke="currentColor" />
    </>,
    props
  )
}

export function MapIcon(props: IconProps) {
  return base(
    <>
      <path d="M10 17s6-5.1 6-9.5A6 6 0 0 0 4 7.5C4 11.9 10 17 10 17Z" stroke="currentColor" />
      <circle cx="10" cy="7.5" r="2" stroke="currentColor" />
    </>,
    props
  )
}

export function SettingsIcon(props: IconProps) {
  return base(
    <>
      <circle cx="10" cy="10" r="2.6" stroke="currentColor" />
      <path d="M10 3.5v2M10 14.5v2M16.5 10h-2M5.5 10h-2M14.8 5.2l-1.4 1.4M6.6 13.4l-1.4 1.4M14.8 14.8l-1.4-1.4M6.6 6.6 5.2 5.2" stroke="currentColor" />
    </>,
    props,
    '0 0 20 20'
  )
}

export function ChevronRightIcon(props: IconProps) {
  return base(<path d="m6 3 5 5-5 5" stroke="currentColor" />, props, '0 0 16 16')
}

export function CheckIcon(props: IconProps) {
  return base(<path d="M3.5 8.5 6.5 11.5 12.5 4.5" stroke="currentColor" strokeWidth={2.4} />, props, '0 0 16 16')
}

export function SunIcon(props: IconProps) {
  const { size = 18, className } = props
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" className={className} aria-hidden="true">
      <path d="M13.4 9.5A6 6 0 1 1 6.5 2.6a5 5 0 0 0 6.9 6.9Z" />
    </svg>
  )
}

export function MoonIcon(props: IconProps) {
  return base(
    <>
      <circle cx="8" cy="8" r="3" stroke="currentColor" />
      <path d="M8 1v1.6M8 13.4V15M15 8h-1.6M2.6 8H1M12.7 3.3l-1.1 1.1M4.4 11.6l-1.1 1.1M12.7 12.7l-1.1-1.1M4.4 4.4l-1.1-1.1" stroke="currentColor" />
    </>,
    props,
    '0 0 16 16'
  )
}

export function CloseIcon(props: IconProps) {
  return base(<path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth={2} />, props, '0 0 16 16')
}

export function MenuIcon(props: IconProps) {
  return base(<path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" />, props)
}

export function LinkIcon(props: IconProps) {
  return base(
    <>
      <circle cx="15" cy="5" r="2" stroke="currentColor" />
      <circle cx="5" cy="10" r="2" stroke="currentColor" />
      <circle cx="15" cy="15" r="2" stroke="currentColor" />
      <path d="M6.7 9 13.3 6M6.7 11l6.6 3" stroke="currentColor" />
    </>,
    props
  )
}

export function ArrowLeftIcon(props: IconProps) {
  return base(<path d="m10 3-5 5 5 5" stroke="currentColor" strokeWidth={1.8} />, props, '0 0 16 16')
}

export function CalendarIcon(props: IconProps) {
  return base(
    <>
      <rect x="3" y="4.5" width="14" height="12" rx="2" stroke="currentColor" />
      <path d="M3 8.5h14M7 3v3M13 3v3" stroke="currentColor" />
    </>,
    props
  )
}

export function ClockIcon(props: IconProps) {
  return base(
    <>
      <circle cx="10" cy="10" r="7.2" stroke="currentColor" />
      <path d="M10 6v4l3 2" stroke="currentColor" />
    </>,
    props
  )
}

export function TrainIcon(props: IconProps) {
  return base(
    <>
      <path d="M5 12.5V6a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v6.5" stroke="currentColor" />
      <rect x="4.3" y="12.5" width="11.4" height="2.4" rx="1.2" stroke="currentColor" />
      <circle cx="7.3" cy="9" r="1" fill="currentColor" stroke="none" />
      <circle cx="12.7" cy="9" r="1" fill="currentColor" stroke="none" />
      <path d="M6.3 15.8 4.6 18M13.7 15.8l1.7 2.2" stroke="currentColor" />
    </>,
    props
  )
}

export function BusIcon(props: IconProps) {
  return base(
    <>
      <rect x="4.3" y="3.5" width="11.4" height="11" rx="2" stroke="currentColor" />
      <path d="M4.3 8.5h11.4" stroke="currentColor" />
      <circle cx="7.3" cy="11.4" r="1" fill="currentColor" stroke="none" />
      <circle cx="12.7" cy="11.4" r="1" fill="currentColor" stroke="none" />
      <path d="M6.3 14.5 5 16.5M13.7 14.5l1.3 2" stroke="currentColor" />
    </>,
    props
  )
}

export function TramIcon(props: IconProps) {
  return base(
    <>
      <rect x="5" y="4" width="10" height="11" rx="2.4" stroke="currentColor" />
      <path d="M5 9h10" stroke="currentColor" />
      <path d="M10 4V2M7.5 2.6 10 4l2.5-1.4" stroke="currentColor" />
      <path d="M7 15l-1.6 2.4M13 15l1.6 2.4" stroke="currentColor" />
    </>,
    props
  )
}

export function MetroIcon(props: IconProps) {
  return base(
    <>
      <path d="M4 15 10 4l6 11" stroke="currentColor" />
      <path d="M6.3 15h7.4" stroke="currentColor" />
      <path d="M8 10.5 10 7l2 3.5" stroke="currentColor" />
    </>,
    props
  )
}

export function AccessibleIcon(props: IconProps) {
  return base(
    <>
      <circle cx="10" cy="3.6" r="1.5" fill="currentColor" stroke="none" />
      <path d="M10 6v4.5h3.5M10 8.2h-3" stroke="currentColor" />
      <path d="M10 10.5c0 3.6-2.6 5.5-4.5 5.5S2 14 3.2 11.3" stroke="currentColor" />
      <path d="M10 10.5l2 5.5" stroke="currentColor" />
    </>,
    props
  )
}

export function AlertCircleIcon(props: IconProps) {
  return base(
    <>
      <circle cx="10" cy="10" r="7.5" stroke="currentColor" />
      <path d="M10 9v4.5M10 6.8v.1" stroke="currentColor" strokeWidth={2} />
    </>,
    props
  )
}

/** "?" w kółku -- świadomie inny glif niż `AlertCircleIcon` (zarezerwowany dla wskaźnika utrudnienia), żeby dwa różne znaczenia nie dzieliły jednej ikony na tym samym ekranie. */
export function HelpCircleIcon(props: IconProps) {
  return base(
    <>
      <circle cx="10" cy="10" r="7.5" stroke="currentColor" />
      <path d="M7.8 8.2a2.2 2.2 0 1 1 3.6 1.7c-.7.6-1.2 1-1.2 1.9" stroke="currentColor" />
      <path d="M10 14.2v.1" stroke="currentColor" strokeWidth={2} />
    </>,
    props
  )
}

export function ArrowRightIcon(props: IconProps) {
  return base(<path d="m6 3 5 5-5 5" stroke="currentColor" strokeWidth={1.8} />, props, '0 0 16 16')
}

/** Dwie strzałki w przeciwnych kierunkach — przełącznik kierunku linii. */
export function SwapIcon(props: IconProps) {
  return base(
    <>
      <path d="M4 7h11l-3-3" stroke="currentColor" />
      <path d="M16 13H5l3 3" stroke="currentColor" />
    </>,
    props
  )
}

export function ShareIcon(props: IconProps) {
  return base(
    <>
      <path d="M14 6.5V4.5a1 1 0 0 0-1-1H4.5a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1H13a1 1 0 0 0 1-1v-2" stroke="currentColor" />
      <path d="M10 10h6.5m0 0L14 7.5M16.5 10 14 12.5" stroke="currentColor" />
    </>,
    props
  )
}

export function InfoIcon(props: IconProps) {
  return base(
    <>
      <circle cx="10" cy="10" r="7.2" stroke="currentColor" />
      <path d="M10 9.2v4.3" stroke="currentColor" />
      <path d="M10 6.5h.01" stroke="currentColor" strokeWidth={2} />
    </>,
    props
  )
}

/** Postój na trasie — dwie pauzy, ten sam znak co na odtwarzaczu. */
export function PauseIcon(props: IconProps) {
  return base(<path d="M7.5 5v10M12.5 5v10" stroke="currentColor" strokeWidth={1.9} />, props)
}

// --- Ikony pogodowe (widżet "Pogoda dziś" w StationAside) ---

export function CloudIcon(props: IconProps) {
  return base(<path d="M5.7 14.5a3 3 0 0 1-.4-6 4.2 4.2 0 0 1 8-1.4A3.3 3.3 0 0 1 14.3 14.5H5.7Z" stroke="currentColor" strokeLinejoin="round" />, props)
}

export function FogIcon(props: IconProps) {
  return base(<path d="M3 7.5h10M5 10.5h12M3 13.5h10" stroke="currentColor" />, props)
}

export function RainIcon(props: IconProps) {
  return base(
    <>
      <path d="M5.7 11.5a2.7 2.7 0 0 1-.3-5.4A3.8 3.8 0 0 1 12.8 4.6a3 3 0 0 1 1.5 5.9H5.7Z" stroke="currentColor" strokeLinejoin="round" />
      <path d="M6.5 13.5 5.8 15.7M10 13.5 9.3 15.7M13.5 13.5 12.8 15.7" stroke="currentColor" />
    </>,
    props
  )
}

export function SnowIcon(props: IconProps) {
  return base(
    <>
      <path d="M5.7 11.5a2.7 2.7 0 0 1-.3-5.4A3.8 3.8 0 0 1 12.8 4.6a3 3 0 0 1 1.5 5.9H5.7Z" stroke="currentColor" strokeLinejoin="round" />
      <path d="M6.5 14v.1M10 14.5v.1M13.5 14v.1" stroke="currentColor" strokeWidth={2.4} />
    </>,
    props
  )
}

export function ThunderIcon(props: IconProps) {
  return base(
    <>
      <path d="M5.7 10.5a2.7 2.7 0 0 1-.3-5.4A3.8 3.8 0 0 1 12.8 3.6a3 3 0 0 1 1.5 5.9H5.7Z" stroke="currentColor" strokeLinejoin="round" />
      <path d="M10.3 11.5 7.8 15.5h2.4L9 18.5 13.3 13h-2.6l1.6-1.5Z" stroke="currentColor" strokeLinejoin="round" />
    </>,
    props
  )
}

export function WindIcon(props: IconProps) {
  return base(
    <path
      d="M3 8h8.5a2 2 0 1 0-1.8-2.8M3 11.5h11a2 2 0 1 1-1.8 2.8M3 15h6.5a1.6 1.6 0 1 0-1.4-2.3"
      stroke="currentColor"
    />,
    props
  )
}

export function DropletIcon(props: IconProps) {
  return base(<path d="M10 3.5s5 6 5 9.5a5 5 0 0 1-10 0c0-3.5 5-9.5 5-9.5Z" stroke="currentColor" strokeLinejoin="round" />, props)
}

export function GaugeIcon(props: IconProps) {
  return base(
    <>
      <path d="M3.5 13.5a6.5 6.5 0 0 1 13 0" stroke="currentColor" />
      <path d="M10 13.5 13 9" stroke="currentColor" />
      <circle cx="10" cy="13.5" r="1" fill="currentColor" stroke="none" />
    </>,
    props
  )
}
