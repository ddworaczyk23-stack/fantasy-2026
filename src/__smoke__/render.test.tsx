// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'

// 521 real players means several sequential draft-and-rerender cycles in one
// test genuinely take a few seconds under jsdom + React dev mode. The engine
// itself is fast (~70ms/recommendation, see engine/__tests__) - this is test
// harness overhead, not an app problem.
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import App from '../App'

// The store persists to localStorage, and every test in this file shares one
// jsdom global - without this, state leaks from one test into the next.
beforeEach(() => {
  localStorage.clear()
  document.body.innerHTML = ''
})

async function mount(): Promise<{ host: HTMLElement; root: Root }> {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  await act(async () => {
    root.render(React.createElement(App))
  })
  return { host, root }
}

function tabButton(host: HTMLElement, label: RegExp): HTMLButtonElement {
  const btn = Array.from(host.querySelectorAll('button')).find((b) => label.test(b.textContent ?? ''))
  expect(btn, `tab ${label} not found`).toBeTruthy()
  return btn as HTMLButtonElement
}

async function click(el: HTMLElement) {
  await act(async () => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

describe('app shell', () => {
  it('mounts, names the loaded board, and never renders undefined/NaN', async () => {
    const { host } = await mount()
    const text = host.textContent ?? ''
    expect(text.length).toBeGreaterThan(5000)
    // the header must always say which board is loaded
    expect(text).toMatch(/FANTASYPROS 2026 PPR/)
    expect(text).not.toMatch(/undefined|NaN|\[object Object\]/)
    expect(text).not.toMatch(/Something went wrong/)
  })

  it('loads real FantasyPros players, not the demo board', async () => {
    const { host } = await mount()
    const text = host.textContent ?? ''
    expect(text).toMatch(/Jahmyr Gibbs|Ja'Marr Chase|Bijan Robinson/)
  })

  it('shows a not-on-the-clock state at pick 1 and a real recommendation at my pick', { timeout: 20000 }, async () => {
    const { host } = await mount()

    // pick 1 is not mine (my first pick is 8), so the card must say so clearly
    expect(host.textContent ?? '').toMatch(/Not on the clock/i)
    expect(host.textContent ?? '').toMatch(/picks until your turn/i)

    // advance the board to my pick by drafting 7 players off the top
    for (let i = 0; i < 7; i++) {
      const btn = Array.from(host.querySelectorAll('button')).find((b) =>
        /^Draft$/i.test((b.textContent ?? '').trim()),
      )
      expect(btn, `no draft button available on iteration ${i}`).toBeTruthy()
      await click(btn!)
    }

    const text = host.textContent ?? ''
    expect(text).toMatch(/Round 1 . Pick 8/)
    expect(text).toMatch(/Recommendation: Draft /)
    expect(text).toMatch(/Reason:/)
    expect(text).not.toMatch(/undefined|NaN/)
  })

  it('renders every tab with real content, not an empty state', { timeout: 15000 }, async () => {
    const { host } = await mount()

    const checks: { tab: RegExp; must: RegExp[] }[] = [
      { tab: /^My Team/, must: [/Starters/i, /Bench/i, /Bye/i] },
      { tab: /^Rankings/, must: [/Tier/i, /CSV/i] },
      { tab: /^League Intel/, must: [/My Team/, /Gridiron Goblins/] },
      { tab: /^Settings/, must: [/League/i, /Sleeper/i, /Checklist/i, /Weights?/i] },
    ]

    for (const c of checks) {
      await click(tabButton(host, c.tab))
      const text = host.textContent ?? ''
      for (const m of c.must) {
        expect(text, `tab ${c.tab} missing ${m}`).toMatch(m)
      }
      expect(text).not.toMatch(/undefined|NaN|Something went wrong/)
    }
  })

  it('drafting a player removes them from the board and advances the pick', async () => {
    const { host } = await mount()

    // The zustand store is a module singleton shared across tests in this file,
    // so read the current pick out of the DOM rather than assuming pick 1.
    const readPick = (): number => {
      const m = /Pick (\d+)/.exec(host.textContent ?? '')
      expect(m, 'no pick indicator in the header').toBeTruthy()
      return Number(m![1])
    }
    const before = readPick()

    const first = Array.from(host.querySelectorAll('button')).find((b) =>
      /^Draft$/i.test((b.textContent ?? '').trim()),
    )
    expect(first, 'no draft button on the board').toBeTruthy()
    const rowsBefore = host.querySelectorAll('tbody tr').length
    await click(first!)

    expect(readPick()).toBe(before + 1)
    expect(host.querySelectorAll('tbody tr').length).toBeLessThanOrEqual(rowsBefore)
    expect(host.textContent ?? '').not.toMatch(/undefined|NaN/)
  })

  it('undo restores the previous board state', async () => {
    const { host } = await mount()
    const before = host.textContent ?? ''

    const first = Array.from(host.querySelectorAll('button')).find((b) =>
      /^Draft$/i.test((b.textContent ?? '').trim()),
    )!
    await click(first)
    expect(host.textContent ?? '').not.toBe(before)

    const undo = Array.from(host.querySelectorAll('button')).find((b) =>
      /undo/i.test(b.textContent ?? ''),
    )
    expect(undo, 'no undo button found').toBeTruthy()
    await click(undo!)

    expect(host.textContent ?? '').toBe(before)
  })
})
