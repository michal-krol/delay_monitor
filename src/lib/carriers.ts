export type CarrierInfo = {
  code: string
  name: string
  /** Brak = pokazujemy samą nazwę, bez logo. */
  logoSrc?: string
}

/**
 * Mapa kodu przewoźnika z `/api/v1/schedules` na pełną nazwę i ewentualne logo.
 *
 * UWAGA: kody nie są jeszcze zweryfikowane na żywym API — fixture'y znają
 * tylko „IC" i „KM". Wpis z błędnym kodem jest nieszkodliwy (nigdy się nie
 * dopasuje, UI pokaże surowy kod), więc lepiej mieć ich za dużo niż za mało.
 * Do sprawdzenia przy nagrywaniu prawdziwych fixture'ów.
 *
 * Logotypy mamy tylko dla części przewoźników; reszta ma samą nazwę, co i tak
 * jest czytelniejsze niż surowy kod.
 */
const CARRIERS: Record<string, CarrierInfo> = {
  IC: { code: 'IC', name: 'PKP Intercity', logoSrc: '/carriers/pkp-ic.svg' },
  PKP_IC: { code: 'PKP_IC', name: 'PKP Intercity', logoSrc: '/carriers/pkp-ic.svg' },
  KM: { code: 'KM', name: 'Koleje Mazowieckie', logoSrc: '/carriers/km.svg' },
  SKM: { code: 'SKM', name: 'Szybka Kolej Miejska', logoSrc: '/carriers/skm.svg' },
  ŁKA: { code: 'ŁKA', name: 'Łódzka Kolej Aglomeracyjna', logoSrc: '/carriers/lka.svg' },
  LKA: { code: 'LKA', name: 'Łódzka Kolej Aglomeracyjna', logoSrc: '/carriers/lka.svg' },
  'Leo Express': { code: 'Leo Express', name: 'Leo Express', logoSrc: '/carriers/leo-express.svg' },

  // Bez logo — sama nazwa.
  PR: { code: 'PR', name: 'Polregio' },
  POLREGIO: { code: 'POLREGIO', name: 'Polregio' },
  KD: { code: 'KD', name: 'Koleje Dolnośląskie' },
  KS: { code: 'KS', name: 'Koleje Śląskie' },
  KW: { code: 'KW', name: 'Koleje Wielkopolskie' },
  KMŁ: { code: 'KMŁ', name: 'Koleje Małopolskie' },
  WKD: { code: 'WKD', name: 'Warszawska Kolej Dojazdowa' },
  ARRIVA: { code: 'ARRIVA', name: 'Arriva' },
  UBB: { code: 'UBB', name: 'Usedomer Bäderbahn' },
  ZKA: { code: 'ZKA', name: 'Zastępcza komunikacja autobusowa' },
}

export function getCarrierInfo(code: string): CarrierInfo | undefined {
  return CARRIERS[code]
}
