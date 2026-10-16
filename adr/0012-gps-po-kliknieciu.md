# 0012. GPS tylko po kliknięciu, pozycja tylko w pamięci

- Status: przyjęte (2026-10-15, decyzja D3 serii UI mobile-first)
- Reguła: `src/components/UserLocationProvider.tsx` (hook `useUserLocation`), `next.config.ts` (`Permissions-Policy`), `.claude/rules/security.md`, `maps.md` („Camera insets”)

**Kontekst.** „W pobliżu” i Start potrzebują położenia. Prompt bez powodu jest odrzucany, a odmowa bywa trwała. Współrzędne to dane osobowe: nie do URL-a, pamięci trwałej, logów ani serwera (#4).

**Decyzja.** Jeden `UserLocationProvider`; `getCurrentPosition` (nigdy `watchPosition`) tylko po akcji użytkownika, jednorazowo (`timeout` 10 s, `maximumAge` 60 s); równoległe kliknięcia dzielą jedno żądanie, odmowa jest zapamiętana (bez ponownego promptu), inny błąd pozwala ponowić. Pozycja żyje w pamięci do odświeżenia strony. Mapa nie zapisuje widoku wyśrodkowanego na użytkowniku (`?at=`, `localStorage`). `Permissions-Policy`: `geolocation=(self)`, reszta pusta.

**Konsekwencje.** Po F5 `?nearby=1` nie ma pozycji i pokazuje przycisk zamiast cichego pytania; nowa sesja pyta przeglądarkę od nowa (zwykle bez promptu przy zapamiętanej zgodzie); pozycja nie odświeża się sama — wystarcza dla okolicy.

**Odrzucone.** `watchPosition` (bateria, stały wskaźnik GPS bez potrzeby produktu); prompt przy wejściu na mapę (zgoda bez kontekstu, odmowa blokuje funkcję); zapis w `localStorage` (trwałe dane o miejscu pobytu, stara pozycja udawałaby bieżącą, #7).
