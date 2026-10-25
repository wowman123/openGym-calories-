#!/usr/bin/env node
// Builds the Calories screen's offline food database, frontend/public/food-db/foods.json, out
// of national food composition tables (per 100 g of edible food):
//
//   us  USDA FoodData Central: FNDDS survey foods (dishes as eaten, with portions), Foundation
//       Foods and SR Legacy                                         public domain (CC0)
//   fr  ANSES CIQUAL 2020, France                                   Licence Ouverte / Etalab 2.0
//   uk  McCance and Widdowson's CoFID 2021, United Kingdom          Open Government Licence v3.0
//   jp  MEXT Standard Tables of Food Composition in Japan 2015      Government of Japan terms (attribution)
//
//   node scripts/food-db/build.mjs <download dir> <out dir> <report file>
//
// The download dir is filled by .github/workflows/food-db.yml: each USDA zip unpacked into
// usda-survey/, usda-foundation/ and usda-sr/, the spreadsheets as ciqual-*.xls, cofid.xlsx and
// japan.xlsx. A source that is missing or cannot be read is reported and left out; the rest still
// build. The report says, per source, how many foods came out and what the sheets looked like,
// so a change of layout upstream shows up there instead of as an empty search.
//
// Output, kept compact because it ships inside the app:
//   { v, built, sources: { id: { name, licence, url } },
//     foods: [[name, source, kcal, protein, fat, carbs, [[portion label, grams], …]], …] }
// Energy in kcal and the macros in g, all per 100 g; a value the table does not give is null.
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

const [, , DL = 'food-dl', OUT = 'frontend/public/food-db', REPORT = 'scripts/food-db/report.md'] = process.argv
const require = createRequire(path.resolve(DL, 'x.js'))
const log = []
const say = s => { log.push(s); console.log(s) }

export const SOURCES = {
  us: { name: 'USDA FoodData Central (FNDDS, Foundation Foods, SR Legacy)', licence: 'Public domain (CC0 1.0)', url: 'https://fdc.nal.usda.gov/' },
  fr: { name: 'ANSES-CIQUAL French food composition table 2020', licence: 'Licence Ouverte / Open Licence (Etalab)', url: 'https://ciqual.anses.fr/' },
  uk: { name: "McCance and Widdowson's Composition of Foods Integrated Dataset 2021 (Public Health England)", licence: 'Open Government Licence v3.0', url: 'https://www.gov.uk/government/publications/composition-of-foods-integrated-dataset-cofid' },
  jp: { name: 'Standard Tables of Food Composition in Japan 2015 (Seventh Revised Edition), MEXT', licence: 'Government of Japan Standard Terms of Use (attribution)', url: 'https://www.mext.go.jp/en/policy/science_technology/policy/title01/detail01/1374030.htm' },
}

/* ------------------------------------------------------------------ helpers -- */

// One CSV record per array, quoted fields with commas, doubled quotes and line breaks inside.
export function parseCsv(text) {
  const rows = []
  let row = [], field = '', q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++ } else q = false }
      else field += c
    } else if (c === '"') q = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field); field = ''
      if (row.length > 1 || row[0] !== '') rows.push(row)
      row = []
    } else field += c
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row) }
  return rows
}

// A CSV file as objects keyed by its header; [] when the file is not there.
function readCsv(file) {
  if (!file || !fs.existsSync(file)) return []
  const [head, ...rows] = parseCsv(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''))
  return rows.map(r => Object.fromEntries(head.map((h, i) => [h, r[i]])))
}

// The first file named `name` anywhere under `dir`.
function find(dir, name) {
  if (!fs.existsSync(dir)) return null
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) { const f = find(p, name); if (f) return f }
    else if (e.name === name) return p
  }
  return null
}

// A table's number: "1,5", "< 0,5", "traces", "Tr", "(0)", "-", "N" and friends. Traces read as 0;
// not measured (blank, "-", "N", "*") as null.
export function num(v) {
  if (v == null) return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  let s = String(v).trim().replace(/^\((.*)\)$/, '$1').trim()
  if (!s || /^(-|–|n|na|nd|\*|…)$/i.test(s)) return null
  if (/^(tr|traces?)$/i.test(s)) return 0
  s = s.replace(/^[<>≤≥]\s*/, '').replace(',', '.').replace(/[^0-9.\-]/g, '')
  const n = parseFloat(s)
  return Number.isFinite(n) ? n : null
}

