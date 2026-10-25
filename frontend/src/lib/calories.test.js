// Calories: the parser, the day totals and streak, the remembered foods, and how two devices
// merge their logs (the maps are stamped like day notes, lib/sync-merge.js STAMPED_MAPS, on the
// app's side and in the server's copy of the rules alike).
import { describe, expect, it } from 'vitest'
import * as Server from '../../../api/sync-stamps.js'
import {
  goalOf, parseGoal, parseKcal, mealAt, foodKey, cleanFoodName, readFoodEntry, foodEntries, entriesOn,
  totalOn, dayTotals, logStreak, lastDays, loggedAverage, rememberedFoods, foodNamed,
  withFoodEntry, withoutFoodEntry, withRemembered, withFoodRecord, logFood, unlogFood, shiftISO,
  QUICK_ADD, STARTER_FOODS, KCAL_GOAL_DEFAULT, FOOD_NAME_MAX,
} from './calories.js'
import { localExtras, mergeStates, STAMPED_MAPS } from './sync-merge.js'

const base = (over = {}) => ({
  unit: 'kg', week: {}, dayPlan: {}, workouts: [], routines: [], bodyweight: [], customEx: [], favEx: [],
  exWeights: {}, exNotes: {}, barWeights: {}, equipProfiles: [], gymCards: [], _ts: 0, ...over,
})

describe('calories: reading what was typed', () => {
  it('reads plain numbers, units, thousands, sums and counts', () => {
    expect(parseKcal('350')).toBe(350)
    expect(parseKcal(' 350 kcal ')).toBe(350)
    expect(parseKcal('1,200')).toBe(1200)
    expect(parseKcal('120+80')).toBe(200)
    expect(parseKcal('2x105')).toBe(210)
    expect(parseKcal('2 × 105 + 50')).toBe(260)
    expect(parseKcal('1.5*100')).toBe(150)
    expect(parseKcal('72,5')).toBe(73)
  })

  it('refuses what is no amount of calories', () => {
    for (const junk of ['', '  ', 'abc', '0', '-50', '12-3', '1e5', '20001', '10000+10001', null, undefined]) expect(parseKcal(junk)).toBeNull()
  })

  it('keeps the goal in range, and the default when there is none', () => {
    expect(goalOf({})).toBe(KCAL_GOAL_DEFAULT)
    expect(goalOf({ kcalGoal: 2200 })).toBe(2200)
    expect(goalOf({ kcalGoal: 50 })).toBe(KCAL_GOAL_DEFAULT)
    expect(goalOf({ kcalGoal: 'x' })).toBe(KCAL_GOAL_DEFAULT)
    expect(parseGoal('2,800')).toBe(2800)
    expect(parseGoal('700')).toBeNull()
    expect(parseGoal('20000')).toBeNull()
    expect(parseGoal('')).toBeNull()
  })

  it('starts the form on the meal of the hour', () => {
    const at = h => mealAt(new Date(2026, 9, 25, h, 30))
    expect(at(7)).toBe('breakfast')
    expect(at(12)).toBe('lunch')
    expect(at(16)).toBe('snack')
    expect(at(19)).toBe('dinner')
    expect(at(23)).toBe('snack')
    expect(at(2)).toBe('snack')
  })

  it('files a food under its name, case and spacing aside', () => {
    expect(foodKey('  Greek   Yogurt ')).toBe('greek yogurt')
    expect(cleanFoodName('x'.repeat(200))).toHaveLength(FOOD_NAME_MAX)
  })
})

