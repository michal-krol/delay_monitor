type Props = {
  /** Z odpowiedzi API (`attributions.txt`), nie zaszyte w kodzie — kolejne miasto przynosi własną atrybucję. */
  attribution: string[]
}

/**
 * Atrybucja feedu GTFS. Wymagana przez `attributions.txt` — dla Warszawy:
 * „Zarząd Transportu Miejskiego w Warszawie" ORAZ „Mikołaj Kuranowski".
 * Renderowana z odpowiedzi, nie zaszyta.
 */
export function AttributionFooter({ attribution }: Props) {
  if (attribution.length === 0) return null
  return (
    <p className="mt-6 text-xs text-text-muted">
      Dane rozkładowe: {attribution.join(' · ')}
    </p>
  )
}
