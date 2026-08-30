import { TrainIcon } from './icons'

/**
 * Kafelek stacji w nagłówku widoku.
 *
 * **Nie ma zdjęć stacji.** `/dictionaries/stations` w API PDP zwraca dla
 * stacji dokładnie dwa pola — `id` i `name`. Zero obrazów, współrzędnych czy
 * jakichkolwiek metadanych, z których dałoby się cokolwiek złożyć. Zamiast
 * pustego miejsca albo obcego zdjęcia „jakiegoś dworca" kafelek jest
 * generowany: gradient wyprowadzony deterministycznie z nazwy stacji, glif
 * pociągu i inicjały. Wygląda jak element kompozycji, a nie udaje fotografii.
 *
 * ponytail: kafelek generowany, do wymiany na prawdziwe zdjęcia. Gdy się
 * pojawią, podmiana jest lokalna — `<img src={`/stations/${stationId}.jpg`}>`
 * z `onError` wracającym do tego gradientu, żeby stacje bez zdjęcia dalej
 * wyglądały poprawnie. Cały widok korzysta wyłącznie z tego komponentu, więc
 * nie ma drugiego miejsca do poprawienia.
 */

/**
 * Odcień z nazwy — stabilny między renderami i między sesjami, bo liczony
 * wyłącznie z tekstu. `Math.random()` dałoby inny kafelek przy każdym
 * odświeżeniu, a ta sama stacja ma wyglądać zawsze tak samo.
 */
function hueOf(name: string): number {
  let hash = 0
  for (let index = 0; index < name.length; index += 1) {
    hash = (hash * 31 + name.charCodeAt(index)) % 360
  }
  return hash
}

/**
 * Do dwóch pierwszych liter znaczących członów nazwy („Warszawa Zachodnia" →
 * „WZ"). Człony jednoliterowe i spójniki odpadają, żeby nie robić „WNM"
 * z „Warszawa Nowy Most".
 */
function initialsOf(name: string): string {
  return name
    .split(/[\s-]+/)
    .filter((part) => part.length > 1)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('')
}

export function StationThumb({ stationName }: { stationName: string }) {
  const hue = hueOf(stationName)

  return (
    <div
      // aria-hidden: to czysta dekoracja. Nazwa stacji stoi obok w <h1>,
      // więc czytnik ekranu nie ma powtarzać jej inicjałów.
      aria-hidden="true"
      className="relative hidden h-24 w-40 shrink-0 overflow-hidden rounded-xl sm:block"
      style={{
        background: `linear-gradient(135deg, hsl(${hue} 62% 32%), hsl(${(hue + 40) % 360} 58% 20%))`,
        border: '1px solid var(--surface-border)',
      }}
    >
      <span className="absolute inset-0 grid place-items-center text-white/25">
        <TrainIcon size={44} />
      </span>
      <span className="absolute right-2 bottom-1.5 font-heading text-2xl font-extrabold tracking-tight text-white/80">
        {initialsOf(stationName)}
      </span>
    </div>
  )
}
