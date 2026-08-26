import { describe, expect, it } from 'vitest'
import { decodeDisruptionMessage, disruptionTrainKey, findStopDisruptionMessages, indexDisruptedTrains } from './disruptions'
import type { RawDisruption } from '../pkp/types'

function affectedRoute(scheduleId: string, orderId: string, operatingDate: string, stationId: string) {
  return { scheduleId, orderId, operatingDate, stationId }
}

describe('decodeDisruptionMessage', () => {
  it('decodes a dictionary code to its text', () => {
    expect(decodeDisruptionMessage('utr_40', { utr_40: 'Awaria sieci trakcyjnej' })).toBe('Awaria sieci trakcyjnej')
  })

  it('returns the message verbatim when it is not a dictionary key (PKP already rendered it)', () => {
    const message = 'Na odcinku od stacji Kraków Główny do stacji Miechów pociąg został odwołany.'
    expect(decodeDisruptionMessage(message, { utr_40: 'Awaria sieci trakcyjnej' })).toBe(message)
  })

  it('returns null when the message is null', () => {
    expect(decodeDisruptionMessage(null, { utr_40: 'Awaria sieci trakcyjnej' })).toBeNull()
  })
})

describe('indexDisruptedTrains', () => {
  it('indexes every train appearing in any affectedRoutes entry, across disruptions', () => {
    const disruptions: RawDisruption[] = [
      { disruptionId: 1, message: null, affectedRoutes: [affectedRoute('2026', '111', '2026-08-26', '60103'), affectedRoute('2026', '222', '2026-08-26', '80416')] },
      { disruptionId: 2, message: null, affectedRoutes: [affectedRoute('2026', '333', '2026-08-26', '7500')] },
    ]
    const index = indexDisruptedTrains(disruptions)
    expect(index.has(disruptionTrainKey('2026', '111', '2026-08-26'))).toBe(true)
    expect(index.has(disruptionTrainKey('2026', '222', '2026-08-26'))).toBe(true)
    expect(index.has(disruptionTrainKey('2026', '333', '2026-08-26'))).toBe(true)
    expect(index.has(disruptionTrainKey('2026', '999', '2026-08-26'))).toBe(false)
  })

  it('returns an empty set for an empty disruptions list', () => {
    expect(indexDisruptedTrains([]).size).toBe(0)
  })
})

describe('findStopDisruptionMessages', () => {
  const disruptions: RawDisruption[] = [
    { disruptionId: 1, message: 'utr_40', affectedRoutes: [affectedRoute('2026', '111', '2026-08-26', '60103')] },
    { disruptionId: 2, message: 'utr_55', affectedRoutes: [affectedRoute('2026', '111', '2026-08-26', '80416')] },
  ]
  const disruptionTypes = { utr_40: 'Awaria sieci trakcyjnej', utr_55: 'Roboty budowlane' }

  it('matches only the exact scheduleId+orderId+operatingDate+stationId quadruple', () => {
    expect(findStopDisruptionMessages(disruptions, disruptionTypes, '2026', '111', '2026-08-26', '60103')).toEqual(['Awaria sieci trakcyjnej'])
  })

  it('returns an empty array when the stop does not match any affected route', () => {
    expect(findStopDisruptionMessages(disruptions, disruptionTypes, '2026', '111', '2026-08-26', '33605')).toEqual([])
  })

  it('returns an empty array for a different operatingDate of the same train', () => {
    expect(findStopDisruptionMessages(disruptions, disruptionTypes, '2026', '111', '2026-08-27', '60103')).toEqual([])
  })

  it('returns every distinct disruption affecting the stop, deduplicated by disruptionId', () => {
    const dup: RawDisruption[] = [
      { disruptionId: 9, message: 'utr_40', affectedRoutes: [affectedRoute('2026', '111', '2026-08-26', '60103'), affectedRoute('2026', '111', '2026-08-26', '60103')] },
      { disruptionId: 10, message: 'utr_55', affectedRoutes: [affectedRoute('2026', '111', '2026-08-26', '60103')] },
    ]
    expect(findStopDisruptionMessages(dup, disruptionTypes, '2026', '111', '2026-08-26', '60103')).toEqual(['Awaria sieci trakcyjnej', 'Roboty budowlane'])
  })
})