const r1 = n => (n == null ? null : Math.round(n * 10) / 10)
const r0 = n => (n == null ? null : Math.round(n))
const fmtAmount = a => { const n = Number(a); return Number.isFinite(n) ? String(Math.round(n * 100) / 100) : '' }
const clean = s => String(s ?? '').replace(/\s+/g, ' ').trim()

/* --------------------------------------------------------------------- USDA -- */

// Nutrients by FoodData Central id, with the older SR numbers some files use instead (208, 203…).
// Energy in kcal: Foundation Foods often only carry the Atwater ones (2047, 2048).
const ENERGY = ['1008', '208', '2047', '2048', '957', '958']
const PROTEIN = ['1003', '203'], FAT = ['1004', '204'], CARBS = ['1005', '205']
const first = (n, ids) => ids.map(k => n[k]).find(v => v != null)

function usda(dir, label) {
  const foods = readCsv(find(dir, 'food.csv'))
  if (!foods.length) { say(`- ${label}: no food.csv under ${dir}`); return [] }
  const units = Object.fromEntries(readCsv(find(dir, 'measure_unit.csv')).map(u => [u.id, u.name]))
  // nutrient.csv, where there is one, says which id is which, whatever the numbering.
  const alias = {}
  for (const n of readCsv(find(dir, 'nutrient.csv'))) {
    const name = String(n.name || ''), unit = String(n.unit_name || '').toUpperCase()
    if (/^energy/i.test(name) && unit === 'KCAL') alias[n.id] = alias[n.id] || '1008'
    else if (/^protein$/i.test(name)) alias[n.id] = '1003'
    else if (/^total lipid/i.test(name)) alias[n.id] = '1004'
    else if (/^carbohydrate, by difference/i.test(name)) alias[n.id] = '1005'
  }
  const want = new Set([...ENERGY, ...PROTEIN, ...FAT, ...CARBS, ...Object.keys(alias)])
  const nfile = find(dir, 'food_nutrient.csv')
  const rows = readCsv(nfile)
  const seenIds = {}
  const nut = new Map()
  for (const r of rows) {
    const id = r.nutrient_id ?? r.nutrient_nbr
    if (Object.keys(seenIds).length < 400) seenIds[id] = (seenIds[id] || 0) + 1
    if (!want.has(id)) continue
    const m = nut.get(r.fdc_id) || {}
    m[id] = num(r.amount)
    if (alias[id] && m[alias[id]] == null) m[alias[id]] = m[id]
    nut.set(r.fdc_id, m)
  }
  say(`- ${label} files: ${fs.readdirSync(path.dirname(find(dir, 'food.csv'))).join(', ')}`)
  say(`  food_nutrient.csv: ${nfile ? rows.length + ' rows, columns ' + Object.keys(rows[0] || {}).join(',') : 'missing'}; ids seen: ${Object.keys(seenIds).slice(0, 30).join(',')}`)
  const portions = new Map()
  for (const p of readCsv(find(dir, 'food_portion.csv'))) {
    const g = num(p.gram_weight)
    if (!(g > 0)) continue
    let desc = clean(p.portion_description)
    if (/quantity not specified/i.test(desc)) desc = 'Typical serving'
    const unit = units[p.measure_unit_id]
    const label = desc || clean([fmtAmount(p.amount), unit && unit !== 'undetermined' ? unit : '', clean(p.modifier)].filter(Boolean).join(' '))
    if (!label) continue
    const list = portions.get(p.fdc_id) || []
    if (!list.some(x => x[0] === label)) list.push([label, r1(g)])
    portions.set(p.fdc_id, list)
  }
  const types = {}
  const out = []
  for (const f of foods) {
    types[f.data_type] = (types[f.data_type] || 0) + 1
    if (!/survey_fndds_food|foundation_food|sr_legacy_food/.test(f.data_type || '')) continue
    const n = nut.get(f.fdc_id) || {}
    const kcal = first(n, ENERGY)
    if (kcal == null) continue
    out.push({ name: clean(f.description), src: 'us', kcal: r0(kcal), p: r1(first(n, PROTEIN)), f: r1(first(n, FAT)), c: r1(first(n, CARBS)), portions: (portions.get(f.fdc_id) || []).slice(0, 6), type: f.data_type })
  }
  say(`- ${label}: ${foods.length} rows (${Object.entries(types).map(([k, v]) => k + ' ' + v).join(', ')}), ${nut.size} with nutrients, ${portions.size} with portions → ${out.length} foods`)
  return out
}

