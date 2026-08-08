/**
 * Klucz łączący `/operations` z `/schedules`. `orderId` bywa identyfikatorem
 * konkretnego przejazdu w `/operations`, a nie wzorca trasy z `/schedules` —
 * `trainOrderId`, gdy obecny, jest tym wspólnym kluczem po obu stronach
 * (patrz `RawRoute.trainOrderId`). Sam `scheduleId-orderId` gubił trasę dla
 * ok. połowy pociągów w danych produkcyjnych.
 *
 * Wydzielone z `transform.ts` (który wciąż go re-eksportuje, dla
 * dotychczasowych importów) do własnego, zależnościowo pustego modułu —
 * zarówno `transform.ts`, jak i `upstreamEstimate.ts` go potrzebują, a
 * gdyby został w `transform.ts`, powstałby cykl importów między nimi.
 */
export function routeKey(scheduleId: string, orderId: string, trainOrderId: string | null): string {
  return `${scheduleId}-${trainOrderId ?? orderId}`
}
