// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { trapTab } from './focusTrap'

function setup(): { container: HTMLElement; first: HTMLElement; last: HTMLElement; outside: HTMLElement } {
  document.body.innerHTML = `
    <button id="outside">out</button>
    <div id="box"><a href="#a" id="first">a</a><button id="last">b</button></div>`
  const el = (id: string) => document.getElementById(id) as HTMLElement
  return { container: el('box'), first: el('first'), last: el('last'), outside: el('outside') }
}

function tab(container: HTMLElement, shiftKey = false): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key: 'Tab', shiftKey, cancelable: true })
  trapTab(event, container)
  return event
}

describe('trapTab', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('Tab na ostatnim elemencie wraca na pierwszy', () => {
    const { container, first, last } = setup()
    last.focus()
    expect(tab(container).defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(first)
  })

  it('Shift+Tab na pierwszym elemencie wraca na ostatni', () => {
    const { container, first, last } = setup()
    first.focus()
    expect(tab(container, true).defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(last)
  })

  it('Tab w środku nie ingeruje', () => {
    const { container, first } = setup()
    first.focus()
    expect(tab(container).defaultPrevented).toBe(false)
  })

  it('fokus poza kontenerem jest wciągany do środka', () => {
    const { container, first, outside } = setup()
    outside.focus()
    expect(tab(container).defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(first)
  })

  it('ignoruje inne klawisze', () => {
    const { container, outside } = setup()
    outside.focus()
    const event = new KeyboardEvent('keydown', { key: 'a', cancelable: true })
    trapTab(event, container)
    expect(event.defaultPrevented).toBe(false)
  })
})
