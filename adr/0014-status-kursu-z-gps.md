# 0014. Informacyjny status kursu wywnioskowany z GPS

- Status: przyjęte (2026-10-25)
- Niezmienniki: AGENTS.md #7, #13, #16

## Kontekst

Feed pozycji zawiera identyfikator pojazdu, numer boczny, `trip_id`, współrzędne i czas
pomiaru. Rozkład osobno określa datę kursowania, przebieg i godziny odjazdów. Feed nie
dostarcza opóźnień, prognozy przyjazdu ani potwierdzenia obsługi przystanku.

## Decyzja

Dopuszczamy wyłącznie konserwatywny stan `pastScheduledDeparture`: świeży GPS pokazuje
pojazd jednoznacznie przed przystankiem konkretnego kursu, a czas pomiaru jest ponad
60 sekund późniejszy niż planowany odjazd. GPS może mieć najwyżej 60 sekund i nie może
pochodzić z przyszłości. Dopasowanie obejmuje kurs, datę i wystąpienie przystanku.
Brak wiarygodnego dopasowania oznacza brak oceny; nie wnioskujemy punktualności.

Stan pokazujemy wyłącznie czerwoną, nieinteraktywną ikoną Lucide ClockAlert z nazwą
dla czytnika ekranu. Bez tooltipu, legendy, widocznego opisu, dodatkowego czasu,
liczby minut, zielonego ani szarego statusu. Godzina rozkładowa pozostaje bez zmian.
Miejsca: odjazdy przystanku, szczegóły konkretnego kursu i statystyki pojazdów linii.
W statystykach odniesieniem jest najbliższy przystanek przed pojazdem.

Osobny link MapPin otwiera mapę na dokładnym identyfikatorze pojazdu i oczekiwanym
kursie oraz dacie. Zniknięcie lub zmiana kursu nie wybiera innego pojazdu. Mapa nie
włącza automatycznego śledzenia. Dotychczasowy próg pozycji mapowej wynosi 180 sekund,
niezależnie od surowszego progu statusu. Kolory mapy nadal oznaczają rodzaj transportu,
nie ocenę punktualności; kształtem kierunku pozostaje Lucide Navigation2.

## Konsekwencje

- Spóźniony kurs pozostaje na tablicy po godzinie rozkładowej tylko przy świeżym
  potwierdzeniu pozycji przed przystankiem; znika po jego minięciu lub utracie potwierdzenia.
- Ocena korzysta z istniejącego rozkładu i pollera GPS. Nie dodaje zapytań upstream,
  historii pozycji, trwałego magazynu ani zależności.
- Kursy częstotliwościowe i niejednoznaczne przebiegi nie otrzymują statusu.
- Symbol nie jest oficjalną realizacją z feedu i nie podaje rzeczywistego opóźnienia.

## Odrzucone alternatywy

- Zielony status przy braku alarmu: brak dowodu spóźnienia nie potwierdza punktualności.
- Minuty opóźnienia i ETA: wymagają odrębnej logiki i weryfikacji.
- Sam kolor: znaczenie musi wynikać również z kształtu i nazwy dostępnej.

## Doprecyzowanie 2026-10-26

Dostępność pinezki zależy od pozycji w feedzie, niezależnie od rzutu na trasę i liczby
przystanków. Niepewna geometria wyłącza wyłącznie wnioskowany status. Odjazdy i lista
pojazdów linii nie pokazują tekstu o wieku GPS ani odległości w przystankach.
Gdy nie można ustalić daty kursowania, link zachowuje dokładne id pojazdu i kursu;
przy znanej dacie nadal sprawdzamy zgodność daty. Próg świeżości mapy pozostaje bez zmian.
