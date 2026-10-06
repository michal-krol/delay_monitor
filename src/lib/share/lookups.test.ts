// @vitest-environment node
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { peekGtfsPoller } from '@/lib/gtfs/instance'
import { getStationName } from '@/lib/weather/coordinates'
import { liveLookups } from './lookups'

describe('getStationName', () => {
  it('returns the name from the static dictionary', async () => {
    expect(await getStationName('273')).toBe('Szczecin Główny')
  })
  it('returns null for an unknown id, including prototype keys', async () => {
    expect(await getStationName('0000')).toBeNull()
    expect(await getStationName('__proto__')).toBeNull()
  })
})

describe('liveLookups', () => {
  it('schedule() does not create or wake a poller', () => {
    expect(liveLookups.schedule('warszawa')).toBeNull()
    expect(peekGtfsPoller('warszawa')).toBeNull()
  })
  it('never imports a PKP edge (AGENTS.md #3)', async () => {
    const source = await readFile(path.join(__dirname, 'lookups.ts'), 'utf-8')
    expect(source).not.toMatch(/from '[^']*(board\/instance|pkp\/client)'/)
  })
})
