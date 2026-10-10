/**
 * Kropka „dane są świeże” (CSS `.live-dot`: jeden puls po pojawieniu się, potem stoi nieruchomo; przy
 * `prefers-reduced-motion: reduce` nie pulsuje wcale). Kolor akcentu, nie zieleń statusu:
 * zieleń znaczy „punktualnie”, a GTFS nigdy nie mówi „na czas” (#13). Czysto dekoracyjna — treść niesie napis obok.
 */
export function LiveDot() {
  return <span aria-hidden="true" data-testid="live-dot" className="live-dot" />
}
