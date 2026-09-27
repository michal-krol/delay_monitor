/**
 * Jedna linia JSON na zdarzenie serwera: stały angielski klucz `event` + pola kontekstu.
 * Railway filtruje po polach, a cron zdrowia i ludzie czytają te same klucze.
 * Nigdy sekretów ani pełnych payloadów — klucz PKP jedzie w nagłówku, nie w komunikatach.
 */
export function logEvent(
  level: 'error' | 'warn',
  event: string,
  fields: Record<string, unknown> = {},
  err?: unknown
): void {
  const line: Record<string, unknown> = { level, event, ...fields }
  if (err !== undefined) line.error = err instanceof Error ? `${err.name}: ${err.message}` : String(err)
  ;(level === 'error' ? console.error : console.warn)(JSON.stringify(line))
}