describe('calories: the log', () => {
  const log = {
    a: { d: '2026-10-25', name: 'Oats', kcal: 150, meal: 'breakfast', t: 10, _ts: 10 },
    b: { d: '2026-10-25', name: 'Rice', kcal: 205, meal: 'lunch', t: 20, _ts: 20 },
    c: { d: '2026-10-24', name: 'Pizza', kcal: 800, meal: 'dinner', t: 5, _ts: 5 },
    gone: { _ts: 30 },
    broken: { d: 'yesterday', name: 'x', kcal: 10 },
    zero: { d: '2026-10-25', name: 'Water', kcal: 0 },
  }
  const S = { foodLog: log }

  it('reads back the entries that stand, in the order they were logged', () => {
    expect(foodEntries(S).map(e => e.id)).toEqual(['c', 'a', 'b'])
    expect(entriesOn(S, '2026-10-25').map(e => e.name)).toEqual(['Oats', 'Rice'])
    expect(readFoodEntry('q', { d: '2026-10-25', name: 'Tea', kcal: 2, meal: 'brunch' }).meal).toBe('snack')
    expect(readFoodEntry('q', { _ts: 1 })).toBeNull()
  })

  it('adds up a day, and every day', () => {
    expect(totalOn(S, '2026-10-25')).toBe(355)
    expect(totalOn(S, '2026-10-23')).toBe(0)
    expect(dayTotals(S)).toEqual({ '2026-10-25': 355, '2026-10-24': 800 })
    expect(totalOn({}, '2026-10-25')).toBe(0)
  })

  it('counts days logged in a row, not yet broken by a day still to be logged', () => {
    expect(logStreak(S, '2026-10-25')).toBe(2)
    expect(logStreak(S, '2026-10-26')).toBe(2)
    expect(logStreak(S, '2026-10-27')).toBe(0)
    expect(logStreak({}, '2026-10-25')).toBe(0)
  })

  it('lays out the last days oldest first, and averages only the logged ones', () => {
    const week = lastDays(S, '2026-10-25', 7)
    expect(week).toHaveLength(7)
    expect(week[0].d).toBe('2026-10-19')
    expect(week.at(-1)).toEqual({ d: '2026-10-25', kcal: 355 })
    expect(loggedAverage(week)).toBe(578)
    expect(loggedAverage(lastDays({}, '2026-10-25'))).toBeNull()
  })

  it('steps across a month and a daylight-saving change', () => {
    expect(shiftISO('2026-10-31', 1)).toBe('2026-11-01')
    expect(shiftISO('2026-03-29', -1)).toBe('2026-03-28')
    expect(shiftISO('2026-01-01', -1)).toBe('2025-12-31')
  })

  it('writes an entry stamped, and a removal as a stamped clear', () => {
    const m = withFoodEntry({}, { d: '2026-10-25', name: '  Toast ', kcal: 120.4, meal: 'nope' }, 50, 'x')
    expect(m.x).toEqual({ d: '2026-10-25', name: 'Toast', kcal: 120, meal: 'snack', t: 50, _ts: 50 })
    const gone = withoutFoodEntry(m, 'x', 60)
    expect(gone.x).toEqual({ _ts: 60 })
    expect(foodEntries({ foodLog: gone })).toEqual([])
  })
})

