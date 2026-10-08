# 0008. PWA bez service workera i bez powiadomień push

- Status: przyjęte (2026-10-07, decyzja właściciela)
- Reguła: `.claude/rules/ui-states.md` (#7), `.claude/rules/pkp-budget.md` (#3)

## Kontekst

Aplikacja jest instalowalna (manifest + ikony), ale bez service workera. Pytanie: czy dokładać
service worker (tryb offline, powiadomienia push)? Dane to żywe opóźnienia z jednego klucza PKP
(100/h) — nieaktualna tablica z pamięci podręcznej jest gorsza niż uczciwy wiek danych (#7),
a push wymaga stanu po stronie serwera (subskrypcje) i odpytywania PKP w imieniu użytkowników,
czyli sprzecznych z jedną repliką w pamięci (#5) i budżetem (#3).

## Decyzja

- Brak service workera i brak push, dopóki nie pojawi się realny sygnał (prośby użytkowników,
  dane o instalacjach). Instalowalność = manifest, ikony, zrzuty, skróty, metki iOS.
- Zamiast tego: podpowiedź „Zainstaluj aplikację” (`beforeinstallprompt` / instrukcja iOS, raz),
  jawna widoczność „dotknij, by odświeżyć” w trybie aplikacji i odświeżenie po powrocie do karty,
  gdy termin zwykłego odpytywania już minął (`usePolling`) — koszt dla PKP nie rośnie ponad zwykły
  rytm, bo po odświeżeniu termin leży znów w przyszłości.

## Konsekwencje

- Offline = ostatni stan z pamięci karty + baner „Brak połączenia”; zimny start offline nie działa.
- Android może nie pokazać pełnego okna instalacji bez service workera (zależnie od wersji Chrome);
  przycisk i menu przeglądarki nadal instalują. Do sprawdzenia na prawdziwych urządzeniach.

## Odrzucone

- Service worker z cache tablic: ryzyko pokazania starych opóźnień jako aktualnych.
- Push: wymaga bazy subskrypcji i nowych zapytań do PKP; rewizja, gdy będzie sygnał i osobny klucz.
