/**
 * Typy przejść widoku (`<ViewTransition>` + `transitionTypes` w `Link`/`router.push`).
 * Kierunek wybiera NASZ kod, nie przeglądarka: głębiej w aplikację = `nav-forward`, rodzic = `nav-back`,
 * zakładka dolnego paska/paska bocznego = `nav-tab` (sam krzyżowy zanik). Nawigacja bez typu (przycisk
 * „wstecz” przeglądarki, `router.back()`, odświeżenie) nie animuje się kierunkowo.
 */
export const NAV_FORWARD = 'nav-forward'
export const NAV_BACK = 'nav-back'
export const NAV_TAB = 'nav-tab'

/** Drugi argument `router.push` dla nawigacji „w głąb”. */
export const NAV_FORWARD_OPTIONS = { transitionTypes: Object.freeze([NAV_FORWARD]) as string[] }
/** Stałe tablice dla `<Link transitionTypes>` — bez nowej tablicy przy każdym renderze. */
export const NAV_BACK_TYPES = Object.freeze([NAV_BACK]) as string[]
export const NAV_TAB_TYPES = Object.freeze([NAV_TAB]) as string[]

/**
 * Nazwa współdzielonego elementu (tytuł karty Pulpitu ↔ tytuł tablicy). Musi być poprawnym identyfikatorem
 * CSS (inaczej `view-transition-name` jest po cichu ignorowane — id GTFS bywają z „:” i spacjami) i
 * różnowartościowa: dwa elementy o tej samej nazwie przerywają całe przejście. Znak spoza `[A-Za-z0-9-]`
 * to `_` + 4 cyfry szesnastkowe, więc kodowanie jest jednoznaczne.
 */
export function placeTransitionName(kind: 'pkp' | 'gtfs', id: string): string {
  const safe = id.replace(/[^A-Za-z0-9-]/g, (char) => `_${char.charCodeAt(0).toString(16).padStart(4, '0')}`)
  return `place-${kind}-${safe}`
}