/* ------------------------------------------------------------- spreadsheets -- */

let XLSX = null
function loadXlsx() {
  if (XLSX) return XLSX
  try { XLSX = require('xlsx') } catch (e) { say(`- spreadsheets: the xlsx package is not installed (${e.message})`) }
  return XLSX
}

// Every sheet of a workbook as rows of cells, with a peek at the top of each for the report.
function sheets(file, label) {
  if (!fs.existsSync(file)) { say(`- ${label}: ${path.basename(file)} not downloaded`); return [] }
  const X = loadXlsx()
  if (!X) return []
  const wb = X.readFile(file, { cellDates: false })
  return wb.SheetNames.map(name => {
    const rows = X.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: null, blankrows: false })
    return { name, rows }
  })
}

const peek = (label, s) => {
  say(`  - sheet "${s.name}" (${s.rows.length} rows); top rows:`)
  for (const r of s.rows.slice(0, 8)) say('    | ' + r.slice(0, 14).map(c => clean(c).slice(0, 28)).join(' | '))
}

// The header row (within the first `scan` rows) and the column of each wanted field, by pattern.
// `fields` = { key: [regex, …] } in order of preference. Headers spread over several rows are
// read joined, so "Energy" over "kcal" still matches /energy.*kcal/.
function locate(rows, fields, scan = 25) {
  for (let h = 0; h < Math.min(scan, rows.length); h++) {
    const heads = (rows[h] || []).map((_, i) => clean([rows[h - 2]?.[i], rows[h - 1]?.[i], rows[h]?.[i]].filter(v => v != null).join(' ')))
    const own = (rows[h] || []).map(c => clean(c))
    const cols = {}
    for (const [key, pats] of Object.entries(fields)) {
      for (const re of pats) {
        let i = own.findIndex(x => re.test(x))
        if (i < 0) i = heads.findIndex(x => re.test(x))
        if (i >= 0) { cols[key] = i; break }
      }
    }
    if (cols.name != null && cols.kcal != null) return { header: h, cols }
  }
  return null
}

function fromSheets(label, src, list, fields, { nameOk = () => true } = {}) {
  const out = []
  for (const s of list) {
    peek(label, s)
    const at = locate(s.rows, fields)
    if (!at) { say(`  - no name + kcal columns found in "${s.name}"`); continue }
    say(`  - header row ${at.header + 1}, columns ${JSON.stringify(at.cols)}`)
    for (const r of s.rows.slice(at.header + 1)) {
      const name = clean(r[at.cols.name])
      const kcal = num(r[at.cols.kcal])
      if (!name || kcal == null || kcal > 950 || !nameOk(name, r)) continue
      out.push({ name, src, kcal: r0(kcal), p: r1(num(r[at.cols.p])), f: r1(num(r[at.cols.f])), c: r1(num(r[at.cols.c])), portions: [] })
    }
    if (out.length) break   // the main table is the first sheet that reads
  }
  say(`- ${label}: ${out.length} foods`)
  return out
}

function ciqual(dl) {
  const files = fs.existsSync(dl) ? fs.readdirSync(dl).filter(f => /^ciqual.*\.xlsx?$/i.test(f)).sort() : []
  say(`- CIQUAL files: ${files.join(', ') || 'none'}`)
  if (!files.length) { say('- CIQUAL: no spreadsheet downloaded'); return [] }
  let best = []
  for (const f of files) {
    say(`- CIQUAL ${f}:`)
    const got = fromSheets('CIQUAL ' + f, 'fr', sheets(path.join(dl, f), 'CIQUAL'), {
      name: [/^alim_nom_eng$/i, /^alim_nom_fr$/i, /food name/i],
      kcal: [/1169.*kcal/i, /energ.*kcal/i],
      p: [/jones/i, /^prot.*6[.,]25/i, /^prot/i],
      f: [/^(fat|lipides)\b/i],
      c: [/^(carbohydrate|glucides)\b/i],
    })
    // The English table first: an English name reads better in this app than the French one.
    if (got.length > best.length || (got.length && /eng|en/i.test(f) && got.length >= best.length * 0.9)) best = got
  }
  return best
}

