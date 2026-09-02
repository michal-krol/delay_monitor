'use client'

import { useRouter } from 'next/navigation'
import { StationSearch } from './StationSearch'

/**
 * Kolumna „Przystanki miejskie" na ekranie miasta — wyszukiwarka zespołów.
 * Świadomie inny słownik niż kolumna kolejowa: żadnego mieszania, żadnego
 * „na czas". Wpada w istniejący `StationSearch` przez prop `endpoint`.
 */
export function TransitStopList({ city }: { city: string }) {
  const router = useRouter()
  return (
    <div className="space-y-3">
      <StationSearch
        endpoint={`/api/gtfs/stops?city=${encodeURIComponent(city)}`}
        placeholder="Szukaj przystanku…"
        onSelect={(stop) => router.push(`/miasto/${city}/przystanek/${encodeURIComponent(stop.id)}`)}
      />
      <p className="text-xs text-text-muted">
        Metro, tramwaj, autobus i kolej strefowa — rozkład jazdy, bez informacji o opóźnieniach.
      </p>
    </div>
  )
}
