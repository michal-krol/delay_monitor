/**
 * Kolorowa plakietka kategorii handlowej pociągu („IC", „EIP", „KM").
 *
 * Kolor idzie z KLASY USŁUGI, nie z pojedynczego kodu — patrz tokeny
 * `--cat-*` w `globals.css`, gdzie stoi uzasadnienie i zmierzone kontrasty.
 * Tu żyje wyłącznie mapowanie kod → klasa; sam kolor pozostaje w tokenach,
 * żeby nie powtórzyć błędu `StationCard`/`NetworkStatsCard`, które trzymają
 * własne hexy i przez to rozjeżdżają się z motywem.
 */

type ServiceClass = 'premium' | 'long' | 'regional' | 'urban' | 'default'

/**
 * Kody obserwowane w polskiej sieci, pogrupowane po klasie usługi.
 *
 * Lista jest świadomie niepełna i **nie musi** być pełna: `commercialCategorySymbol`
 * jest zakresowany per przewoźnik (patrz `commercialCategoriesResponseSchema`
 * w `pkp/schema.ts`), więc żadna skończona lista nie pokryje wszystkich
 * kombinacji. Nieznany kod dostaje `default` — neutralny, czytelny, nigdy
 * losowy.
 */
const SERVICE_CLASS: Record<string, ServiceClass> = {
  // Premium / duże prędkości
  EIP: 'premium',
  // Dalekobieżne
  EIC: 'long',
  IC: 'long',
  EC: 'long',
  EN: 'long',
  TLK: 'long',
  MP: 'long',
  EX: 'long',
  // Regionalne
  REG: 'regional',
  R: 'regional',
  RE: 'regional',
  KM: 'regional',
  PR: 'regional',
  IR: 'regional',
  KD: 'regional',
  KS: 'regional',
  // Aglomeracyjne / miejskie
  SKM: 'urban',
  S: 'urban',
  SKA: 'urban',
  WKD: 'urban',
  ŁKA: 'urban',
}

export function serviceClassOf(category: string): ServiceClass {
  return SERVICE_CLASS[category.toUpperCase()] ?? 'default'
}

type Props = {
  /** Symbol kategorii, np. „EIC". Pusty ciąg = brak dopasowanej trasy — komponent nic nie renderuje. */
  category: string
  /** Pełna nazwa kategorii ze słownika, do `title`. */
  categoryName?: string | null
}

export function CategoryBadge({ category, categoryName }: Props) {
  if (category === '') return null

  return (
    <span
      className="inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] leading-none font-bold tracking-wide tabular-nums"
      style={{ backgroundColor: `var(--cat-${serviceClassOf(category)}-bg)`, color: 'var(--cat-fg)' }}
      title={categoryName ?? undefined}
    >
      {category}
    </span>
  )
}
