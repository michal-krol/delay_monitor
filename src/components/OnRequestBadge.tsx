export const ON_REQUEST_TITLE = 'Przystanek na żądanie — zasygnalizuj kierowcy chęć wsiadania / wysiadania'

/**
 * Jeden znacznik przystanku na żądanie (`pickup_type`/`drop_off_type` = 3, patrz
 * `.claude/rules/gtfs.md`) — tablica odjazdów, trasa linii i panel linii na mapie.
 * Słowami, nie skrótem „NŻ”: skrót trzeba było znać.
 */
export function OnRequestBadge() {
  return (
    <span
      title={ON_REQUEST_TITLE}
      className="inline-block shrink-0 whitespace-nowrap rounded border border-surface-border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-700 dark:text-amber-300"
    >
      na żądanie
    </span>
  )
}
