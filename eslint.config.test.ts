import { describe, expect, it } from 'vitest'
import { ESLint } from 'eslint'

/**
 * AGENTS.md #9: trasy PKP indeksujemy przez `indexRoutesByTrain()`, nigdy
 * `new Map(routes.map(...))`. Ten test pilnuje, że reguła lintera naprawdę
 * łapie wzorzec (w zakresie) i nie łapie zwykłych map poza nim.
 */
const eslint = new ESLint()

async function routeMapErrors(code: string, filePath: string): Promise<number> {
  const [result] = await eslint.lintText(code, { filePath })
  return result.messages.filter((m) => m.ruleId === 'no-restricted-syntax').length
}

describe('route index lint rule (AGENTS.md #9)', () => {
  it.each([
    'export const index = new Map(routes.map((r) => [r.orderId, r]))',
    'export const index = new Map(route.map((r) => [r.orderId, r]))',
    'export const index = new Map(rawRoutes.map((r) => [r.orderId, r]))',
    'export const index = new Map(snapshot.routes.map((r) => [r.orderId, r]))',
  ])('flags %s in src/lib/board and src/lib/pkp', async (code) => {
    const source = `declare const routes: any, route: any, rawRoutes: any, snapshot: any\n${code}\n`
    expect(await routeMapErrors(source, 'src/lib/board/fixture.ts')).toBe(1)
    expect(await routeMapErrors(source, 'src/lib/pkp/fixture.ts')).toBe(1)
  })

  it('leaves other Maps alone', async () => {
    const source = [
      'declare const stations: any, routes: any',
      'export const a = new Map(stations.map((s) => [s.id, s]))',
      'export const b = new Map<string, number>()',
      'export const c = routes.map((r) => r.orderId)',
    ].join('\n')
    expect(await routeMapErrors(source, 'src/lib/board/fixture.ts')).toBe(0)
  })

  it('does not apply outside the PKP domain', async () => {
    const source = 'declare const routes: any\nexport const i = new Map(routes.map((r) => [r.id, r]))\n'
    expect(await routeMapErrors(source, 'src/lib/gtfs/fixture.ts')).toBe(0)
  })
})
