// @vitest-environment happy-dom
//
// The Calories screen: what the add form, the remembered chips and the log's remove button send
// to the store, and that each offers an Undo that puts things back. The data rules themselves
// are covered by lib/calories.test.js.
//
// As in CheckIn.test.jsx: IS_REACT_ACT_ENVIRONMENT is required, and a value typed into a field
// has to go through the native setter to reach React.
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { entriesOn, rememberedFoods, withFoodEntry, withRemembered } from '../lib/calories.js'
import { todayISO } from '../lib/format.js'
import { resetFoodDb } from '../lib/food-db.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const mocks = vi.hoisted(() => ({ S: null, toast: vi.fn(), nav: vi.fn(), sheets: [] }))

const update = vi.fn(mut => {
  const next = structuredClone(mocks.S)
  mut(next)
  mocks.S = next
})

vi.mock('../store/useStore.js', () => {
  const snap = () => ({ S: mocks.S, update })
  const useStore = selector => selector ? selector(snap()) : snap()
  useStore.getState = snap
  return { useStore }
})
vi.mock('../store/useUI.js', () => {
  const snap = () => ({
    toast: (...a) => mocks.toast(...a),
    openSheet: render => { mocks.sheets.push(render); return { id: 's', close: () => {} } },
  })
  const useUI = selector => selector ? selector(snap()) : snap()
  useUI.getState = snap
  return { useUI }
})
vi.mock('react-router-dom', () => ({ useNavigate: () => mocks.nav }))

import Calories from './Calories.jsx'

// The food database the search loads (public/food-db/foods.json), as a fetch would hand it over.
const FOOD_DB = { v: 1, sources: {}, foods: [
  ['Bananas, raw', 'us', 89, 1.1, 0.3, 22.8, [['1 medium', 118]]],
  ['Banana bread', 'us', 326, 4.3, 10.5, 54.6, [['1 slice', 60]]],
] }

let host, root, sheetHost, sheetRoot
beforeEach(() => {
  resetFoodDb()
  vi.stubGlobal('fetch', vi.fn(async url => (String(url).includes('food-db/foods.json')
    ? { ok: true, json: async () => FOOD_DB } : { ok: false, status: 500 })))
  sheetHost = document.createElement('div'); document.body.appendChild(sheetHost); sheetRoot = createRoot(sheetHost)
  mocks.S = { foodLog: {}, foods: {}, kcalGoal: 2000 }
  mocks.toast.mockClear(); mocks.nav.mockClear(); mocks.sheets.length = 0
  update.mockClear()
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host)
})
afterEach(() => {
  act(() => sheetRoot.unmount()); sheetHost.remove()
  act(() => root.unmount()); host.remove()
  vi.unstubAllGlobals()
})
const settle = () => act(async () => { await new Promise(r => setTimeout(r, 0)) })

const render = () => act(() => { root.render(<Calories />) })
const typeInto = (el, value) => act(() => {
  Object.getOwnPropertyDescriptor(el.constructor.prototype, 'value').set.call(el, value)
  el.dispatchEvent(new Event('input', { bubbles: true }))
})
const button = text => [...host.querySelectorAll('button')].find(b => b.textContent.trim() === text)
const tap = el => act(() => { el.click() })
const lastUndo = () => mocks.toast.mock.calls.at(-1)[1].onAction
const today = todayISO()

