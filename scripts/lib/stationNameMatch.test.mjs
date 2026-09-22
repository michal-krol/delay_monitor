import { describe, expect, it } from 'vitest'
import { matchStationName } from './stationNameMatch.mjs'

describe('matchStationName', () => {
  it('matches an exact name (case/diacritics-insensitive)', () => {
    const candidates = [
      { name: 'Kutno', lat: 52.23, lon: 19.36 },
      { name: 'Łowicz Główny', lat: 52.11, lon: 19.94 },
    ]
    expect(matchStationName(candidates, 'łowicz główny')).toEqual(candidates[1])
  })

  it('matches when the original name is a prefix of a longer OSM name', () => {
    // Skrypt bazowy przycina "Warszawa Ochota" -> "Warszawa" zanim trafi do
    // Overpass -- odwrotny kierunek dopasowania (kandydat dłuższy niż zapytanie).
    const candidates = [{ name: 'Warszawa Ochota', lat: 52.22, lon: 20.98 }]
    expect(matchStationName(candidates, 'Warszawa')).toEqual(candidates[0])
  })

  it('matches when the OSM name is a prefix of the original (punctuation/suffix noise)', () => {
    const candidates = [{ name: 'Kraków Główny', lat: 50.07, lon: 19.95 }]
    expect(matchStationName(candidates, 'Kraków Główny os.')).toEqual(candidates[0])
  })

  it('returns null when nothing shares a meaningful prefix', () => {
    const candidates = [{ name: 'Gdynia Główna', lat: 54.52, lon: 18.53 }]
    expect(matchStationName(candidates, 'Zakopane')).toBeNull()
  })

  it('returns null for an empty candidate list', () => {
    expect(matchStationName([], 'Poznań Główny')).toBeNull()
  })

  it('picks the candidate with the longest shared prefix when several partially match', () => {
    const candidates = [
      { name: 'Poznań Wschód', lat: 52.4, lon: 17.0 },
      { name: 'Poznań Główny', lat: 52.4, lon: 16.9 },
    ]
    expect(matchStationName(candidates, 'Poznań Główny')).toEqual(candidates[1])
  })
})
