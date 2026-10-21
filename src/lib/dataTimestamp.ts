/** Snapshot instants already normalized at the API boundary; never use this for zoneless PKP times. */
export function formatDataTimestamp(timestamp: string | number, timeZone = 'Europe/Warsaw'): string {
  return new Date(timestamp).toLocaleString('pl-PL', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone,
  })
}