describe('Calories screen', () => {
  it('adds a typed food to the log and remembers it', () => {
    render()
    typeInto(host.querySelector('#kcal-food'), 'Shakshuka')
    typeInto(host.querySelector('#kcal-amount'), '350+120')
    tap(button('Add'))
    expect(entriesOn(mocks.S, today)).toMatchObject([{ name: 'Shakshuka', kcal: 470 }])
    expect(rememberedFoods(mocks.S)).toMatchObject([{ name: 'Shakshuka', kcal: 470, n: 1 }])
    expect(host.querySelector('#kcal-food').value).toBe('')
    expect(mocks.toast.mock.calls.at(-1)[0]).toContain('Shakshuka')
  })

  it('refuses calories it cannot read, and writes nothing', () => {
    render()
    typeInto(host.querySelector('#kcal-food'), 'Toast')
    typeInto(host.querySelector('#kcal-amount'), 'lots')
    tap(button('Add'))
    expect(update).not.toHaveBeenCalled()
    expect(mocks.toast).toHaveBeenCalledTimes(1)
  })

  it('fills in the calories of a remembered food as its name is typed', () => {
    mocks.S.foods = withRemembered({}, 'Oats', 150, 1)
    render()
    typeInto(host.querySelector('#kcal-food'), 'oats')
    expect(host.querySelector('#kcal-amount').value).toBe('150')
    typeInto(host.querySelector('#kcal-food'), 'oatsx')
    expect(host.querySelector('#kcal-amount').value).toBe('')
  })

  it('logs a remembered food in one tap, and Undo takes it back', () => {
    mocks.S.foods = withRemembered({}, 'Banana', 105, 1)
    render()
    tap(host.querySelector('.kcal-chip'))
    expect(entriesOn(mocks.S, today)).toMatchObject([{ name: 'Banana', kcal: 105 }])
    expect(rememberedFoods(mocks.S)[0].n).toBe(2)
    act(() => lastUndo()())
    expect(entriesOn(mocks.S, today)).toEqual([])
    expect(rememberedFoods(mocks.S)[0].n).toBe(1)
  })

  it('offers starter foods until something is remembered', () => {
    render()
    expect(host.querySelectorAll('.kcal-chip.suggest').length).toBeGreaterThan(0)
    tap(host.querySelector('.kcal-chip.suggest'))
    render()
    expect(host.querySelectorAll('.kcal-chip.suggest').length).toBe(0)
  })

  it('removes a logged entry, and Undo brings it back', () => {
    mocks.S.foodLog = withFoodEntry({}, { d: today, name: 'Pizza', kcal: 800, meal: 'dinner' }, Date.now(), 'p1')
    render()
    expect(host.querySelector('.kcal-num').textContent).toBe('800')
    tap(host.querySelector('[aria-label="Remove Pizza"]'))
    expect(entriesOn(mocks.S, today)).toEqual([])
    act(() => lastUndo()())
    expect(entriesOn(mocks.S, today)).toMatchObject([{ id: 'p1', name: 'Pizza', kcal: 800 }])
  })

  it('forgets a remembered food from the edit mode', () => {
    mocks.S.foods = withRemembered(withRemembered({}, 'Oats', 150, 1), 'Rice', 205, 2)
    render()
    tap(button('Edit'))
    tap(host.querySelector('[aria-label="Forget Rice"]'))
    expect(rememberedFoods(mocks.S).map(f => f.name)).toEqual(['Oats'])
  })

  it('logs into the day shown, and never steps past today', () => {
    render()
    const next = host.querySelector('[aria-label="Next day"]')
    expect(next.disabled).toBe(true)
    tap(host.querySelector('[aria-label="Previous day"]'))
    typeInto(host.querySelector('#kcal-food'), 'Soup')
    typeInto(host.querySelector('#kcal-amount'), '200')
    tap(button('Add'))
    const [entry] = Object.values(mocks.S.foodLog)
    expect(entry.d < today).toBe(true)
    expect(entriesOn(mocks.S, today)).toEqual([])
  })

  it('finds foods in the database as a name is typed, and logs the amount picked', async () => {
    render()
    typeInto(host.querySelector('#kcal-food'), 'banana')
    await settle(); await settle()
    const rows = [...host.querySelectorAll('.food-row')]
    expect(rows.map(r => r.querySelector('.lrow-t').textContent)).toEqual(['Bananas, raw', 'Banana bread'])
    expect(rows[0].querySelector('.lrow-s').textContent).toContain('1 medium: 105 kcal')
    tap(rows[0])
    act(() => { sheetRoot.render(mocks.sheets.at(-1)(() => {})) })
    const sheetButton = text => [...sheetHost.querySelectorAll('button')].find(b => b.textContent.trim() === text)
    expect(sheetButton('Add 105 kcal')).toBeTruthy()
    tap(sheetButton('Add 105 kcal'))
    expect(entriesOn(mocks.S, today)).toMatchObject([{ name: 'Bananas, raw · 1 medium', kcal: 105 }])
    expect(rememberedFoods(mocks.S)[0]).toMatchObject({ name: 'Bananas, raw · 1 medium', kcal: 105 })
  })

  it('offers the online search only on request', async () => {
    render()
    typeInto(host.querySelector('#kcal-food'), 'bamba')
    await settle()
    expect(fetch.mock.calls.some(([u]) => String(u).includes('openfoodfacts'))).toBe(false)
    expect(button('Search “bamba” online')).toBeTruthy()
  })
})
