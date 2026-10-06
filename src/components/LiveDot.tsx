/**
 * Kropka „dane są świeże” (puls w CSS, `.live-dot`; bez `prefers-reduced-motion` stoi nieruchomo). Kolor akcentu, nie zieleń statusu:
 * zieleń znaczy „punktualnie”, a GTFS nigdy nie mówi „na czas” (#13). Czysto dekoracyjna — treść niesie napis obok.
 */
export function LiveDot() {
  return <span aria-hidden="true" data-testid="live-dot" className="live-dot" />
}
