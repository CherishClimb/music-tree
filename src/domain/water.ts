import type { ImprovementLevel, QualityLevel } from './types'

export type WaterPracticeRecord = { id?: string; childId: string; date: string; minutes: number; quality?: QualityLevel | null; improvement?: ImprovementLevel }

export const MAX_DAILY_PRACTICE_RECORDS = 3

const isValidPractice = (record: Pick<WaterPracticeRecord, 'minutes' | 'quality'>) =>
  Number.isFinite(record.minutes) && record.minutes >= 0 &&
  (record.quality === 'normal' || record.quality === 'focused' || record.quality === 'difficult')

export const calculatePracticeWater = (record: Pick<WaterPracticeRecord, 'minutes' | 'quality' | 'improvement'>) => {
  if (!isValidPractice(record) || record.minutes < 5) return 0
  if (record.minutes < 10) return 1
  if (record.minutes >= 20) return 3
  if (record.minutes >= 15 && (record.quality === 'focused' || record.improvement === 'clear')) return 3
  return 2
}

export const selectDailyPractice = (records: WaterPracticeRecord[], childId: string, localDate: string) => {
  const daily = records.filter((record) => record.childId === childId && record.date === localDate && isValidPractice(record))
  const minutes = daily.reduce((sum, record) => sum + record.minutes, 0)
  const focusedMinutes = daily.reduce((sum, record) => sum + (record.quality === 'focused' ? record.minutes : 0), 0)
  // A strict majority by minutes is independent of record order and splitting.
  const focused = focusedMinutes > minutes / 2
  const clearProgress = daily.some((record) => record.minutes > 0 && record.improvement === 'clear')
  const breakthrough = daily.some((record) => record.improvement === 'breakthrough')
  const water = calculatePracticeWater({ minutes, quality: focused ? 'focused' : 'normal', improvement: clearProgress ? 'clear' : 'none' })
  return { minutes, focused, clearProgress, breakthrough, water }
}

export const selectDailyWater = (records: WaterPracticeRecord[], childId: string, localDate: string) =>
  selectDailyPractice(records, childId, localDate).water

export const countDailyPracticeRecords = (records: WaterPracticeRecord[], childId: string, localDate: string, excludingId?: string) => records.filter((record) => record.id !== excludingId && record.childId === childId && record.date === localDate).length