// Calories: what you ate today against a daily goal, and the foods you eat often, remembered so
// the next time is one tap.
//
// Stored as two stamped maps, the way a day note is (lib/day-notes.js):
//
//   S.foodLog = { <entry id>: { d: '2026-10-25', name: 'Oats', kcal: 150, meal: 'breakfast', t, _ts }, … }
//   S.foods   = { 'oats': { name: 'Oats', kcal: 150, n: 12, last, _ts }, … }
//   S.kcalGoal = 2500
//
// One entry per thing eaten, keyed by its own id, so a phone and a laptop that each logged a
// meal keep both (lib/sync-merge.js mergeStampedMap). A day's total is the sum of its entries,
// never a stored number that two devices would each overwrite. Taking an entry away, or
// forgetting a food, is a stamped empty entry (`{ _ts }`), not a deleted key: a delete would
// come straight back from the other device's copy on the next sync.
//
// `t` is when the entry was logged; `_ts` when it was last written. The remembered food keeps
// the calories it was last logged with and how many times it was logged (`n`), which orders
// the quick-add chips: what you eat most comes first.
import { isoOf, uid } from './format.js'

export const MEALS = ['breakfast', 'lunch', 'dinner', 'snack']
/** English source strings, translated where shown. */
export const MEAL_LABEL = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack' }

export const KCAL_GOAL_DEFAULT = 2500
export const KCAL_GOAL_MIN = 800
export const KCAL_GOAL_MAX = 10000
export const KCAL_MAX = 20000      // one entry; a typo beyond this is no meal
export const FOOD_NAME_MAX = 120   // a database food's name with its portion fits

const isMap = v => !!v && typeof v === 'object' && !Array.isArray(v)
const ISO = /^\d{4}-\d{2}-\d{2}$/

/** The daily goal, a whole number of kcal in range; the default for anything else. */
export function goalOf(S) {
  const g = Math.round(Number(S?.kcalGoal))
  return g >= KCAL_GOAL_MIN && g <= KCAL_GOAL_MAX ? g : KCAL_GOAL_DEFAULT
}

