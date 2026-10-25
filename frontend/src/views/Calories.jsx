import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { t, dateLocale } from '../lib/i18n.js'
import { todayISO, fmtDate, isoOf, DAYS } from '../lib/format.js'
import {
  MEALS, MEAL_LABEL, QUICK_ADD, STARTER_FOODS, FOOD_NAME_MAX, KCAL_GOAL_MIN, KCAL_GOAL_MAX,
  goalOf, parseKcal, mealAt, entriesOn, logStreak, lastDays, loggedAverage, rememberedFoods,
  foodNamed, logFood, unlogFood, withFoodEntry, withoutFoodEntry, withFoodRecord, shiftISO,
} from '../lib/calories.js'
import Icon from '../components/Icon.jsx'
import FoodSearch, { scanFoodBarcode, CAN_SCAN } from '../components/FoodSearch.jsx'
import { Button, Segmented, Stepper, TextField } from '../components/ui.jsx'

// Calories: what you ate on a day against your goal, and the foods you eat often, remembered so
// the next time is one tap. Home has the short version (components/CaloriesCard.jsx). The data
// and its merge rules live in lib/calories.js.

const update = fn => useStore.getState().update(fn)
const toast = (msg, opts) => useUI.getState().toast(msg, opts)

export const fmtKcal = n => Math.round(n || 0).toLocaleString(dateLocale())
const shortKcal = n => (n >= 1000 ? (Math.round(n / 100) / 10).toLocaleString(dateLocale()) + 'k' : String(Math.round(n)))
/** An entry's name as shown: the calories-only entry in the UI language, the rest as typed. */
export const foodLabel = name => (name === QUICK_ADD ? t(QUICK_ADD) : name)
const reducedMotion = () => { try { return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches } catch { return false } }

/** Logs a food on `d` (today unless given) and offers to take it back. */
export function addFood({ name, kcal, meal }, d = todayISO()) {
  let undo = null
  update(s => { undo = logFood(s, { d, name, kcal, meal }) })
  toast(t('Added {0} · {1} kcal', foodLabel(String(name || '').trim() || QUICK_ADD), fmtKcal(kcal)), {
    action: t('Undo'), onAction: () => update(s => unlogFood(s, undo)),
  })
}

function removeEntry(e) {
  update(s => { s.foodLog = withoutFoodEntry(s.foodLog, e.id) })
  toast(t('Removed {0}', foodLabel(e.name)), {
    action: t('Undo'), onAction: () => update(s => { s.foodLog = withFoodEntry(s.foodLog, e, Date.now(), e.id) }),
  })
}

function forgetFood(f) {
  update(s => { s.foods = withFoodRecord(s.foods, f.key, null) })
  toast(t('Forgot {0}', f.name), { action: t('Undo'), onAction: () => update(s => { s.foods = withFoodRecord(s.foods, f.key, f) }) })
}

