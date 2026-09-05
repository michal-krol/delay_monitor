import { describe, expect, it } from 'vitest'
import { parseAlertFeed } from './alerts'

const good = {
  id: 'A/IMPEDIMENT/176217',
  routes: ['S3', 'S4'],
  effect: 'REDUCED_SERVICE',
  link: 'https://www.wtp.waw.pl/utrudnienia/2026/09/05/x/',
  title: 'Utrudnienia w kursowaniu pociągów SKM linii S3 i S4',
  body: 'Z przyczyn technicznych...',
  htmlbody: '<p>Z przyczyn technicznych...</p>',
}

describe('parseAlertFeed', () => {
  it('maps a well-formed feed and drops htmlbody entirely', () => {
    const r = parseAlertFeed({ time: '2026-09-05T11:27:23+02:00', alerts: [good] })
    expect(r.alerts).toHaveLength(1)
    expect(r.alerts[0]).toEqual({
      id: good.id,
      routes: good.routes,
      effect: good.effect,
      link: good.link,
      title: good.title,
      body: good.body,
    })
    expect(r.alerts[0]).not.toHaveProperty('htmlbody')
    expect(r.droppedAlerts).toBe(0)
    expect(r.feedTime).toBe('2026-09-05T11:27:23+02:00')
  })

  it('accepts an effect outside the observed two-value sample (open string, not a closed enum)', () => {
    const r = parseAlertFeed({ alerts: [{ ...good, effect: 'DETOUR' }] })
    expect(r.alerts[0].effect).toBe('DETOUR')
  })

  it('accepts an empty routes array (matches nothing downstream, but is not a malformed record)', () => {
    const r = parseAlertFeed({ alerts: [{ ...good, routes: [] }] })
    expect(r.alerts).toHaveLength(1)
    expect(r.alerts[0].routes).toEqual([])
  })

  it('drops and counts a record missing id, keeps the rest', () => {
    const r = parseAlertFeed({ alerts: [good, { ...good, id: undefined }] })
    expect(r.alerts).toHaveLength(1)
    expect(r.droppedAlerts).toBe(1)
  })

  it('defaults missing optional fields to empty strings', () => {
    const r = parseAlertFeed({ alerts: [{ id: 'x', routes: ['20'] }] })
    expect(r.alerts[0]).toMatchObject({ effect: 'UNKNOWN_EFFECT', link: '', title: '', body: '' })
  })

  it('returns empty on a shape that is not the feed', () => {
    expect(parseAlertFeed(null)).toEqual({ alerts: [], droppedAlerts: 0, feedTime: null })
    expect(parseAlertFeed({ nope: 1 })).toEqual({ alerts: [], droppedAlerts: 0, feedTime: null })
  })
})
