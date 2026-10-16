import { test, expect } from './helpers/test'
import { scanA11y } from './helpers/axe'
import { openMap, openVisibleList, visibleList } from './helpers/map'

// Mock feed: fixtures/gtfs/warszawa/vehicles.json ma 2 pozycje na kursach
// linii 20 (`20-wd-0-1`/`20-wd-0-2`), side_number 3801 / 3802. AGENTS.md #13.
const LINE_20 = '/city/warszawa/line/20'

// GTFS mock parsuje się raz przy starcie serwera, a poller pojazdów budzi się
// z pollerem rozkładu przy pierwszym trafieniu /api/gtfs/* — strona ponawia.
const READY = 45_000

test('linia: marker pojazdu na osi + karta „Pojazdy w trasie" ze znakiem bocznym', async ({ page }) => {
  await page.goto(LINE_20)
  // Nagłówek „Trasa linii" renderuje się na każdym viewporcie (nagłówek „Linia 20"
  // to tytuł karty w PageAside).
  await expect(page.getByRole('heading', { name: /Trasa linii/ })).toBeVisible({ timeout: READY })
  // Marker na osi trasy renderuje się na każdym viewporcie (jest w <ol>, nie w aside).
  await expect(page.getByTitle(/^Pojazd 380\d/).first()).toBeVisible({ timeout: READY })

  // Karta „Pojazdy w trasie" w PageAside (od `xl` po prawej, niżej pod treścią).
  await expect(page.getByText(/#380\d/).first()).toBeVisible({ timeout: READY })
})

test('widżet sieci: „W trasie teraz" pokazuje liczbę, nie „—"', async ({ page }) => {
  await page.goto('/city/warszawa')
  const line = page.getByText(/W trasie teraz/)
  await expect(line).toBeVisible({ timeout: READY })
  // feed mock jest gotowy => konkretna liczba, nigdy „—" (#7: null ≠ 0).
  await expect(line).toContainText(/W trasie teraz:\s*\d/, { timeout: READY })
})

test('a11y: strona linii z markerami pojazdów bez naruszeń serious/critical', async ({ page }) => {
  await page.goto(LINE_20)
  // Precondition widoczna na każdym viewporcie (nagłówek trasy + marker na osi, nie karta aside).
  await expect(page.getByRole('heading', { name: /Trasa linii/ })).toBeVisible({ timeout: READY })
  await expect(page.getByTitle(/^Pojazd 380\d/).first()).toBeVisible({ timeout: READY })

  const { violations } = await scanA11y(page)
  const blocking = violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''))
  expect(blocking, blocking.map((v) => `${v.id}: ${v.help}`).join('\n')).toEqual([])
})

// PR10: wiek pozycji GPS na mapie transportu. Progi z `mapData.ts`: > 90 s pojazd blednie i karta mówi „nieaktualna", > 180 s mapa go nie
// rysuje, a zaznaczony pojazd to „Utracono pozycję pojazdu" (nie udawana bieżąca pozycja). Mock ma jeden pojazd z pozycją sprzed 20 min
// (`{{STALE}}`, linia 190); żeby sprawdzić same progi, test podmienia `ageSec` tramwajów linii 20 w odpowiedzi `/api/gtfs/city-vehicles`
// (serwer liczy wiek od `{{NOW}}` fixture'u, więc 91/181 s inaczej nie da się ustawić). Odczyt odświeża się co 15 s — stan zmienia kolejna odpowiedź.
test.describe('mapa transportu: starzenie się pozycji pojazdu', () => {
  test('91 s: pozycja nieaktualna, ale karta jeszcze ją pokazuje; 181 s: „Utracono pozycję pojazdu" i pojazd znika z listy', async ({ page }) => {
    test.setTimeout(180_000)
    let ageSec = 0
    await page.route('**/api/gtfs/city-vehicles**', async (route) => {
      const response = await route.fetch()
      const body = await response.json()
      for (const vehicle of body.vehicles) if (vehicle.shortName === '20') vehicle.ageSec = ageSec
      await route.fulfill({ response, json: body })
    })
    await openMap(page)
    const list = await openVisibleList(page)
    const rows20 = list.getByRole('button', { name: /^Linia 20/ })
    await expect(rows20.first()).toBeVisible({ timeout: READY })
    // Pojazd z pozycją sprzed 20 min (mock `{{STALE}}`, linia 190) jest za stary, żeby go narysować i wylistować.
    await expect(list.getByRole('button', { name: /^Linia 190/ })).toHaveCount(0)
    await rows20.first().click()
    const card = page.getByRole('dialog', { name: /^tramwaj 20$/i })
    await expect(card).toBeVisible()
    await expect(card.getByText('aktualna', { exact: true })).toBeVisible()

    ageSec = 91
    await expect(card.getByText('nieaktualna', { exact: true })).toBeVisible({ timeout: 40_000 })
    await expect(card.getByText(/Pozycja sprzed [12] min/)).toBeVisible()
    await expect(card.getByText(/Utracono pozycję pojazdu/)).toHaveCount(0)
    await expect(card.getByText('Następny przystanek')).toBeVisible() // 91 s to jeszcze pozycja, nie utrata

    ageSec = 181
    await expect(card.getByText(/Utracono pozycję pojazdu — ostatnia sprzed 3 min/)).toBeVisible({ timeout: 40_000 })
    await expect(card.getByText('Następny przystanek')).toHaveCount(0) // karta nie udaje bieżącej pozycji
    await expect(card.getByText(/Pozycja sprzed/)).toHaveCount(0)
    await expect(card.getByText(/na czas/)).toHaveCount(0)

    // Stary pojazd znika z listy obiektów w kadrze (mapa go nie rysuje).
    await card.getByRole('button', { name: 'Zamknij kartę' }).click()
    await expect(visibleList(page)).toBeVisible() // „Lista" była otwarta przed wyborem pojazdu i wraca po zamknięciu karty
    await expect(visibleList(page).getByRole('button', { name: /^Linia 20/ })).toHaveCount(0, { timeout: 40_000 })
  })
})
