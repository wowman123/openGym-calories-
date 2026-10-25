// The food database search and the Open Food Facts reader: what a typed query finds and in which
// order, what a portion comes to, and how an online product turns into a food. No network.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { normalize, readFood, prepareDb, searchFoods, portionsOf, kcalFor, entryNameFor, loadFoodDb, resetFoodDb } from './food-db.js'
import { readOffProduct, cleanBarcode, offSearchUrl, searchOff, productByBarcode } from './open-food-facts.js'

const DB = prepareDb({
  v: 1,
  sources: { us: { name: 'USDA' } },
  foods: [
    ['Bananas, raw', 'us', 89, 1.1, 0.3, 22.8, [['1 medium (7" to 7-7/8" long)', 118], ['1 cup, sliced', 150]]],
    ['Banana bread', 'us', 326, 4.3, 10.5, 54.6, [['1 slice', 60]]],
    ['Pad Thai, with chicken', 'us', 170, 9.5, 6.2, 19.3, [['1 cup', 200]]],
    ['Chicken breast, roasted', 'us', 165, 31, 3.6, 0, []],
    ['Crème brûlée', 'fr', 290, 4.2, 22, 19, []],
    ['Eggs, whole, boiled', 'us', 155, 12.6, 10.6, 1.1, [['1 large', 50]]],
    ['Tomatoes, red, raw', 'us', 18, 0.9, 0.2, 3.9, []],
    ['Gyoza (dumplings), pan-fried', 'jp', 210, 7, 9, 25, []],
    ['No calories here', 'uk', null, 1, 1, 1, []],
    ['Way too dense', 'uk', 4000, 1, 1, 1, []],
  ],
})

describe('food database: reading and searching', () => {
  it('folds case, accents and punctuation', () => {
    expect(normalize('Crème Brûlée, (homemade)')).toBe('creme brulee homemade')
  })

  it('reads rows, and leaves out foods without believable calories', () => {
    expect(DB.foods).toHaveLength(8)
    expect(DB.foods[0]).toMatchObject({ name: 'Bananas, raw', src: 'us', kcal: 89, portions: [{ label: '1 medium (7" to 7-7/8" long)', g: 118 }, { label: '1 cup, sliced', g: 150 }] })
    expect(readFood(['x', 'us', 10, null, null, null, [['bad', 0], ['', 5], ['ok', 30]]]).portions).toEqual([{ label: 'ok', g: 30 }])
    expect(readFood(null)).toBeNull()
  })

  it('finds a food by the start of its words, the plain food before what is made of it', () => {
    expect(searchFoods(DB, 'banana').map(f => f.name)).toEqual(['Bananas, raw', 'Banana bread'])
    expect(searchFoods(DB, 'chick').map(f => f.name)).toEqual(['Chicken breast, roasted', 'Pad Thai, with chicken'])
    expect(searchFoods(DB, 'pad thai')[0].name).toBe('Pad Thai, with chicken')
  })

  it('needs every word, takes plurals, and ignores accents', () => {
    expect(searchFoods(DB, 'banana slice cake')).toEqual([])
    expect(searchFoods(DB, 'eggs boiled')[0].name).toBe('Eggs, whole, boiled')
    expect(searchFoods(DB, 'tomatoes')[0].name).toBe('Tomatoes, red, raw')
    expect(searchFoods(DB, 'creme brulee')[0].name).toBe('Crème brûlée')
    expect(searchFoods(DB, 'dumplings')[0].src).toBe('jp')
    expect(searchFoods(DB, '   ')).toEqual([])
    expect(searchFoods(null, 'banana')).toEqual([])
  })

  it('caps the list', () => {
    expect(searchFoods(DB, 'b')).toHaveLength(5)
    expect(searchFoods(DB, 'b', 2)).toHaveLength(2)
  })
})

