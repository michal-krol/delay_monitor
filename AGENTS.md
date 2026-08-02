<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Monitor opóźnień PKP — niezmienniki projektu

Rzeczy, które łatwo zepsuć nieświadomie, bo nie widać ich w kodzie w miejscu,
w którym się pracuje. Pełny opis architektury i uzasadnienia: `README.md`.

## 1. Żaden czas z API nie może przejść przez gołe `new Date()`

`/operations` czasem zwraca czasy bez oznaczenia strefy (`"2026-08-02T00:33:00"`).
To czas warszawski, ale `new Date()` czyta taki ciąg w strefie **procesu** —
lokalnie w Polsce wychodzi przypadkiem dobrze, w kontenerze na Railway (UTC)
przesuwa każdy pociąg o 1–2 h. Ten błąd już raz trafił na produkcję.

Wszystkie cztery pola czasowe (`plannedArrival`, `plannedDeparture`,
`actualArrival`, `actualDeparture`) przechodzą przez `normalizeApiTimestamp()`
z `src/lib/pkp/time.ts`, na granicy schematu Zod. Jeśli dokładasz nowe pole
czasowe z API — podłącz je tam samo.

Uruchamiaj testy także pod `TZ=UTC` — to odwzorowuje produkcję:

```bash
TZ=UTC npm run test
```

## 2. Budżet zapytań do API jest zasobem krytycznym

Klucz Basic daje 100 zapytań/godzinę **oraz** 1000/dobę jednocześnie. Poller
przy 90 s zużywa ~40/h, więc zapas jest realny, ale nieduży.

- Nie dokładaj zapytań do cyklu pollera bez policzenia kosztu na godzinę.
- Nowe źródło danych domyślnie powinno być cache'owane; jeśli nie da się —
  to jest decyzja do świadomego podjęcia, nie szczegół implementacyjny.
- Brak nagłówka `X-RateLimit-*` znaczy „nie wiadomo", nigdy „zero".
  Traktowanie go jako zera raz już zepchnęło poller na stałe na interwał
  awaryjny.

## 3. Jedna replika, stan w pamięci

Dwie repliki to dwa pollery i podwójne zużycie limitu. Skalowanie poziome jest
świadomie wykluczone; snapshoty i rejestr nazw stacji żyją w pamięci procesu.
Nie wprowadzaj założeń wymagających współdzielonego stanu bez zmiany tej decyzji.

Cache w długo żyjącym procesie musi mieć TTL i limit wpisów — użyj
`createTtlCache()` z `src/lib/cache.ts`, nie gołej `Map`.

## 4. Sieć wyłącznie na krawędziach

Cały HTTP siedzi w `src/lib/pkp/client.ts`. Logika domenowa (`lib/board/`) to
czyste funkcje zależne od interfejsu `PkpClient`, nie od implementacji. Dzięki
temu testy nie potrzebują ani sieci, ani klucza API — i to ma tak zostać.

Wybór live/mock następuje raz, przy starcie, w `lib/board/instance.ts`. Żaden
inny moduł nie powinien wiedzieć, skąd pochodzą dane.

## 5. UI nigdy nie jest pusty

Przy awarii API pokazujemy ostatni znany dobry snapshot wraz z jego wiekiem,
zamiast czyścić widok. Awaria objawia się rosnącym wiekiem danych, nie białym
ekranem. Baner błędu jest zarezerwowany dla błędu konfiguracji (401).

Nie chowaj awarii pod pustym stanem — „brak wyników" i „nie udało się sprawdzić"
to dwa różne komunikaty.

## 6. Fixture'y nie odwzorowują żywego API

Inne ID stacji (Warszawa Centralna: `5100` w mocku, `33605` na żywo), 3 pociągi
zamiast kilkudziesięciu, dwa kody przewoźników zamiast kilkunastu. Nadają się do
pracy nad UI — nie do wnioskowania o zachowaniu produkcji.

Kształt odpowiedzi sprawdzaj w publicznym schemacie, nie zgaduj z fixture'ów:

```bash
curl -s https://pdp-api.plk-sa.pl/swagger/v1/swagger.json
```

Jest dostępny bez klucza i bez zużycia limitu.

## 7. Katalog `docs/` nie jest publikowany

`docs/` (projekt techniczny, plan implementacji) jest w `.gitignore` i celowo
nie trafia do repozytorium. Nie dodawaj go z powrotem.

## 8. Bramka jakości

Commity trafiają bezpośrednio na `main`, z którego deployuje Railway. Przed
oddaniem pracy:

```bash
npm run typecheck && npm run lint && npm run test
```

Zmiany widoczne w interfejsie weryfikuj w przeglądarce, nie tylko testami.
