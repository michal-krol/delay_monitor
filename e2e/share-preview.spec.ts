import { test, expect, type APIRequestContext } from '@playwright/test'

// Podgląd linku (og:image + tytuł) czytają boty bez przeglądarki — wystarczy HTTP, więc jeden projekt.
test.skip(({ isMobile }) => isMobile, 'HTTP-only, bez różnicy między projektami')

// GTFS mock parsuje się raz przy starcie serwera (~kilkanaście s); do tego czasu karta jest ogólna.
const READY = 45_000

async function head(request: APIRequestContext, path: string) {
  const html = await (await request.get(path)).text()
  const title = /<title>([^<]*)<\/title>/.exec(html)?.[1] ?? ''
  const image = /property="og:image" content="([^"]+)"/.exec(html)?.[1] ?? null
  return { title, image }
}

async function imageOf(request: APIRequestContext, src: string) {
  const response = await request.get(new URL(src).pathname)
  return { response, body: await response.body() }
}

test('stacja PKP: tytuł i og:image z naszej nazwy, ?name= ignorowane', async ({ request }) => {
  const { title, image } = await head(request, '/station/273?name=EVIL')
  expect(title).toBe('Szczecin Główny — Monitor opóźnień')
  expect(image).not.toBeNull()
  const { response } = await imageOf(request, image!)
  expect(response.status()).toBe(200)
  expect(response.headers()['content-type']).toBe('image/png')
  expect(response.headers()['cache-control']).not.toContain('immutable')
})

test('stacja PKP: nieznany id → ogólny tytuł i ogólna karta, ten sam PNG co dla ?name=', async ({ request }) => {
  const plain = await head(request, '/station/99999999')
  const hostile = await head(request, '/station/99999999?name=EVIL')
  expect(plain.title).toBe('Monitor opóźnień')
  expect(hostile.title).toBe('Monitor opóźnień')
  const a = await imageOf(request, plain.image!)
  const b = await imageOf(request, hostile.image!)
  expect(a.response.status()).toBe(200)
  expect(a.body.equals(b.body)).toBe(true)
})

test('przystanek i linia GTFS: tytuł z rozkładu, karta PNG', async ({ request }) => {
  await expect
    .poll(async () => (await head(request, '/city/warszawa/stop/1001')).title, { timeout: READY })
    .toBe('Centrum — Monitor opóźnień')
  const stop = await head(request, '/city/warszawa/stop/1001?name=EVIL')
  expect((await imageOf(request, stop.image!)).response.headers()['content-type']).toBe('image/png')

  const line = await head(request, '/city/warszawa/line/20')
  expect(line.title).toBe('20 — Monitor opóźnień')
  expect((await imageOf(request, line.image!)).response.status()).toBe(200)
})

test('przystanek GTFS o nieznanym id: ogólna karta, nie 500', async ({ request }) => {
  const { title, image } = await head(request, '/city/warszawa/stop/ZZZZ')
  expect(title).toBe('Monitor opóźnień')
  expect((await imageOf(request, image!)).response.status()).toBe(200)
})
