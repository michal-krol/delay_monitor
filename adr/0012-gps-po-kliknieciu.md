# 0012. GPS tylko po kliknięciu, pozycja tylko w pamięci

- Status: przyjęte (2026-10-15, decyzja D3 serii UI mobile-first)
- Reguła: `src/components/UserLocationProvider.tsx` (hook `src/hooks/useUserLocation.ts`), `next.config.ts` (`Permissions-Policy`), `.claude/rules/security.md`

## Kontekst

Mapa („W pobliżu”) i Start potrzebują położenia użytkownika. Prompt przeglądarki wyświetlony bez
powodu jest odrzucany, a odmowa bywa trwała. Współrzędne są danymi osobowymi: nie mają trafić
do URL-a, pamięci trwałej, logów ani na serwer (#4).

## Decyzja

- Jeden `UserLocationProvider` w `(app)/layout.tsx`; `request()` wywołuje `getCurrentPosition` wyłącznie po
  akcji użytkownika (`enableHighAccuracy: false`, `timeout: 10000`, `maximumAge: 60000`).
- Równoległe kliknięcia dołączają do jednego żądania; odmowa jest zapamiętana i nie wywołuje promptu ponownie;
  timeout lub inny błąd pozwala ponowić.
- Pozycja żyje w pamięci providera do końca sesji aplikacji; po odświeżeniu strony znika.
- `Permissions-Policy`: `geolocation=(self)`, pozostałe uprawnienia bez zmian (puste).

## Konsekwencje

- Po F5 ekran z flagą `nearby=1` nie ma pozycji i pokazuje przycisk zamiast cichego pytania.
- Brak `localStorage` oznacza ponowne pytanie przeglądarki po nowej sesji (zwykle bez promptu, gdy zgoda jest zapamiętana przez przeglądarkę).
- Pozycja nie jest ciągle odświeżana; na wolno zmieniającą się okolicę wystarcza.

## Odrzucone

- `watchPosition`: stałe zużycie baterii i ciągły wskaźnik GPS bez potrzeby produktu.
- Automatyczny prompt przy wejściu na mapę: zła zgoda bez kontekstu, odmowa blokuje funkcję na stałe.
- Zapis w `localStorage`: trwałe dane o miejscu pobytu bez korzyści; stara pozycja udawałaby bieżącą (#7).
