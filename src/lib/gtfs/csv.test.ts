import { describe, expect, it } from 'vitest'
import { field, headerIndex, parseCsvLine, stripBom } from './csv'

describe('parseCsvLine', () => {
  it('splits a plain row', () => {
    expect(parseCsvLine('a,b,c')).toEqual(['a', 'b', 'c'])
  })

  it('keeps commas inside quoted fields', () => {
    expect(parseCsvLine('100101,"Warszawa, Centralna",7014')).toEqual(['100101', 'Warszawa, Centralna', '7014'])
  })

  it('unescapes doubled quotes inside a quoted field', () => {
    expect(parseCsvLine('1,"a ""b"" c",2')).toEqual(['1', 'a "b" c', '2'])
  })

  it('preserves a trailing empty field', () => {
    expect(parseCsvLine('a,b,')).toEqual(['a', 'b', ''])
    expect(parseCsvLine(',')).toEqual(['', ''])
  })

  it('drops a trailing CR left by CRLF line endings', () => {
    expect(parseCsvLine('a,b\r')).toEqual(['a', 'b'])
    expect(parseCsvLine('"a","b"\r')).toEqual(['a', 'b'])
  })
})

describe('stripBom', () => {
  it('removes a leading UTF-8 BOM, leaves other strings alone', () => {
    expect(stripBom('﻿route_id,route_type')).toBe('route_id,route_type')
    expect(stripBom('route_id')).toBe('route_id')
  })
})

describe('headerIndex', () => {
  it('maps column names to positions, tolerating a BOM on the header line', () => {
    const index = headerIndex('﻿trip_id,stop_sequence,stop_id,arrival_time,departure_time')
    expect(index.get('trip_id')).toBe(0)
    expect(index.get('stop_sequence')).toBe(1)
    expect(index.get('departure_time')).toBe(4)
  })

  it('reads fields by name regardless of column order', () => {
    const index = headerIndex('stop_id,trip_id,departure_time')
    const row = parseCsvLine('7014,M1:NdM:KAB,05:00:00')
    expect(field(row, index, 'trip_id')).toBe('M1:NdM:KAB')
    expect(field(row, index, 'departure_time')).toBe('05:00:00')
    expect(field(row, index, 'missing_column')).toBe('')
  })
})
