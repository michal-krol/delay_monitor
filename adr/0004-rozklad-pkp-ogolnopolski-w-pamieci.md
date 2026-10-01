# 0004. Rozkład PKP pobierany ogólnopolsko, raz na pół doby

- Status: przyjęte (2026-09-29)
- Niezmienniki: AGENTS.md #3 (budżet PKP), #5 (jedna replika, stan w pamięci)

## Kontekst

Dotąd `/schedules` było pobierane dla zestawu stacji wszystkich aktywnych użytkowników, a klucz
cache'u był tym zestawem. Każda zmiana zestawu (nowy użytkownik, ale też czyjeś odejście po
wygaśnięciu 5-minutowego zainteresowania) dawała nowy klucz i pobranie całego rozkładu od zera.
Cache 24 h przy ruchu większym niż jeden użytkownik był więc w praktyce nieskuteczny, a to
zapytania z limitu 100/h.

Pomiar na żywym API (2026-09-29): zapytanie bez `stations` (dziś+jutro, `fullRoute=true`) to
43 MB, 9 014 tras, 161 tys. przystanków, ok. 1,4 s pobierania i ok. 1,7 s parsowania z indeksem.
Ok. 125 MB sterty po sparsowaniu (ok. 230 MB w procesie). Replika ma limit 8 GB, przez 7 dni
zużywała średnio 1,2 GB, maksymalnie 1,8 GB.

## Decyzja

Jedna migawka ogólnopolskiego rozkładu na okno dat, ważna 12 h (2–3 zapytania na dobę
niezależnie od użytkowników). Indeks stacja → trasy i `scheduleId|orderId` → trasa budowany raz
przy wczytaniu. `getSchedules(stationIds)` tylko filtruje pamięć, więc identyfikatory stacji
z zewnątrz w ogóle nie trafiają do zapytania PKP. Trasa pociągu dla `/api/train` bierze się
z migawki, więc zimny miss kosztuje 2 zapytania zamiast 3. Nieudane odświeżenie zachowuje ostatnią
migawkę tego samego okna i ponawia po 10 min.

## Konsekwencje

- Stały koszt ok. 230 MB pamięci i jednorazowy postój pętli zdarzeń ok. 1,7 s przy każdym
  odświeżeniu (co 12 h i po restarcie). Akceptujemy: `/api/board` czyta pamięć i nie czeka na PKP.
- Po restarcie pierwszy tik pollera czeka na 43 MB; do tego czasu tablice pokazują stan „nie wiadomo".
- Świadome uproszczenie: trasy trzymane w pełnym kształcie ze schematu (`passthrough`). Zmniejszenie
  do potrzebnych pól dałoby ok. 58 MB zamiast 125 MB (zmierzone), zrobić dopiero, gdy pamięć stanie
  się problemem.
- Odświeżenie tylko po TTL i zmianie okna dat; `/data-version` nie wyzwala odświeżenia
  (rozkład zmienia się rzadko, a 43 MB nie warto pobierać częściej).

## Odrzucone alternatywy

- Cache inkrementalny po stacjach (pobieranie tylko brakujących): więcej zapytań przy ruchu
  i kod scalania wyników; ogólnopolska migawka jest prostsza i tańsza w zapytaniach.
- Ogólnopolski `/operations` z `fullRoutes`: ok. 29 tys. przejazdów to 6 stron na przebieg
  (240 zapytań/h przy rytmie 90 s wobec limitu 100/h); trasy i tak są w rozkładzie.
- Zapis rozkładu na dysk: łamie założenie ADR 0001 (stan w pamięci) dla kilku zapytań po restarcie.