describe('food database: amounts', () => {
  const banana = DB.foods[0]
  it('offers the food’s own portions, then 100 g', () => {
    expect(portionsOf(banana).map(p => p.label)).toEqual(['1 medium (7" to 7-7/8" long)', '1 cup, sliced', '100 g'])
    expect(portionsOf({ portions: [{ label: '100 g', g: 100 }] })).toHaveLength(1)
  })

  it('works out the calories of an amount', () => {
    expect(kcalFor(banana, 118)).toBe(105)
    expect(kcalFor(banana, 0)).toBe(0)
  })

  it('names a logged amount after the food and how much of it', () => {
    const [medium, , g100] = portionsOf(banana)
    expect(entryNameFor(banana, medium)).toBe('Bananas, raw · 1 medium (7" to 7-7/8" long)')
    expect(entryNameFor(banana, medium, 2)).toBe('Bananas, raw · 2 × 1 medium (7" to 7-7/8" long)')
    expect(entryNameFor(banana, g100, 1.5)).toBe('Bananas, raw · 150 g')
    expect(entryNameFor(banana, { label: 'grams', g: 1, custom: true }, 75)).toBe('Bananas, raw · 75 g')
  })

  it('loads the file once, and tries again after a failure', async () => {
    resetFoodDb()
    const bad = vi.fn(async () => ({ ok: false, status: 404 }))
    await expect(loadFoodDb(bad)).rejects.toThrow('404')
    const good = vi.fn(async () => ({ ok: true, json: async () => ({ foods: [['Rice', 'us', 130, 2.7, 0.3, 28, []]] }) }))
    const db = await loadFoodDb(good)
    await loadFoodDb(good)
    expect(good).toHaveBeenCalledTimes(1)
    expect(db.foods[0].name).toBe('Rice')
    resetFoodDb()
  })
})

describe('Open Food Facts', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it('reads a product: brand in the name, calories from kcal or kJ, the serving as a portion', () => {
    expect(readOffProduct({
      code: '5449000000996', product_name: 'Coca-Cola', brands: 'Coca-Cola, The Coca-Cola Company',
      serving_size: '330 ml', serving_quantity: 330, nutriments: { 'energy-kcal_100g': 42, carbohydrates_100g: 10.6, proteins_100g: 0, fat_100g: 0 },
    })).toEqual({ name: 'Coca-Cola', src: 'off', code: '5449000000996', kcal: 42, p: 0, f: 0, c: 10.6, portions: [{ label: '1 serving (330 ml)', g: 330 }], quantity: null })
    const kj = readOffProduct({ product_name: 'Muesli', brands: 'Alpen', nutriments: { energy_100g: 1500 } })
    expect(kj).toMatchObject({ name: 'Muesli (Alpen)', kcal: 359, portions: [] })
    expect(readOffProduct({ product_name: 'Mystery', nutriments: {} })).toBeNull()
    expect(readOffProduct({ nutriments: { 'energy-kcal_100g': 100 } })).toBeNull()
  })

  it('cleans a barcode, and builds a search for the words typed', () => {
    expect(cleanBarcode(' 5449-0000-00996 ')).toBe('5449000000996')
    expect(cleanBarcode('123')).toBeNull()
    const u = new URL(offSearchUrl('hummus  sabra'))
    expect(u.searchParams.get('search_terms')).toBe('hummus  sabra')
    expect(u.searchParams.get('json')).toBe('1')
  })

  it('searches, leaving out products without calories and repeats', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ products: [
      { product_name: 'Hummus', brands: 'Sabra', nutriments: { 'energy-kcal_100g': 250 } },
      { product_name: 'Hummus', brands: 'Sabra', nutriments: { 'energy-kcal_100g': 250 } },
      { product_name: 'Hummus light', nutriments: {} },
    ] }) })))
    const found = await searchOff('hummus')
    expect(found.map(f => f.name)).toEqual(['Hummus (Sabra)'])
    expect(await searchOff('  ')).toEqual([])
  })

  it('looks up a barcode, and says nothing for an unknown one', async () => {
    vi.stubGlobal('fetch', vi.fn(async url => (String(url).includes('/0000000000000')
      ? { ok: false, status: 404 }
      : { ok: true, json: async () => ({ status: 1, product: { product_name: 'Bamba', brands: 'Osem', nutriments: { 'energy-kcal_100g': 534 } } }) })))
    expect(await productByBarcode('7290000066318')).toMatchObject({ name: 'Bamba (Osem)', kcal: 534, code: '7290000066318' })
    expect(await productByBarcode('0000000000000')).toBeNull()
    expect(await productByBarcode('12')).toBeNull()
  })
})
