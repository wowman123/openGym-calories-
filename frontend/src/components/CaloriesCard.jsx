import { useNavigate } from 'react-router-dom'
import { t } from '../lib/i18n.js'
import { todayISO } from '../lib/format.js'
import { goalOf, totalOn, logStreak, rememberedFoods, mealAt } from '../lib/calories.js'
import { tappable } from '../lib/use-sheet-keyboard.js'
import { addFood, CountUp, fmtKcal } from '../views/Calories.jsx'
import { Button } from './ui.jsx'

// Home's glance at today's calories: the running total against the goal, and the foods you eat
// most as one-tap chips, logged into the meal of the hour. Everything else is on the Calories
// screen (views/Calories.jsx). Folds away with Settings → On Home → Calories.
export default function CaloriesCard({ S }) {
  const nav = useNavigate()
  const today = todayISO()
  const goal = goalOf(S)
  const eaten = totalOn(S, today)
  const left = goal - eaten
  const streak = logStreak(S, today)
  const foods = rememberedFoods(S, { limit: 8 })
  const open = () => nav('/calories')

  return <div className="card kcal-card">
    <div className="row between bw-head" style={{ marginBottom: 6 }}>
      <h2 style={{ margin: 0 }}>{t('Calories')}</h2>
      <Button size="sm" icon="plus" onClick={open}>{t('Log')}</Button>
    </div>
    <div className="kcal-glance" {...tappable(open)} aria-label={t('Open calories')}>
      <div className="big"><CountUp value={eaten} /> <span className="muted" style={{ fontSize: '1rem', fontWeight: 400 }}>/ {fmtKcal(goal)} kcal</span></div>
      <div className={'kcal-meter' + (left < 0 ? ' over' : '')} aria-hidden="true"><span style={{ width: Math.min(eaten / goal, 1) * 100 + '%' }} /></div>
      <div className="small muted">
        {left < 0 ? t('{0} kcal over', fmtKcal(-left)) : t('{0} kcal left', fmtKcal(left))}
        {streak > 0 && <> · {t('Days in a row: {0}', streak)}</>}
      </div>
    </div>
    {foods.length > 0 ? <div className="chips kcal-quick">
      {foods.map(f => <button type="button" key={f.key} className="chip kcal-chip"
        onClick={() => addFood({ name: f.name, kcal: f.kcal, meal: mealAt() })} aria-label={t('Add {0}, {1} kcal', f.name, fmtKcal(f.kcal))}>
        <span className="nm">{f.name}</span><span className="kc">{fmtKcal(f.kcal)}</span>
      </button>)}
    </div> : <div className="small dim" style={{ marginTop: 8 }}>{t('Log what you eat once and it shows up here for one-tap adding.')}</div>}
  </div>
}
