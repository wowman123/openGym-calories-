import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { useUI } from '../store/useUI.js'
import { t } from '../lib/i18n.js'
import { MEALS, MEAL_LABEL } from '../lib/calories.js'
import { SOURCE_LABEL, loadFoodDb, searchFoods, portionsOf, kcalFor, entryNameFor } from '../lib/food-db.js'
import { searchOff, productByBarcode, cleanBarcode } from '../lib/open-food-facts.js'
import { MOBILE } from '../lib/mobile.js'
import { addFood, fmtKcal } from '../views/Calories.jsx'
import Icon from './Icon.jsx'
import { Button, NumberField, Segmented, Stepper } from './ui.jsx'

// The food database on the Calories screen: as a food is typed, the matching foods and dishes
// from the national tables (lib/food-db.js, offline), and on request the packaged products of
// Open Food Facts (lib/open-food-facts.js, online) or the one with a scanned barcode. Picking one
// opens the portion sheet, which logs the amount eaten as an ordinary entry.

const toast = msg => useUI.getState().toast(msg)
const fmt1 = v => (v == null ? '–' : (Math.round(v * 10) / 10).toLocaleString())

/** "USA · 89 kcal / 100 g · 1 medium: 105 kcal" — what a result row says under the name. */
function resultLine(food) {
  const first = food.portions[0]
  return [t(SOURCE_LABEL[food.src] || food.src), t('{0} kcal / 100 g', fmtKcal(food.kcal)),
    first ? `${first.label}: ${fmtKcal(kcalFor(food, first.g))} kcal` : null].filter(Boolean).join(' · ')
}

function ResultRow({ food, onPick }) {
  return <button type="button" className="lrow tap food-row" onClick={() => onPick(food)}>
    <span className="lrow-m"><span className="lrow-t">{food.name}</span><span className="lrow-s">{resultLine(food)}</span></span>
    <Icon name="chevronRight" className="lrow-c" />
  </button>
}

/** The amount sheet: pick a portion (or grams) and how many, see the calories, log it. */
function FoodPortionSheet({ food, meal: meal0, day, onAdded, close }) {
  const portions = useMemo(() => portionsOf(food), [food])
  const [pick, setPick] = useState(0)            // an index into portions, or -1 for grams
  const [qty, setQty] = useState(1)
  const [grams, setGrams] = useState(portions[0]?.g || 100)
  const [meal, setMeal] = useState(meal0)
  const portion = pick >= 0 ? portions[pick] : { label: 'g', g: 1, custom: true }
  const amountG = pick >= 0 ? portion.g * qty : grams
  const kcal = kcalFor(food, amountG)
  const per = v => (v == null ? null : (v * amountG) / 100)
  const add = () => {
    if (!(amountG > 0) || !(kcal > 0)) { toast(t('Choose how much you had first.')); return }
    addFood({ name: entryNameFor(food, portion, pick >= 0 ? qty : grams), kcal, meal }, day)
    close()
    onAdded?.()
  }
  return <>
    <h3 className="food-sheet-t">{food.name}</h3>
    <div className="muted small">{t(SOURCE_LABEL[food.src] || food.src)} · {t('{0} kcal / 100 g', fmtKcal(food.kcal))}
      {food.quantity ? ' · ' + t('Pack: {0}', food.quantity) : ''}</div>
    <div className="chips food-portions" role="group" aria-label={t('Amount')}>
      {portions.map((p, i) => <button type="button" key={p.label + i} className={'chip' + (pick === i ? ' on' : '')} aria-pressed={pick === i}
        onClick={() => { setPick(i); setGrams(Math.round(p.g)) }}>{p.label}</button>)}
      <button type="button" className={'chip' + (pick === -1 ? ' on' : '')} aria-pressed={pick === -1} onClick={() => setPick(-1)}>{t('Grams')}</button>
    </div>
    {pick >= 0
      ? <Stepper value={qty} step={0.5} min={0.5} max={50} onChange={setQty} label={t('How many')} ariaLabel={t('How many')} />
      : <label className="food-grams"><span>{t('How many grams')}</span>
        <span className="measure-input"><NumberField value={grams} decimal={false} onChange={v => setGrams(v || 0)} aria-label={t('How many grams')} /><i>g</i></span></label>}
    <div className="food-total">
      <div><span className="food-kcal">{fmtKcal(kcal)}</span> kcal</div>
      <div className="small muted">{Math.round(amountG)} g · {t('Protein')} {fmt1(per(food.p))} g · {t('Carbs')} {fmt1(per(food.c))} g · {t('Fat')} {fmt1(per(food.f))} g</div>
    </div>
    <Segmented className="kcal-meals" value={meal} onChange={setMeal} options={MEALS.map(m => ({ value: m, label: t(MEAL_LABEL[m]) }))} />
    <div style={{ height: 14 }} />
    <Button variant="primary" icon="plus" onClick={add}>{t('Add {0} kcal', fmtKcal(kcal))}</Button>
    {food.src === 'off' && <div className="small dim food-credit">{t('Product data from Open Food Facts, under the Open Database License.')}</div>}
  </>
}

