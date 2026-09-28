/**
 * Zależności bezpośrednie, których zainstalowana wersja różni się od
 * `package-lock.json`. Worktree agentów korzystają z `node_modules` głównego
 * checkoutu, który po scaleniach Dependabota bywa nieaktualny -- testy
 * i build idą wtedy na innych wersjach, niż zapisał lockfile gałęzi.
 *
 * @param {{ dependencies?: Record<string, string>, devDependencies?: Record<string, string> }} pkg
 * @param {{ packages: Record<string, { version?: string }> }} lock
 * @param {(name: string) => string | null | undefined} readInstalledVersion
 * @returns {{ name: string, locked: string, installed: string | null }[]}
 */
export function findDrift(pkg, lock, readInstalledVersion) {
  const names = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })
  return names.flatMap((name) => {
    const locked = lock.packages[`node_modules/${name}`]?.version
    if (!locked) return []
    const installed = readInstalledVersion(name) ?? null
    return installed === locked ? [] : [{ name, locked, installed }]
  })
}
