import { test, expect } from '@playwright/test'
import { scanA11y } from './helpers/axe'

const READY = 45_000

test('linia: aktywny alert z fixture\'u pokazuje baner utrudnienia, alert linii 999 nie', async ({ page }) => {
  await page.goto('/city/warszawa/line/20')
  await expect(page.getByRole('heading', { name: /Trasa linii/ })).toBeVisible({ timeout: READY })
  await expect(page.getByText('Utrudnienia w kursowaniu linii 20')).toBeVisible({ timeout: READY })
  await expect(page.getByRole('link', { name: /Szczegóły/ })).toHaveAttribute('href', 'https://www.wtp.waw.pl/utrudnienia/test-1/')
  // W TEJ SAMEJ nawigacji, PO potwierdzeniu, że baner w ogóle się renderuje —
  // inaczej ten test przechodzi nawet gdyby renderowanie alertów było całkiem
  // zepsute (fixture ma trzeci alert bez żadnej linii, ale linia 999 nie jest
  // obsługiwana przez linię 20, więc jej tekst nie może się pojawić).
  await expect(page.getByText('Utrudnienie na linii spoza fixture\'u')).not.toBeVisible()
})

test('przystanek: zakładka Komunikaty pokazuje utrudnienie linii 20 też zawężona do jednego przystanku (?member= deep-link)', async ({ page }) => {
  // Regresja: 100101 to przystanek zespołu 1001 (Centrum), obsługiwany przez
  // linię 20 (patrz fixtures/gtfs/warszawa/stop_times.txt). Handler
  // `/api/gtfs/board` kiedyś dopasowywał alerty po `scopeId ?? group.id`,
  // a `groupRoutes` zna tylko klucze zespołów — przystanek zawężał wynik do [].
  await page.goto('/city/warszawa/stop/100101')
  await expect(page.getByRole('heading', { name: 'Centrum', exact: true })).toBeVisible({ timeout: READY })
  const alertsTab = page.getByRole('tab', { name: /Komunikaty/ })
  await expect(alertsTab).toBeVisible({ timeout: READY })
  await alertsTab.click()
  await expect(page.getByText('Utrudnienia w kursowaniu linii 20')).toBeVisible()
})

test('a11y: strona linii z widocznym banerem utrudnienia bez naruszeń serious/critical', async ({ page }) => {
  await page.goto('/city/warszawa/line/20')
  await expect(page.getByRole('heading', { name: /Trasa linii/ })).toBeVisible({ timeout: READY })
  await expect(page.getByText('Utrudnienia w kursowaniu linii 20')).toBeVisible({ timeout: READY })

  const { violations } = await scanA11y(page)
  const blocking = violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''))
  expect(blocking, blocking.map((v) => `${v.id}: ${v.help}`).join('\n')).toEqual([])
})

// Kontrakt `alertFeed` (PR „komunikaty w kontekście"): stan feedu obok `alerts`, żeby ekrany odróżniały awarię od pustego
// sukcesu. Mock GTFS = zero sieci; poller alertów budzi się przy pierwszym żądaniu, więc czekamy aż feed będzie `ready`.
test('API: /api/gtfs/line i /board niosą alertFeed gotowego feedu obok alerts', async ({ request }) => {
  await expect
    .poll(async () => (await (await request.get('/api/gtfs/line?city=warszawa&route=20')).json()).alertFeed?.state, { timeout: READY })
    .toBe('ready')
  const line = await (await request.get('/api/gtfs/line?city=warszawa&route=20')).json()
  expect(line.alertFeed).toMatchObject({ state: 'ready', fetchedAt: expect.any(String), ageMs: expect.any(Number) })
  expect(Array.isArray(line.alerts)).toBe(true)

  const board = await (await request.get('/api/gtfs/board?city=warszawa&stops=1001')).json()
  expect(board.alertFeed).toMatchObject({ state: 'ready', fetchedAt: expect.any(String) })
  expect(Array.isArray(board.stops[0].alerts)).toBe(true)
})

// Jedno ogłoszenie obejmujące kilka trybów (fixture A/TEST/4: metro M1 + autobus 128) trafia do OBU linii, ta sama treść.
for (const [routeId, mode] of [['M1', 'metro'], ['128', 'autobus']] as const) {
  test(`linia ${routeId} (${mode}): ogłoszenie wielotrybowe M1+128 jest widoczne`, async ({ page }) => {
    await page.goto(`/city/warszawa/line/${routeId}`)
    await expect(page.getByText('Zmiany na M1 i 128 — prace remontowe')).toBeVisible({ timeout: READY })
    await expect(page.getByText('Utrudnienia w kursowaniu linii 20')).not.toBeVisible()
  })
}

for (const colorScheme of ['light', 'dark'] as const) {
  test(`a11y: strona linii z rozwiniętym komunikatem w trybie ${colorScheme === 'dark' ? 'ciemnym' : 'jasnym'} bez naruszeń serious/critical`, async ({ page }) => {
    await page.emulateMedia({ colorScheme })
    await page.goto('/city/warszawa/line/20')
    const title = page.getByText('Utrudnienia w kursowaniu linii 20')
    await expect(title).toBeVisible({ timeout: READY })
    await title.click() // rozwija treść: skan obejmuje też link źródła i pełne body
    await expect(page.getByText('Testowy alert na linię 20 (fixture mock).')).toBeVisible()

    const { violations } = await scanA11y(page)
    const blocking = violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''))
    expect(blocking, blocking.map((v) => `${v.id}: ${v.help}`).join('\n')).toEqual([])
  })
}