/** A number that counts up (or down) to its new value instead of jumping there. */
export function CountUp({ value }) {
  const [shown, setShown] = useState(value)
  const at = useRef(value)
  useEffect(() => {
    const from = at.current, to = value
    if (from === to) return
    if (reducedMotion() || typeof requestAnimationFrame !== 'function') { at.current = to; setShown(to); return }
    let raf = 0, t0 = null
    const step = now => {
      if (t0 == null) t0 = now
      const p = Math.min((now - t0) / 650, 1)
      const v = Math.round(from + (to - from) * (1 - Math.pow(1 - p, 3)))
      at.current = v; setShown(v)
      if (p < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => { cancelAnimationFrame(raf); at.current = to }
  }, [value])
  return <>{fmtKcal(shown)}</>
}

function KcalGoalSheet({ close }) {
  const S = useStore(s => s.S)
  const [v, setV] = useState(goalOf(S))
  return <>
    <h3>{t('Daily calorie goal')}</h3>
    <div className="muted small" style={{ marginBottom: 14 }}>{t('The ring fills up to it, and the week chart draws it as a line.')}</div>
    <Stepper value={v} step={50} min={KCAL_GOAL_MIN} max={KCAL_GOAL_MAX} decimal={false} unit="kcal" onChange={setV} ariaLabel={t('Daily calorie goal')} />
    <div style={{ height: 14 }} />
    <Button variant="primary" onClick={() => {
      update(s => { s.kcalGoal = Math.round(v) }); close()
      toast(t('Goal set: {0}', fmtKcal(v) + ' kcal'))
    }}>{t('Save goal')}</Button>
  </>
}
export const kcalGoalSheet = () => useUI.getState().openSheet(close => <KcalGoalSheet close={close} />)

const RING = 2 * Math.PI * 52

/** The ring and the three numbers beside it, for one day. */
export function KcalSummary({ eaten, goal, streak, small = false }) {
  const left = goal - eaten
  const over = left < 0
  return <div className={'kcal-hero' + (small ? ' small' : '')}>
    <div className={'kcal-ring' + (over ? ' over' : '')}>
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <circle className="trk" cx="60" cy="60" r="52" />
        <circle className="val" cx="60" cy="60" r="52" strokeDasharray={RING} strokeDashoffset={RING * (1 - Math.min(eaten / goal, 1))} />
      </svg>
      <div className="kcal-ring-c">
        <div className="kcal-num"><CountUp value={eaten} /></div>
        <div className="kcal-unit">{t('kcal eaten')}</div>
      </div>
    </div>
    <dl className="kcal-stats">
      <div><dt>{t('Goal')}</dt><dd><button className="kcal-goal" onClick={kcalGoalSheet} aria-label={t('Daily calorie goal') + ': ' + fmtKcal(goal)}>{fmtKcal(goal)}</button></dd></div>
      <div><dt>{over ? t('Over') : t('Left')}</dt><dd className={over ? 'over' : ''}>{fmtKcal(Math.abs(left))}</dd></div>
      {streak != null && <div><dt>{t('Days in a row')}</dt><dd>{streak}</dd></div>}
    </dl>
  </div>
}

export default function Calories() {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const today = todayISO()
  const [day, setDay] = useState(today)
  const [meal, setMeal] = useState(() => mealAt())
  const [name, setName] = useState('')
  const [kcal, setKcal] = useState('')
  // The calories field was filled in from a remembered food, not typed: a different name may
  // replace it, typed calories never are.
  const [auto, setAuto] = useState(false)
  const [editing, setEditing] = useState(false)
  const nameRef = useRef(null)

  const goal = goalOf(S)
  const entries = entriesOn(S, day)
  const eaten = entries.reduce((n, e) => n + e.kcal, 0)
  const streak = logStreak(S, today)
  const week = lastDays(S, today, 7)
  const avg = loggedAverage(week)
  const foods = rememberedFoods(S)
  const typing = !!name.trim() && !editing
  const shownFoods = typing ? rememberedFoods(S, { query: name }) : foods
  const isToday = day === today
  const dayTitle = isToday ? t('Today') : day === shiftISO(today, -1) ? t('Yesterday') : fmtDate(day, true)

  const onName = v => {
    setName(v)
    const f = foodNamed(S, v)
    if (f && (!kcal || auto)) { setKcal(String(f.kcal)); setAuto(true) }
    else if (!f && auto) { setKcal(''); setAuto(false) }
  }
  const submit = () => {
    const k = parseKcal(kcal)
    if (k == null) {
      toast(kcal.trim() ? t('Enter calories as a number, like 350, 120+80 or 2x105.') : t('Enter the calories first.'))
      return
    }
    addFood({ name, kcal: k, meal }, day)
    setName(''); setKcal(''); setAuto(false)
    nameRef.current?.focus()
  }
  const onEnter = e => { if (e.key === 'Enter') { e.preventDefault(); submit() } }
  // A food logged from the database or a scan: the form starts over.
  const cleared = () => { setName(''); setKcal(''); setAuto(false) }

  const max = Math.max(goal * 1.2, ...week.map(x => x.kcal)) || 1
  const meals = MEALS.filter(m => entries.some(e => e.meal === m))

  return <div className="narrow">
    <div className="hdr">
      <div className="row" style={{ gap: 10, minWidth: 0 }}>
        <button className="iconbtn" data-back="/home" onClick={() => nav('/home')} aria-label={t('Home')}><Icon name="chevronLeft" /></button>
        <div style={{ minWidth: 0 }}><h1>{t('Calories')}</h1><div className="sub">{t('Daily goal {0} kcal', fmtKcal(goal))}</div></div>
      </div>
      <button className="iconbtn" onClick={kcalGoalSheet} aria-label={t('Daily calorie goal')}><Icon name="target" /></button>
    </div>

    <div className="card">
      <div className="row between" style={{ marginBottom: 12 }}>
        <button className="iconbtn" style={{ width: 30, height: 30, fontSize: 15 }} onClick={() => setDay(d => shiftISO(d, -1))} aria-label={t('Previous day')}><Icon name="chevronLeft" /></button>
        <div className="small muted" style={{ fontWeight: 500 }}>{dayTitle}</div>
        <button className="iconbtn" style={{ width: 30, height: 30, fontSize: 15 }} disabled={day >= today} onClick={() => setDay(d => (d < today ? shiftISO(d, 1) : d))} aria-label={t('Next day')}><Icon name="chevronRight" /></button>
      </div>
      <KcalSummary eaten={eaten} goal={goal} streak={streak} />
    </div>

    <h4 className="sec">{isToday ? t('Add food') : t('Add food to {0}', fmtDate(day, true))}</h4>
    <div className="card kcal-add">
      <Segmented className="kcal-meals" value={meal} onChange={setMeal} options={MEALS.map(m => ({ value: m, label: t(MEAL_LABEL[m]) }))} />
      <div className="kcal-fields">
        <TextField ref={nameRef} id="kcal-food" value={name} maxLength={FOOD_NAME_MAX} placeholder={t('Search foods, or name your own')} aria-label={t('Food')}
          autoComplete="off" enterKeyHint="next" onChange={e => onName(e.target.value)} onKeyDown={onEnter} />
        <TextField id="kcal-amount" value={kcal} inputMode="decimal" maxLength={24} placeholder="kcal" aria-label={t('Calories')}
          autoComplete="off" enterKeyHint="done" onChange={e => { setKcal(e.target.value); setAuto(false) }} onKeyDown={onEnter} />
      </div>
      <Button variant="primary" icon="plus" onClick={submit}>{t('Add')}</Button>
      {CAN_SCAN && <Button variant="tinted" icon="qr" onClick={() => scanFoodBarcode({ meal, day, onAdded: cleared })}>{t('Scan a barcode')}</Button>}
      <div className="kcal-tip">{t('Type a food to search the database, or give your own calories. Sums work too: 120+80 or 2x105.')}</div>
    </div>

    {(!typing || shownFoods.length > 0) && <><div className="row between kcal-sec">
      <h4 className="sec">{typing ? t('Remembered foods matching “{0}”', name.trim()) : t('Remembered')}</h4>
      {foods.length > 0 && !typing && <Button size="sm" variant="ghost" onClick={() => setEditing(e => !e)}>{editing ? t('Done') : t('Edit')}</Button>}
    </div>
    <div className="kcal-chips">
      {foods.length === 0 && !typing && STARTER_FOODS.map(f => <button type="button" key={f.name} className="chip kcal-chip suggest"
        onClick={() => addFood({ name: t(f.name), kcal: f.kcal, meal }, day)}>
        <span className="nm">{t(f.name)}</span><span className="kc">{f.kcal}</span>
      </button>)}
      {shownFoods.map(f => editing
        ? <button type="button" key={f.key} className="chip kcal-chip forget" onClick={() => forgetFood(f)} aria-label={t('Forget {0}', f.name)}>
          <span className="nm">{f.name}</span><Icon name="xmark" />
        </button>
        : <button type="button" key={f.key} className="chip kcal-chip" onClick={() => addFood({ name: f.name, kcal: f.kcal, meal }, day)}
          aria-label={t('Add {0}, {1} kcal', f.name, fmtKcal(f.kcal))}>
          <span className="nm">{f.name}</span><span className="kc">{fmtKcal(f.kcal)}</span>{f.n > 1 && <span className="ct">×{f.n}</span>}
        </button>)}
    </div>
    <div className="kcal-hint">
      {editing ? t('Tap a food to forget it.')
        : typing ? t('Tap one to add it as it was last logged.')
        : foods.length ? t('Tap to add it to {0} with the calories you logged last.', t(MEAL_LABEL[meal]).toLowerCase())
        : t('Typical values to get going. Every food you log is remembered here, ready to add again in one tap.')}
    </div></>}

    {typing && <FoodSearch query={name} meal={meal} day={day} onAdded={cleared} />}

    <div className="row between kcal-sec">
      <h4 className="sec">{isToday ? t('Today’s log') : t('Log for {0}', fmtDate(day, true))}</h4>
      {entries.length > 0 && <span className="small muted kcal-total">{fmtKcal(eaten)} kcal</span>}
    </div>
    {entries.length ? meals.map(m => {
      const items = entries.filter(e => e.meal === m)
      return <div className="sect kcal-meal" key={m}>
        <div className="sect-t kcal-meal-t"><span>{t(MEAL_LABEL[m])}</span><span>{fmtKcal(items.reduce((n, e) => n + e.kcal, 0))} kcal</span></div>
        <div className="sect-b">{items.map(e => {
          const logged = e.t ? new Date(e.t) : null
          const time = logged && isoOf(logged) === e.d ? logged.toLocaleTimeString(dateLocale(), { hour: '2-digit', minute: '2-digit' }) : null
          return <div className="lrow" key={e.id}>
            <span className="lrow-m"><span className="lrow-t">{foodLabel(e.name)}</span>{time && <span className="lrow-s">{time}</span>}</span>
            <span className="kcal-v">{fmtKcal(e.kcal)}</span>
            <button className="iconbtn kcal-del" onClick={() => removeEntry(e)} aria-label={t('Remove {0}', foodLabel(e.name))}><Icon name="trash" /></button>
          </div>
        })}</div>
      </div>
    }) : <div className="card empty kcal-empty">
      <div className="ttl">{isToday ? t('Nothing logged yet today') : t('Nothing logged on this day')}</div>
      {t('Add a food above, or tap one you have had before.')}
    </div>}

    <h4 className="sec">{t('Last 7 days')}</h4>
    <div className="card kcal-week">
      <div className="kcal-plot">
        <div className="kcal-goal-line" style={{ bottom: (goal / max) * 100 + '%' }}><span>{t('Goal')}</span></div>
        {week.map(x => {
          const wd = t(DAYS[new Date(x.d + 'T12:00:00').getDay()])
          return <button type="button" key={x.d} className={'kcal-col' + (x.d === day ? ' sel' : '')} onClick={() => setDay(x.d)}
            aria-label={wd + ', ' + fmtKcal(x.kcal) + ' kcal'}>
            <span className={'kcal-bar' + (!x.kcal ? ' none' : x.kcal > goal ? ' over' : '')} style={{ height: x.kcal ? Math.max((x.kcal / max) * 100, 3) + '%' : undefined }} />
          </button>
        })}
      </div>
      <div className="kcal-x">{week.map(x => <div key={x.d} className={x.d === day ? 'sel' : ''}>
        <b>{t(DAYS[new Date(x.d + 'T12:00:00').getDay()])}</b>{x.kcal ? shortKcal(x.kcal) : '–'}
      </div>)}</div>
      <div className="small muted kcal-avg">{avg != null
        ? t('Average over the days you logged: {0} kcal', fmtKcal(avg))
        : t('Days you log fill in here.')}</div>
    </div>
  </div>
}