/** Opens the amount sheet for `food`. */
export const foodPortionSheet = (food, opts) => useUI.getState().openSheet(close => <FoodPortionSheet food={food} {...opts} close={close} />)

/** Looks a barcode up and opens its food, or says why it can't. */
export async function lookUpBarcode(code, opts) {
  try {
    const food = await productByBarcode(code)
    if (!food) { toast(t('No calories on file for barcode {0}. Type it in instead.', code)); return }
    foodPortionSheet(food, opts)
  } catch {
    toast(t('Could not reach Open Food Facts. Check the connection and try again.'))
  }
}

/** The app's scanner (ML Kit reads the product barcodes on packs), then the lookup. */
export async function scanFoodBarcode(opts) {
  try {
    const { scanCode } = await import('../lib/scan.js')
    const code = await scanCode()
    if (!code) return
    const c = cleanBarcode(code.value)
    if (!c) { toast(t('That is not a product barcode.')); return }
    await lookUpBarcode(c, opts)
  } catch (e) {
    const m = String(e && e.message)
    toast(m === 'permission-denied' ? t('Camera permission is needed to scan. Enable it in Settings.')
      : m === 'unsupported' ? t('Scanning is not available on this device.') : t('Could not start the scanner'))
  }
}

/**
 * What the food database has for `query`, under the add form: the offline matches, then a
 * button for packaged foods online, or for the barcode when digits were typed.
 */
export default function FoodSearch({ query, meal, day, onAdded }) {
  const [db, setDb] = useState(null)
  const [dbError, setDbError] = useState(false)
  const [online, setOnline] = useState({ q: '', state: 'idle', results: [] })
  const abort = useRef(null)
  const q = useDeferredValue(query.trim())
  const barcode = cleanBarcode(q) && /^[\d\s-]+$/.test(q) ? cleanBarcode(q) : null

  useEffect(() => {
    let live = true
    loadFoodDb().then(d => { if (live) setDb(d) }).catch(() => { if (live) setDbError(true) })
    return () => { live = false }
  }, [])
  useEffect(() => () => abort.current?.abort(), [])

  const results = useMemo(() => (db && q.length >= 2 && !barcode ? searchFoods(db, q, 25) : []), [db, q, barcode])
  const opts = { meal, day, onAdded }
  const pick = food => foodPortionSheet(food, opts)

  const goOnline = async () => {
    abort.current?.abort()
    const ctl = new AbortController(); abort.current = ctl
    setOnline({ q, state: 'loading', results: [] })
    try {
      const found = await searchOff(q, { signal: ctl.signal })
      setOnline({ q, state: 'done', results: found })
    } catch (e) {
      if (e?.name === 'AbortError') return
      setOnline({ q, state: 'error', results: [] })
    }
  }

  if (q.length < 2) return null
  const onlineHere = online.q === q

  return <div className="food-search">
    {barcode ? <Button variant="tinted" icon="magnifier" onClick={() => lookUpBarcode(barcode, opts)}>{t('Look up barcode {0}', barcode)}</Button> : <>
      <h4 className="sec">{t('Food database')}</h4>
      {dbError ? <div className="small muted food-note">{t('The food database could not be loaded.')}</div>
        : !db ? <div className="small muted food-note">{t('Loading the food database…')}</div>
        : results.length ? <div className="sect-b food-list">{results.map((f, i) => <ResultRow key={f.src + f.name + i} food={f} onPick={pick} />)}</div>
        : <div className="small muted food-note">{t('Nothing by that name in the food database. Try fewer words, or search online.')}</div>}

      <h4 className="sec">{t('Packaged foods')}</h4>
      {!onlineHere || online.state === 'idle'
        ? <Button variant="tinted" icon="globe" onClick={goOnline}>{t('Search “{0}” online', q)}</Button>
        : online.state === 'loading' ? <div className="small muted food-note">{t('Searching Open Food Facts…')}</div>
        : online.state === 'error' ? <>
          <div className="small muted food-note">{t('Could not reach Open Food Facts. Check the connection and try again.')}</div>
          <Button variant="tinted" icon="reset" onClick={goOnline}>{t('Try again')}</Button>
        </>
        : online.results.length ? <div className="sect-b food-list">{online.results.map((f, i) => <ResultRow key={f.code + i} food={f} onPick={pick} />)}</div>
        : <div className="small muted food-note">{t('No packaged foods by that name.')}</div>}
      <div className="small dim food-credit">{t('Packaged foods come from Open Food Facts (Open Database License), and the search goes online only when you tap it.')}</div>
    </>}
  </div>
}

export { MOBILE as CAN_SCAN }
