/**
 * Buduje odpowiedź `fetch` do podstawienia w testach. Ta sama funkcja była
 * skopiowana dosłownie do sześciu plików testowych (plus wariant z nagłówkami
 * w kliencie PKP) — wydzielona tu raz, bo każda kopia to jedno miejsce więcej,
 * w którym trzeba pamiętać o zmianie przy okazji.
 *
 * Zwraca `Promise<Response>`, nie goły `Response` — kilka testów używa
 * `vi.useFakeTimers()` z `vi.advanceTimersByTimeAsync()`, gdzie liczba ticków
 * mikrozadań ma znaczenie. Zmiana tego akurat szczegółu zmieniła zachowanie
 * i zepsuła testy — sprawdzone empirycznie, nie założone.
 */
export function jsonResponse(body: unknown, headers: Record<string, string> = {}): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers }))
}
