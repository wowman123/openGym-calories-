// The food database behind the Calories screen's search: tens of thousands of foods and dishes
// with their calories per 100 g and portion sizes, from national composition tables (built by
// scripts/food-db/build.mjs into public/food-db/foods.json, see SOURCES.md there), plus packaged
// products looked up online (lib/open-food-facts.js), which come back in the same shape.
//
// A food here: { name, src, kcal, p, f, c, portions: [{ label, g }] } — kcal and the macros
// (protein, fat, carbs, g) per 100 g, null where the table has no value. Logging one turns it
// into an ordinary entry (lib/calories.js) with the calories of the amount eaten, so the log
// never depends on this file being there.

/** Where each food comes from, as the result list labels it. */
export const SOURCE_LABEL = { us: 'USA', fr: 'France', uk: 'UK', jp: 'Japan', off: 'Packaged' }

const DB_URL = 'food-db/foods.json'

// Lower case, accents off, punctuation as space: "Crème brûlée, (homemade)" → "creme brulee homemade".
export const normalize = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9\u0080-￿]+/g, ' ').trim()

const finite = v => (v == null || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null)

/** One food read back from a stored row or an online product; null when it has no calories. */
export function readFood(row) {
  const [name, src, kcal, p, f, c, portions] = Array.isArray(row) ? row
    : [row?.name, row?.src, row?.kcal, row?.p, row?.f, row?.c, row?.portions]
  const k = finite(kcal)
  const n = String(name ?? '').replace(/\s+/g, ' ').trim()
  if (!n || k == null || k < 0 || k > 950) return null
  const list = (Array.isArray(portions) ? portions : [])
    .map(x => (Array.isArray(x) ? { label: String(x[0] ?? '').trim(), g: finite(x[1]) } : { label: String(x?.label ?? '').trim(), g: finite(x?.g) }))
    .filter(x => x.label && x.g > 0 && x.g < 5000)
  const food = { name: n, src: String(src || ''), kcal: Math.round(k), p: finite(p), f: finite(f), c: finite(c), portions: list }
  if (row && !Array.isArray(row) && row.code) food.code = String(row.code)
  return food
}

/** The database file read into searchable foods. */
export function prepareDb(data) {
  const foods = []
  for (const row of Array.isArray(data?.foods) ? data.foods : []) {
    const f = readFood(row)
    if (!f) continue
    f.key = normalize(f.name)
    f.words = f.key.split(' ')
    f.head = normalize(f.name.split(',')[0])   // "Rice" of "Rice, white, cooked": the food itself
    foods.push(f)
  }
  return { sources: data?.sources || {}, built: data?.built || null, foods }
}

let dbP = null
/** The database, loaded once and on first use (it is a few MB); rejects if the file is missing. */
export function loadFoodDb(fetchImpl = (...a) => fetch(...a)) {
  return dbP || (dbP = (async () => {
    const res = await fetchImpl(DB_URL)
    if (!res.ok) throw new Error('food database unavailable (' + res.status + ')')
    return prepareDb(await res.json())
  })().catch(e => { dbP = null; throw e }))
}
export const resetFoodDb = () => { dbP = null }

// A query word matches a food word it begins: "chick" finds "chicken". A plural typed for a
// singular stored ("eggs", "tomatoes") still matches.
const stems = t => {
  const out = [t]
  if (t.length > 3 && t.endsWith('es')) out.push(t.slice(0, -2))
  if (t.length > 3 && t.endsWith('s')) out.push(t.slice(0, -1))
  return out
}
const wordHit = (words, forms) => words.findIndex(w => forms.some(t => w.startsWith(t)))

/**
 * The foods matching every word of `query`, best first: a name that starts with what was typed,
 * then one whose first word is it, then shorter (more general) names, then ones with portion
 * sizes to pick from. `limit` caps the list.
 */
export function searchFoods(db, query, limit = 40) {
  const tokens = normalize(query).split(' ').filter(Boolean)
  if (!tokens.length || !db?.foods) return []
  const forms = tokens.map(stems)
  const hits = []
  for (const f of db.foods) {
    let score = 0, ok = true
    for (let i = 0; i < forms.length; i++) {
      const at = wordHit(f.words, forms[i])
      if (at < 0) { ok = false; break }
      score -= at * 4
    }
    if (!ok) continue
    if (forms[0].some(t => f.key.startsWith(t))) score += 100
    // The first word is the word typed, or its plural ("banana" → "Bananas, raw").
    if (forms[0].some(t => f.words[0] === t || f.words[0] === t + 's' || f.words[0] === t + 'es')) score += 40
    // The tables mark the plain food "raw": a search for an ingredient means that first.
    if (f.words.includes('raw')) score += 8
    if (forms.length > 1 && f.key.startsWith(tokens.join(' '))) score += 30
    // The food itself before what is made of it: "Rice, white, cooked" before "Rice crackers".
    const whole = tokens.join(' ')
    if (f.head === whole || f.head === whole + 's' || f.head === whole + 'es') score += 25
    score -= Math.min(f.name.length, 120) * 0.4
    if (f.portions.length) score += 12
    hits.push([score, f])
  }
  hits.sort((a, b) => b[0] - a[0] || (a[1].name < b[1].name ? -1 : 1))
  return hits.slice(0, limit).map(h => h[1])
}

/** The amounts a food can be logged in: its own portions, then 100 g. Grams are typed separately. */
export function portionsOf(food) {
  const out = (food?.portions || []).map(p => ({ label: p.label, g: p.g }))
  if (!out.some(p => p.g === 100 && /^100\s*g$/i.test(p.label))) out.push({ label: '100 g', g: 100 })
  return out
}

/** Calories in `grams` of `food`. */
export const kcalFor = (food, grams) => Math.round((Number(food?.kcal) || 0) * (Number(grams) || 0) / 100)

const qtyText = q => (Math.round(q * 100) / 100).toString()

/**
 * The name a logged amount goes by in the log and among the remembered foods: the food, then
 * how much — "Banana, raw · 1 medium", "Oats · 2 × 1 cup", "Rice · 150 g". Remembered under this
 * name, the same amount of the same food is one tap the next time.
 */
export function entryNameFor(food, portion, qty = 1) {
  const base = food.name
  if (!portion) return base
  if (portion.custom) return `${base} · ${Math.round(portion.g * qty)} g`
  const label = /^100 g$/i.test(portion.label) && qty !== 1 ? `${Math.round(100 * qty)} g` : portion.label
  return qty === 1 || /^\d+ g$/.test(label) ? `${base} · ${label}` : `${base} · ${qtyText(qty)} × ${label}`
}
