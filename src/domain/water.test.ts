import { describe, expect, it } from 'vitest'
import { calculatePracticeWater, selectDailyPractice, selectDailyWater, type WaterPracticeRecord } from './water'

const record = (minutes: number, quality: WaterPracticeRecord['quality'] = 'normal', id = String(minutes), childId = 'child', date = '2026-08-04'): WaterPracticeRecord => ({ id, childId, date, minutes, quality })
const daily = (records: WaterPracticeRecord[]) => selectDailyPractice(records, 'child', '2026-08-04')

describe('date-based Water from aggregate practice', () => {
  it.each([
    [0, 0], [1, 0], [3, 0], [4, 0], [5, 1], [7, 1], [9, 1],
    [10, 2], [12, 2], [14, 2], [15, 2], [19, 2], [20, 3], [120, 3],
  ])('%s ordinary minutes give %s Water', (minutes, water) => {
    expect(calculatePracticeWater(record(minutes))).toBe(water)
    expect(daily([record(minutes)]).water).toBe(water)
  })

  it.each([15, 16, 19])('%s minutes can qualify with Focused or Clear Progress', (minutes) => {
    expect(daily([record(minutes, 'focused')]).water).toBe(3)
    expect(daily([{ ...record(minutes), improvement: 'clear' }]).water).toBe(3)
    expect(daily([record(minutes, 'difficult')]).water).toBe(2)
    expect(daily([{ ...record(minutes, 'difficult'), improvement: 'clear' }]).water).toBe(3)
  })

  it.each([3, 8, 12, 15, 20])('Breakthrough at %s minutes leaves actual Water unchanged', (minutes) => {
    const ordinary = record(minutes)
    const breakthrough = { ...ordinary, improvement: 'breakthrough' as const }
    expect(daily([breakthrough])).toMatchObject({ breakthrough: true, water: daily([ordinary]).water })
  })

  it.each([0, 4, 5, 9, 10, 14, 15, 19, 20])('Difficult at %s minutes gets the ordinary duration result', (minutes) => {
    expect(daily([record(minutes, 'difficult')]).water).toBe(daily([record(minutes)]).water)
  })

  it('aggregates minutes before calculating Water, including short valid sessions', () => {
    expect(daily([record(5, 'normal', 'a'), record(5, 'normal', 'b'), record(5, 'normal', 'c')]).water).toBe(2)
    expect(daily([record(15)]).water).toBe(2)
    expect(daily([record(3, 'normal', 'a'), record(3, 'normal', 'b')]).water).toBe(1)
    expect(daily([record(10, 'normal', 'a'), record(10, 'normal', 'b')]).water).toBe(3)
  })

  it.each([
    [14, 1, false, 2],
    [10, 5, false, 2],
    [8, 8, false, 2],
    [5, 10, true, 3],
  ])('%s ordinary + %s focused minutes: majority Focused = %s, Water = %s', (normal, focused, qualifies, water) => {
    const records = [record(normal, 'normal', 'a'), record(focused, 'focused', 'b')]
    expect(daily(records)).toMatchObject({ focused: qualifies, water })
    expect(daily([...records].reverse())).toEqual(daily(records))
  })

  it('a plurality is insufficient: Focused must outweigh all other practice minutes combined', () => {
    expect(daily([record(7, 'focused', 'a'), record(5, 'normal', 'b'), record(4, 'difficult', 'c')]))
      .toMatchObject({ focused: false, water: 2 })
  })

  it('splitting a quality contribution does not change the overall result', () => {
    const together = [record(10, 'focused', 'a'), record(5, 'normal', 'b')]
    const split = [record(5, 'focused', 'a1'), record(5, 'focused', 'a2'), record(5, 'normal', 'b')]
    expect(daily(split)).toEqual(daily(together))
  })

  it('uses explicit Clear Progress on a positive-duration record for that date', () => {
    expect(daily([record(10, 'normal', 'a'), { ...record(5, 'normal', 'b'), improvement: 'clear' }]).water).toBe(3)
    expect(daily([record(15), { ...record(0, 'normal', 'b'), improvement: 'clear' }]).water).toBe(2)
  })

  it('ignores invalid minutes or missing/unknown quality even with improvement markers', () => {
    const invalid = [record(-5), record(NaN), record(Infinity), record(20, null), { ...record(20), quality: 'unknown' as never }]
      .map((item) => ({ ...item, improvement: 'breakthrough' as const }))
    expect(daily(invalid)).toMatchObject({ minutes: 0, water: 0, breakthrough: false })
    expect(daily([...invalid, record(5, 'normal', 'valid')]).water).toBe(1)
  })

  it('selects independently by child/date, without carry-over, decay, spending or cooldown', () => {
    const records = [
      record(15, 'normal', 'monday', 'child', '2026-10-05'),
      record(5, 'normal', 'wednesday', 'child', '2026-10-07'),
      record(20, 'focused', 'other-child', 'other', '2026-10-05'),
    ]
    expect(selectDailyWater(records, 'child', '2026-10-05')).toBe(2)
    expect(selectDailyWater(records, 'child', '2026-10-06')).toBe(0)
    expect(selectDailyWater(records, 'child', '2026-10-07')).toBe(1)
    expect(selectDailyWater(records, 'child', '2026-10-08')).toBe(0)
    expect(selectDailyWater(records, 'other', '2026-10-05')).toBe(3)
  })
})