export type CarrierInfo = {
  code: string
  name: string
  logoSrc: string
}

const CARRIERS: Record<string, CarrierInfo> = {
  IC: { code: 'IC', name: 'PKP Intercity', logoSrc: '/carriers/pkp-ic.svg' },
  KM: { code: 'KM', name: 'Koleje Mazowieckie', logoSrc: '/carriers/km.svg' },
  SKM: { code: 'SKM', name: 'Szybka Kolej Miejska', logoSrc: '/carriers/skm.svg' },
  ŁKA: { code: 'ŁKA', name: 'Łódzka Kolej Aglomeracyjna', logoSrc: '/carriers/lka.svg' },
  'Leo Express': { code: 'Leo Express', name: 'Leo Express', logoSrc: '/carriers/leo-express.svg' },
}

export function getCarrierInfo(code: string): CarrierInfo | undefined {
  return CARRIERS[code]
}