function cofid(dl) {
  say('- CoFID:')
  return fromSheets('CoFID', 'uk', sheets(path.join(dl, 'cofid.xlsx'), 'CoFID').filter(s => /proximate/i.test(s.name)), {
    name: [/^food name$/i],
    kcal: [/^energy \(kcal\)/i, /kcal/i],
    p: [/^protein/i],
    f: [/^fat/i],
    c: [/^carbohydrate/i],
  })
}

function japan(dl) {
  say('- Japan:')
  return fromSheets('Japan', 'jp', sheets(path.join(dl, 'japan.xlsx'), 'Japan'), {
    name: [/food and description/i, /^food name/i, /description/i],
    kcal: [/ENERC_KCAL/i, /energy.*kcal/i, /^kcal$/i],
    p: [/^PROT-?$/i, /^protein$/i, /protein/i],
    f: [/^FAT-?$/i, /^lipid$/i, /^fat$/i],
    c: [/^CHOCDF-?$/i, /carbohydrate/i],
  })
}

/* --------------------------------------------------------------------- main -- */

function main() {
  say(`# Food database build, ${new Date().toISOString().slice(0, 10)}\n`)
  const dlog = path.join(DL, 'downloads.txt')
  if (fs.existsSync(dlog)) say('## Downloads\n\n```\n' + fs.readFileSync(dlog, 'utf8').trim() + '\n```\n')
  say('## Sources\n')
  const us = [
    ...usda(path.join(DL, 'usda-survey'), 'USDA FNDDS'),
    ...usda(path.join(DL, 'usda-foundation'), 'USDA Foundation'),
    ...usda(path.join(DL, 'usda-sr'), 'USDA SR Legacy'),
  ]
  let fr = [], uk = [], jp = []
  try { fr = ciqual(DL) } catch (e) { say(`- CIQUAL failed: ${e.stack}`) }
  try { uk = cofid(DL) } catch (e) { say(`- CoFID failed: ${e.stack}`) }
  try { jp = japan(DL) } catch (e) { say(`- Japan failed: ${e.stack}`) }

  // The same name within a source once: FNDDS (dishes as eaten, with portions) before
  // Foundation before SR Legacy, which is the order they were read in.
  const seen = new Set()
  const foods = []
  for (const f of [...us, ...fr, ...uk, ...jp]) {
    const key = f.src + '|' + f.name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    foods.push([f.name, f.src, f.kcal, f.p, f.f, f.c, f.portions])
  }
  foods.sort((a, b) => (a[0].toLowerCase() < b[0].toLowerCase() ? -1 : 1))

  const counts = Object.fromEntries(Object.keys(SOURCES).map(k => [k, foods.filter(f => f[1] === k).length]))
  const used = Object.fromEntries(Object.entries(SOURCES).filter(([k]) => counts[k] > 0))
  fs.mkdirSync(OUT, { recursive: true })
  const json = JSON.stringify({ v: 1, built: new Date().toISOString().slice(0, 10), sources: used, foods })
  fs.writeFileSync(path.join(OUT, 'foods.json'), json)
  fs.writeFileSync(path.join(OUT, 'SOURCES.md'), '# Food database sources\n\nNutrient values per 100 g, from:\n\n' +
    Object.entries(used).map(([k, s]) => `- **${s.name}** (${counts[k]} foods). ${s.licence}. ${s.url}`).join('\n') +
    '\n\nBuilt by scripts/food-db/build.mjs. Values are as published; no changes beyond rounding.\n')

  say('\n## Result\n')
  say(`${foods.length} foods, ${(json.length / 1048576).toFixed(2)} MB: ` + Object.entries(counts).map(([k, n]) => `${k} ${n}`).join(', '))
  say('\nSamples:')
  for (const k of Object.keys(SOURCES)) for (const f of foods.filter(x => x[1] === k).slice(0, 400).filter((_, i) => i % 100 === 7)) say(`- ${JSON.stringify(f)}`)
  fs.mkdirSync(path.dirname(REPORT), { recursive: true })
  fs.writeFileSync(REPORT, log.join('\n') + '\n')
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) main()
