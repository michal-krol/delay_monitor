/** Provider descriptions; feed-specific author credits remain next to the timetable. */
export function DataSources() {
  return (
    <div className="flex flex-col divide-y divide-surface-border text-sm text-text-secondary">
      <details className="py-2">
        <summary className="min-h-11 cursor-pointer content-center font-medium text-foreground">PKP Polskie Linie Kolejowe</summary>
        <p className="pb-3 leading-relaxed">Serwis „Otwarte Dane”: rozkład, realizacja ruchu pociągów, utrudnienia oraz informacje o stacjach i przewoźnikach. Pozycja pociągu na mapie jest oszacowaniem, a nie odczytem GPS.</p>
      </details>
      <details className="py-2">
        <summary className="min-h-11 cursor-pointer content-center font-medium text-foreground">Komunikacja miejska — GTFS</summary>
        <p className="pb-3 leading-relaxed">Rozkłady, przebiegi linii, pozycje pojazdów i komunikaty. Rozkład i pozycja GPS nie określają punktualności pojazdu. Autorzy danych rozkładowych są podani przy rozkładzie.</p>
      </details>
      <details className="py-2">
        <summary className="min-h-11 cursor-pointer content-center font-medium text-foreground">Open-Meteo — pogoda</summary>
        <p className="pb-3 leading-relaxed">Warunki pogodowe dla wybranej stacji lub początku połączenia. Pogoda miasta jest przybliżana lokalizacją jego stacji kolejowej. Nie korzysta z lokalizacji telefonu.</p>
      </details>
      <details className="py-2">
        <summary className="min-h-11 cursor-pointer content-center font-medium text-foreground">OpenFreeMap / OpenStreetMap — mapa</summary>
        <p className="pb-3 leading-relaxed">Podkład kartograficzny. Oznaczenia pojazdów i przystanków pochodzą z odrębnych źródeł transportowych. Atrybucja podkładu pozostaje na mapie.</p>
      </details>
    </div>
  )
}