describe('calories: remembered foods', () => {
  it('remembers the last calories and counts every time, most logged first', () => {
    let f = withRemembered({}, 'Banana', 105, 1)
    f = withRemembered(f, 'banana ', 110, 2)
    f = withRemembered(f, 'Oats', 150, 3)
    const list = rememberedFoods({ foods: f })
    expect(list.map(x => [x.name, x.kcal, x.n])).toEqual([['banana', 110, 2], ['Oats', 150, 1]])
    expect(foodNamed({ foods: f }, 'BANANA').kcal).toBe(110)
    expect(foodNamed({ foods: f }, 'Apple')).toBeNull()
  })

  it('finds a food by part of its name, and forgets one with a stamped clear', () => {
    let f = withRemembered(withRemembered({}, 'Greek yogurt', 100, 1), 'Yogurt drink', 140, 2)
    expect(rememberedFoods({ foods: f }, { query: 'YOG' }).map(x => x.name)).toEqual(['Yogurt drink', 'Greek yogurt'])
    f = withFoodRecord(f, 'greek yogurt', null, 9)
    expect(f['greek yogurt']).toEqual({ _ts: 9 })
    expect(rememberedFoods({ foods: f }).map(x => x.name)).toEqual(['Yogurt drink'])
  })

  it('logs and remembers in one step, and an undo leaves both as they were', () => {
    const s = { foodLog: {}, foods: withRemembered({}, 'Oats', 150, 1) }
    const undo = logFood(s, { d: '2026-10-25', name: 'oats', kcal: 160, meal: 'breakfast' }, 5, 'e1')
    expect(s.foodLog.e1.kcal).toBe(160)
    expect(foodNamed(s, 'Oats')).toMatchObject({ kcal: 160, n: 2 })
    unlogFood(s, undo, 6)
    expect(entriesOn(s, '2026-10-25')).toEqual([])
    expect(foodNamed(s, 'Oats')).toMatchObject({ kcal: 150, n: 1 })
  })

  it('an undo of a first-time food forgets it again', () => {
    const s = {}
    const undo = logFood(s, { d: '2026-10-25', name: 'Kebab', kcal: 600, meal: 'dinner' }, 5, 'e1')
    unlogFood(s, undo, 6)
    expect(rememberedFoods(s)).toEqual([])
  })

  it('calories with no name are logged, and not remembered', () => {
    const s = {}
    logFood(s, { d: '2026-10-25', name: '  ', kcal: 300, meal: 'lunch' }, 5, 'e1')
    expect(entriesOn(s, '2026-10-25')[0].name).toBe(QUICK_ADD)
    expect(rememberedFoods(s)).toEqual([])
  })

  it('the starter foods are all loggable', () => {
    for (const f of STARTER_FOODS) { expect(cleanFoodName(f.name)).toBe(f.name); expect(parseKcal(String(f.kcal))).toBe(f.kcal) }
  })
})

describe('calories across devices', () => {
  it('meals logged on two devices are both kept, and a removal on one sticks', () => {
    const phone = base({ _ts: 100, foodLog: withFoodEntry({}, { d: '2026-10-25', name: 'Oats', kcal: 150, meal: 'breakfast' }, 90, 'p1') })
    const desk = base({ _ts: 200, foodLog: {
      ...withFoodEntry({}, { d: '2026-10-25', name: 'Rice', kcal: 205, meal: 'lunch' }, 150, 'd1'),
      ...withoutFoodEntry({}, 'p1', 180),
    } })
    const merged = mergeStates(phone, desk)
    expect(entriesOn(merged, '2026-10-25').map(e => e.name)).toEqual(['Rice'])
    const before = mergeStates(base({ _ts: 100, foodLog: phone.foodLog }), base({ _ts: 50, foodLog: withFoodEntry({}, { d: '2026-10-25', name: 'Rice', kcal: 205, meal: 'lunch' }, 40, 'd1') }))
    expect(totalOn(before, '2026-10-25')).toBe(355)
  })

  it('the remembered food keeps the version logged last, whichever copy is newer', () => {
    const a = base({ _ts: 300, foods: withRemembered({}, 'Oats', 150, 10) })
    const b = base({ _ts: 100, foods: withRemembered(withRemembered({}, 'Oats', 150, 10), 'Oats', 170, 20) })
    expect(foodNamed(mergeStates(a, b), 'oats')).toMatchObject({ kcal: 170, n: 2 })
  })

  it('a meal logged while signed out counts as something to keep at sign-in', () => {
    const local = base({ foodLog: withFoodEntry({}, { d: '2026-10-25', name: 'Oats', kcal: 150, meal: 'breakfast' }, 9, 'x') })
    expect(localExtras(local, base()).setup).toBe(1)
    expect(localExtras(local, base({ foodLog: local.foodLog })).setup).toBeUndefined()
    expect(localExtras(base({ foodLog: { x: { _ts: 9 } } }), base()).setup).toBeUndefined()
  })

  it('the app and the server treat both maps as stamped maps', () => {
    expect(STAMPED_MAPS).toContain('foodLog')
    expect(STAMPED_MAPS).toContain('foods')
    expect(Server.STAMPED_MAPS).toEqual(STAMPED_MAPS)
  })
})
