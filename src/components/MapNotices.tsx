import { NoPositionNotice } from './map/MapToolbar'

/** Komunikaty chwilowe nad mapą / w slocie `above` arkusza: brak pozycji, „Okolica wymaga lokalizacji", toast udostępniania, błędy pobierania. */
export function MapNotices({
  noPosition,
  onCloseNoPosition,
  needsLocation,
  onShowLocation,
  shareStatus,
  problems,
}: {
  noPosition: { name: string; href: string | null; linkLabel: string } | null
  onCloseNoPosition: () => void
  needsLocation: boolean
  onShowLocation: () => void
  shareStatus: string
  problems: string[]
}) {
  return (
    <>
      {noPosition !== null && <NoPositionNotice notice={noPosition} onClose={onCloseNoPosition} />}
      {needsLocation && (
        <div role="status" className="glass-strong pointer-events-auto flex w-max max-w-full flex-wrap items-center gap-x-3 rounded-xl px-3 py-1.5 text-sm">
          <span>Okolica wymaga Twojej lokalizacji.</span>
          <button type="button" onClick={onShowLocation} className="touch-44 relative min-h-9 font-medium text-primary-text underline underline-offset-2">
            Pokaż moją lokalizację
          </button>
        </div>
      )}
      {shareStatus !== 'idle' && (
        <p role="status" className="glass-strong pointer-events-auto w-max max-w-full rounded-xl px-3 py-1.5 text-sm">
          {shareStatus === 'copied' ? 'Skopiowano link do tego widoku.' : 'Nie udało się skopiować — skopiuj adres z paska przeglądarki.'}
        </p>
      )}
      {problems.map((problem) => (
        <p key={problem} role="status" className="glass-strong pointer-events-auto w-max max-w-full rounded-xl px-3 py-1.5 text-sm text-error-text">
          {problem}
        </p>
      ))}
    </>
  )
}
