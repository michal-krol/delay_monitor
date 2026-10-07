// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { isSearchShortcut } from './searchShortcut'

type Init = { key: string; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean; shiftKey?: boolean; target?: EventTarget | null }

const event = ({ key, ctrlKey = false, metaKey = false, altKey = false, shiftKey = false, target = document.body }: Init) => ({
  key,
  ctrlKey,
  metaKey,
  altKey,
  shiftKey,
  target,
})

describe('isSearchShortcut', () => {
  it('accepts Ctrl+K and Meta+K (any letter case)', () => {
    expect(isSearchShortcut(event({ key: 'k', ctrlKey: true }))).toBe(true)
    expect(isSearchShortcut(event({ key: 'k', metaKey: true }))).toBe(true)
    expect(isSearchShortcut(event({ key: 'K', ctrlKey: true }))).toBe(true)
  })

  it('accepts Ctrl+K even while typing in an input', () => {
    expect(isSearchShortcut(event({ key: 'k', ctrlKey: true, target: document.createElement('input') }))).toBe(true)
  })

  it('rejects Ctrl+Shift+K, Alt+Ctrl+K and a bare k', () => {
    expect(isSearchShortcut(event({ key: 'k', ctrlKey: true, shiftKey: true }))).toBe(false)
    expect(isSearchShortcut(event({ key: 'k', ctrlKey: true, altKey: true }))).toBe(false)
    expect(isSearchShortcut(event({ key: 'k' }))).toBe(false)
  })

  it('accepts "/" on the page body and rejects it with a modifier', () => {
    expect(isSearchShortcut(event({ key: '/' }))).toBe(true)
    expect(isSearchShortcut(event({ key: '/', ctrlKey: true }))).toBe(false)
  })

  it.each(['input', 'textarea', 'select'])('rejects "/" typed in <%s>', (tag) => {
    expect(isSearchShortcut(event({ key: '/', target: document.createElement(tag) }))).toBe(false)
  })

  it('rejects "/" in a contenteditable element (and inside one)', () => {
    const editable = document.createElement('div')
    editable.setAttribute('contenteditable', 'true')
    const child = document.createElement('span')
    editable.append(child)
    expect(isSearchShortcut(event({ key: '/', target: editable }))).toBe(false)
    expect(isSearchShortcut(event({ key: '/', target: child }))).toBe(false)
  })

  it('accepts "/" with a null target', () => {
    expect(isSearchShortcut(event({ key: '/', target: null }))).toBe(true)
  })
})