/** A goal typed by hand, or null when it is no goal (out of range, not a number). */
export function parseGoal(text) {
  const g = Math.round(Number(String(text ?? '').replace(/[\s,.'’]/g, '')))
  return Number.isFinite(g) && g >= KCAL_GOAL_MIN && g <= KCAL_GOAL_MAX ? g : null
}

/**
 * Calories typed by hand: `350`, `350 kcal`, `1,200`, a sum `120+80`, or a count of something
 * `2x105` (also `2*105`, `2×105`). Rounded to a whole number; null when it is none of these, zero,
 * or more than one entry could hold.
 */
export function parseKcal(text) {
  let s = String(text ?? '').toLowerCase().replace(/\s+/g, '').replace(/kcal$|cal$/, '')
  if (!s) return null
  s = s.replace(/(\d),(\d{3})(?!\d)/g, '$1$2').replace(/,/g, '.').replace(/×/g, 'x')
  let total = 0
  for (const term of s.split('+')) {
    const m = term.match(/^(\d+(?:\.\d+)?)(?:[x*](\d+(?:\.\d+)?))?$/)
    if (!m) return null
    total += m[2] ? Number(m[1]) * Number(m[2]) : Number(m[1])
  }
  total = Math.round(total)
  return total > 0 && total <= KCAL_MAX ? total : null
}

/** The meal the hour of `date` most likely belongs to, so the form starts on it. */
export function mealAt(date = new Date()) {
  const h = date.getHours()
  return h >= 4 && h < 11 ? 'breakfast' : h >= 11 && h < 15 ? 'lunch' : h >= 17 && h < 22 ? 'dinner' : 'snack'
}

/** A food's name as stored: trimmed, inner runs of space collapsed, capped. */
export const cleanFoodName = name => String(name ?? '').trim().replace(/\s+/g, ' ').slice(0, FOOD_NAME_MAX)
/** The key a remembered food is filed under: its name, case and spacing aside. */
export const foodKey = name => cleanFoodName(name).toLowerCase()

/** A stored entry read back, with junk left out; null for a removed (or broken) one. */
export function readFoodEntry(id, v) {
  if (!isMap(v) || !ISO.test(String(v.d || ''))) return null
  const kcal = Math.round(Number(v.kcal))
  const name = cleanFoodName(v.name)
  if (!(kcal > 0 && kcal <= KCAL_MAX) || !name) return null
  return { id, d: v.d, name, kcal, meal: MEALS.includes(v.meal) ? v.meal : 'snack', t: Number(v.t) || 0 }
}

/** Every entry of the log that still stands, in the order they were logged. */
export function foodEntries(S) {
  const log = isMap(S?.foodLog) ? S.foodLog : {}
  const out = []
  for (const [id, v] of Object.entries(log)) { const e = readFoodEntry(id, v); if (e) out.push(e) }
  return out.sort((a, b) => a.t - b.t || (a.id < b.id ? -1 : 1))
}

/** The entries of one day, in the order they were logged. */
export const entriesOn = (S, iso) => foodEntries(S).filter(e => e.d === iso)

/** { [day]: kcal } over the whole log. */
export function dayTotals(S) {
  const out = {}
  for (const e of foodEntries(S)) out[e.d] = (out[e.d] || 0) + e.kcal
  return out
}

/** What was eaten on `iso`, in kcal. */
export const totalOn = (S, iso) => entriesOn(S, iso).reduce((n, e) => n + e.kcal, 0)

const shiftISO = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return isoOf(d) }
export { shiftISO }

/**
 * Days logged in a row, ending today. A day not logged yet does not break the run before it
 * (the morning before breakfast still counts yesterday's streak); a whole day missed does.
 */
export function logStreak(S, today) {
  const totals = dayTotals(S)
  let d = totals[today] ? today : shiftISO(today, -1)
  let n = 0
  while (totals[d]) { n++; d = shiftISO(d, -1) }
  return n
}

/** The `n` days up to and including `today`, oldest first: [{ d, kcal }]. */
export function lastDays(S, today, n = 7) {
  const totals = dayTotals(S)
  return Array.from({ length: n }, (_, i) => { const d = shiftISO(today, i - n + 1); return { d, kcal: totals[d] || 0 } })
}

/** The average of the days among `days` that have anything logged; null when none has. */
export function loggedAverage(days) {
  const logged = days.filter(x => x.kcal > 0)
  return logged.length ? Math.round(logged.reduce((n, x) => n + x.kcal, 0) / logged.length) : null
}

/** A remembered food read back; null for a forgotten (or broken) one. */
export function readFood(key, v) {
  if (!isMap(v)) return null
  const name = cleanFoodName(v.name)
  const kcal = Math.round(Number(v.kcal))
  if (!name || !(kcal > 0 && kcal <= KCAL_MAX)) return null
  return { key, name, kcal, n: Math.max(1, Math.round(Number(v.n) || 1)), last: Number(v.last) || 0 }
}

/**
 * The remembered foods, the most logged first and the latest of equals before the rest. With
 * `query`, only those whose name holds it.
 */
export function rememberedFoods(S, { query = '', limit = Infinity } = {}) {
  const map = isMap(S?.foods) ? S.foods : {}
  const q = foodKey(query)
  const out = []
  for (const [k, v] of Object.entries(map)) { const f = readFood(k, v); if (f && (!q || f.key.includes(q))) out.push(f) }
  out.sort((a, b) => b.n - a.n || b.last - a.last || (a.key < b.key ? -1 : 1))
  return out.slice(0, limit)
}

/** The remembered food filed under exactly this name, or null. */
export const foodNamed = (S, name) => readFood(foodKey(name), isMap(S?.foods) ? S.foods[foodKey(name)] : null)

/** S.foodLog with a new entry `{ d, name, kcal, meal }` under `id`, stamped `now`. */
export function withFoodEntry(log, { d, name, kcal, meal, t }, now = Date.now(), id = uid()) {
  const entry = { d, name: cleanFoodName(name), kcal: Math.round(kcal), meal: MEALS.includes(meal) ? meal : 'snack', t: t || now, _ts: now }
  return { ...(isMap(log) ? log : {}), [id]: entry }
}

/** S.foodLog with entry `id` taken away: a stamped clear, so the removal syncs. */
export const withoutFoodEntry = (log, id, now = Date.now()) => ({ ...(isMap(log) ? log : {}), [id]: { _ts: now } })

/** S.foods with `name` remembered at `kcal`: logged once more, at `now`. */
export function withRemembered(foods, name, kcal, now = Date.now()) {
  const map = isMap(foods) ? foods : {}
  const k = foodKey(name)
  const prev = readFood(k, map[k])
  return { ...map, [k]: { name: cleanFoodName(name), kcal: Math.round(kcal), n: (prev ? prev.n : 0) + 1, last: now, _ts: now } }
}

/** S.foods with `key` set back to `food` (as readFood gave it), or forgotten when `food` is null. */
export function withFoodRecord(foods, key, food, now = Date.now()) {
  const map = isMap(foods) ? foods : {}
  const rec = food ? { name: food.name, kcal: food.kcal, n: food.n, last: food.last, _ts: now } : { _ts: now }
  return { ...map, [key]: rec }
}

/**
 * Logs `food` ({ name, kcal, meal }) on `d` into the state `s` (the copy an update hands out),
 * remembering the food unless it has no name. Returns what an Undo needs: the entry's id and the
 * remembered food as it stood before.
 */
export function logFood(s, { d, name, kcal, meal }, now = Date.now(), id = uid()) {
  const clean = cleanFoodName(name)
  const key = clean ? foodKey(clean) : null
  const before = key ? readFood(key, isMap(s.foods) ? s.foods[key] : null) : null
  s.foodLog = withFoodEntry(s.foodLog, { d, name: clean || QUICK_ADD, kcal, meal }, now, id)
  if (key) s.foods = withRemembered(s.foods, clean, kcal, now)
  return { id, key, before }
}

/** Undoes logFood: the entry goes, the remembered food is as it was. */
export function unlogFood(s, { id, key, before }, now = Date.now()) {
  s.foodLog = withoutFoodEntry(s.foodLog, id, now)
  if (key) s.foods = withFoodRecord(s.foods, key, before, now)
}

/** The name an entry logged with calories only goes by. English source string. */
export const QUICK_ADD = 'Quick add'

/**
 * Starter foods with typical values, offered until anything of your own is remembered. English
 * source strings; the values are rough on purpose, a starting point to correct.
 */
export const STARTER_FOODS = [
  { name: 'Egg', kcal: 72 }, { name: 'Banana', kcal: 105 }, { name: 'Oats, 40 g', kcal: 150 },
  { name: 'Chicken breast, 100 g', kcal: 165 }, { name: 'Rice, 1 cup cooked', kcal: 205 },
  { name: 'Greek yogurt, 170 g', kcal: 100 }, { name: 'Protein shake', kcal: 120 }, { name: 'Apple', kcal: 95 },
]
