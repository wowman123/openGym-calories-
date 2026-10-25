// Packaged foods from Open Food Facts (openfoodfacts.org): a free, open database of millions of
// products from shops across Europe, Asia, the Americas and everywhere else, by name or by the
// barcode on the pack. Data under the Open Database License; the app shows where it came from.
//
// Only ever asked when the person asks — the Search online button, or a scanned barcode — never
// in the background: openGym otherwise talks to no one but its own server. In the app the request
// goes out from native code (lib/capacitor-fetch.js), which can name the app in its User-Agent as
// Open Food Facts asks; the browser sends its own.
//
// What comes back is a food in lib/food-db.js's shape: per 100 g, the pack's serving as a portion.
import { nativeFetch } from './capacitor-fetch.js'
import { MOBILE } from './mobile.js'

const BASE = 'https://world.openfoodfacts.org'
const FIELDS = 'code,product_name,product_name_en,generic_name,brands,quantity,serving_size,serving_quantity,nutriments'
const UA = 'openGym-calories/1.0 (https://github.com/wowman123/openGym-calories-)'

const finite = v => (v == null || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null)
const round1 = v => (v == null ? null : Math.round(v * 10) / 10)

/** One Open Food Facts product as a food, or null when it says nothing about its calories. */
export function readOffProduct(p) {
  if (!p || typeof p !== 'object') return null
  const n = p.nutriments || {}
  let kcal = finite(n['energy-kcal_100g'])
  if (kcal == null && finite(n.energy_100g) != null) kcal = finite(n.energy_100g) / 4.184   // kJ
  if (kcal == null || kcal < 0 || kcal > 950) return null
  const title = String(p.product_name_en || p.product_name || p.generic_name || '').replace(/\s+/g, ' ').trim()
  if (!title) return null
  const brand = String(p.brands || '').split(',')[0].trim()
  const name = brand && !title.toLowerCase().includes(brand.toLowerCase()) ? `${title} (${brand})` : title
  const portions = []
  const sq = finite(p.serving_quantity)
  if (sq > 0 && sq < 5000) portions.push({ label: p.serving_size ? `1 serving (${String(p.serving_size).trim()})` : `1 serving (${sq} g)`, g: sq })
  return {
    name, src: 'off', code: String(p.code || ''), kcal: Math.round(kcal),
    p: round1(finite(n.proteins_100g)), f: round1(finite(n.fat_100g)), c: round1(finite(n.carbohydrates_100g)),
    portions, quantity: p.quantity ? String(p.quantity) : null,
  }
}

async function getJson(url, signal) {
  // A browser sending its own User-Agent header would turn the request into a CORS preflight
  // Open Food Facts does not answer, so only the app names itself.
  const headers = MOBILE ? { Accept: 'application/json', 'User-Agent': UA } : { Accept: 'application/json' }
  const res = await nativeFetch(url, { headers, signal })
  if (!res.ok) { const e = new Error('Open Food Facts answered ' + res.status); e.status = res.status; throw e }
  return res.json()
}

/** The search URL for `query`: products with calories on file, best match first. */
export const offSearchUrl = (query, pageSize = 30) => `${BASE}/cgi/search.pl?` + new URLSearchParams({
  search_terms: String(query || '').trim(), search_simple: '1', action: 'process', json: '1',
  page_size: String(pageSize), fields: FIELDS, sort_by: 'unique_scans_n',
})

/** Packaged foods matching `query`, those without calories left out. */
export async function searchOff(query, { signal } = {}) {
  if (!String(query || '').trim()) return []
  const data = await getJson(offSearchUrl(query), signal)
  const seen = new Set()
  const out = []
  for (const p of Array.isArray(data?.products) ? data.products : []) {
    const f = readOffProduct(p)
    if (!f) continue
    const k = f.name.toLowerCase() + '|' + f.kcal
    if (seen.has(k)) continue
    seen.add(k)
    out.push(f)
  }
  return out
}

/** A barcode as Open Food Facts files it: digits only, 8 to 14 of them; null otherwise. */
export function cleanBarcode(code) {
  const d = String(code ?? '').replace(/\D/g, '')
  return d.length >= 8 && d.length <= 14 ? d : null
}

/** The product with this barcode as a food; null when it is unknown or has no calories on file. */
export async function productByBarcode(code, { signal } = {}) {
  const c = cleanBarcode(code)
  if (!c) return null
  let data
  try { data = await getJson(`${BASE}/api/v2/product/${c}.json?fields=${FIELDS}`, signal) } catch (e) {
    if (e.status === 404) return null
    throw e
  }
  return data?.status === 1 || data?.product ? readOffProduct({ code: c, ...data.product }) : null
}
