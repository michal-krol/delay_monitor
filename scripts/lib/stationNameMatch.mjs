/**
 * Usuwa polskie diakrytyki i normalizuje do porównania -- "Łódź" -> "lodz".
 *
 * `ł`/`Ł` transliterowane RĘCZNIE przed NFD: to osobna litera, nie znak
 * bazowy + akcent, więc NFD jej nie dekomponuje -- bez tego kroku
 * `[^a-z0-9 ]` niżej po prostu by ją WYCIĘŁA ("Piła" -> "pia"), a wtedy
 * zderzałaby się z zupełnie inną, krótszą nazwą ("Pia") zamiast zostać
 * odróżniona.
 */
function normalize(name) {
  return name
    .replace(/[łŁ]/g, 'l')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, '')
    .trim()
}

function sharedPrefixLength(a, b) {
  const shorter = Math.min(a.length, b.length)
  let i = 0
  while (i < shorter && a[i] === b[i]) i += 1
  return i
}

/**
 * Dopasowanie nazwa-do-nazwy dla kandydatów Overpass wokół już znanej
 * współrzędnej miejscowości. Precyzja stacji nie jest celem (patrz nagłówek
 * `enrich-station-coords.mjs`) -- wystarczy, że jedna nazwa jest prefiksem
 * SŁÓW drugiej po normalizacji (w dowolną stronę: `geocodeWithFallback()`
 * w tym samym skrypcie już przycina "Warszawa Ochota" -> "Warszawa", więc
 * kandydat bywa dłuższy LUB krótszy niż oryginalna nazwa stacji PLK).
 *
 * Prefiks na GRANICY SŁOWA, nie znakowy -- bez tego "Ruda" byłaby prefiksem
 * "Rudawa" (review: znalezione jako fałszywe trafienie). Zero trafień
 * z żadnym prefiksem -> `null`, żeby wpis został jak był (`city-fallback`/
 * `failed`), obsłużony później na mapie (pomijany, nie zgadywany).
 */
export function matchStationName(candidates, originalName) {
  const target = normalize(originalName)
  if (target.length === 0) return null

  let best = null
  let bestScore = 0
  for (const candidate of candidates) {
    const name = normalize(candidate.name)
    if (name.length === 0) continue
    const isWordBoundaryMatch = target === name || target.startsWith(`${name} `) || name.startsWith(`${target} `)
    if (!isWordBoundaryMatch) continue
    const score = sharedPrefixLength(target, name)
    if (score > bestScore) {
      bestScore = score
      best = candidate
    }
  }
  return best
}
