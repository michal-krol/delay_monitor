/**
 * Hak startowy Next.js. `register()` MUSI się zakończyć, zanim serwer zacznie
 * obsługiwać żądania — dlatego samo ładowanie rozkładu NIGDY nie jest tu
 * awaitowane (`ensureLoaded()` jest fire-and-forget z natury, patrz
 * `gtfs/poller.ts` i `gtfs/instance.ts` `warmUpGtfsPollers()`). Import
 * dynamiczny + `NEXT_RUNTIME === 'nodejs'`: kod pollera dotyka
 * `setTimeout`/pamięci procesu, nie ma sensu na Edge, a `register()` jest
 * wołane w obu środowiskach.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { warmUpGtfsPollers } = await import('@/lib/gtfs/instance')
    warmUpGtfsPollers()
  }
}
