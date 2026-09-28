/**
 * `npm run deps:check` -- porównuje wersje z `package-lock.json` z tym, co
 * faktycznie leży w `node_modules` (także w katalogu nadrzędnym, bo worktree
 * agentów nie mają własnego). Exit 1 przy rozjeździe; woła go pre-push hook
 * przed `npm run check`.
 */
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { findDrift } from './lib/depsDrift.mjs'

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'))

// Tak jak Node szuka pakietów: `node_modules/<name>` w bieżącym katalogu
// i kolejno wyżej. Czytamy `package.json` z dysku, bo `require.resolve`
// odmawia pakietom, których mapa `exports` go nie wystawia.
function readInstalledVersion(name) {
  for (let dir = process.cwd(); ; dir = path.dirname(dir)) {
    const file = path.join(dir, 'node_modules', name, 'package.json')
    if (existsSync(file)) return readJson(file).version
    if (path.dirname(dir) === dir) return null
  }
}

const drift = findDrift(readJson('package.json'), readJson('package-lock.json'), readInstalledVersion)

if (drift.length > 0) {
  for (const { name, locked, installed } of drift) {
    console.error(`deps:check: ${name} — lockfile ${locked}, zainstalowane ${installed ?? 'brak'}`)
  }
  console.error(
    'deps:check: node_modules nie zgadza się z package-lock.json. ' +
      'Uruchom `npm ci` w głównym checkoucie (worktree używają jego node_modules).',
  )
  process.exit(1)
}
