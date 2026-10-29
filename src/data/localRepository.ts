import { createLessonEvaluation, validateHomeworkItem } from '../domain/homeworkEvaluation'
import { defaultRewards, type CompletedPiece, type ConcertRecord, type FamilyReward, type RewardProgress, type SpecialFruit } from '../domain/specialFruitEngine'
import { createStageEntrySnapshot, evaluateStageProgression, type ProgressionLearningCycle, type StageEntrySnapshot, type StageProgressionInput } from '../domain/stageProgressionEngine'
import { calculatePracticeGrowth, createInitialTreeState } from '../domain/treeGrowthEngine'
import type { AvatarId, ChildProfile, HomeworkAssignment, HomeworkItem, HomeworkItemEvaluation, HomeworkItemType, PracticeRecord, TeacherEvaluation, TeacherLessonEvaluation, TreeState } from '../domain/types'
import { isAvatarId } from '../domain/avatarOptions'
import { ensureCrossedRewardReminders, type RewardReminder, type RewardReminderStatus } from '../domain/rewardReminder'
import { validateVacationPeriod, vacationStatus, type VacationPeriod } from '../domain/vacation'
import { calculateLessonRootAward, totalRootAwardPoints, type RootAward } from '../domain/rootGrowth'
import { isRewardFruitType, selectRewardFruitSlot, type ParentReward, type RewardFruitType } from '../domain/parentReward'
import { isCalendarDate, localCalendarDate } from '../domain/localCalendarDate'
import { countDailyPracticeRecords, MAX_DAILY_PRACTICE_RECORDS, selectDailyPractice, selectDailyWater } from '../domain/water'
import { replayHealth } from '../domain/health'
import { createLeafGrowthEvent, selectLeafState, type LeafGrowthEvent } from '../domain/leafGrowth'
import { evaluateLeafRewardEligibility, normalizeLeafRewardConfig, type LeafRewardConfig } from '../domain/leafReward'
import { INITIAL_EARNED_LEAF_COUNT, INITIAL_LEAF_BASELINE_VERSION } from '../domain/initialLeafBaseline'
import { appliedLeafPunishmentLoss, LeafPunishmentDataError, reconcileLeafPunishmentLedger, shiftPunishmentDate, validateLeafPunishmentLedger, type LeafPunishmentLedger } from './leafPunishmentLedger'

import { isCreatureId, type CreatureId } from '../domain/creatures/creatureCatalog'
import { createCreatureCollection, isCreatureCollection, migrateCreatureCollection, sendCreatureHome, showCreatureOnTree, selectCreatureProgress, unlockEarnedCreatures, type CreatureCollection } from '../domain/creatures/creatureCollection'
import { isCreaturePosition, parseCreaturePositions, type CreaturePosition, type CreaturePositions } from '../domain/creatures/creaturePosition'

export const STORAGE_KEY = 'music-tree:mvp:v1'
export const CREATURE_POSITIONS_STORAGE_KEY = 'music-tree:creature-positions:v1'
type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export type PersistedState = {
  version: 1
  creatureCollection: CreatureCollection
  childProfile: ChildProfile
  leafRewardConfig: LeafRewardConfig
  practiceRecords: PracticeRecord[]
  homeworkItems: HomeworkItem[]
  teacherEvaluations: TeacherEvaluation[]
  lessonEvaluations: TeacherLessonEvaluation[]
  completedPieces: CompletedPiece[]
  concerts: ConcertRecord[]
  rewards: FamilyReward[]
  rewardProgress: RewardProgress
  specialFruits: SpecialFruit[]
  treeState: TreeState
  stageEntrySnapshots: StageEntrySnapshot[]
  learningCycles: ProgressionLearningCycle[]
  rewardReminders: RewardReminder[]
  vacationPeriods: VacationPeriod[]
  rootAwards: RootAward[]
  parentRewards: ParentReward[]
  leafGrowthEvents: LeafGrowthEvent[]
  migrationBaseEarnedLeafCount: number
  rewardReminderBaselineLeafCount: number
  initialLeafBaselineVersion?: typeof INITIAL_LEAF_BASELINE_VERSION
  // Missing in older local snapshots; only explicit activation starts the clock.
  leafPunishment?: LeafPunishmentLedger | null
}

const today = () => localCalendarDate()
const now = () => new Date().toISOString()
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T
const makeId = (prefix: string) => `${prefix}_${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}_${Math.random().toString(36).slice(2)}`}`

const practiceRecord = (id: string, date: string, minutes: number, quality: PracticeRecord['quality'], achievements: string[], improvement: PracticeRecord['improvement'], parentNote: string): PracticeRecord => ({ id, childId: 'child_001', date, minutes, quality, achievements, customAchievement: '', improvement, parentNote, createdAt: `${date}T12:00:00.000Z`, updatedAt: `${date}T12:00:00.000Z` })

export const createFreshState = (): PersistedState => {
  const tree = createInitialTreeState()
  return {
    version: 1,
    leafRewardConfig: normalizeLeafRewardConfig(undefined),
    leafPunishment: null,
    creatureCollection: createCreatureCollection(INITIAL_EARNED_LEAF_COUNT),
    childProfile: { id: 'child_001', displayName: 'Lucy', avatarId: 'ice_princess' },
    practiceRecords: [], homeworkItems: [], teacherEvaluations: [], lessonEvaluations: [], completedPieces: [], concerts: [], rewards: clone(defaultRewards),
    rewardProgress: { childId: 'child_001', rewardPracticeDates: [], rewardCompletedPieceIds: [], rewardHighestTeacherEvaluationIds: [], updatedAt: today() },
    specialFruits: [], treeState: tree, stageEntrySnapshots: [], learningCycles: [], rewardReminders: [], vacationPeriods: [], rootAwards: [], parentRewards: [], leafGrowthEvents: [],
    migrationBaseEarnedLeafCount: INITIAL_EARNED_LEAF_COUNT, rewardReminderBaselineLeafCount: INITIAL_EARNED_LEAF_COUNT, initialLeafBaselineVersion: INITIAL_LEAF_BASELINE_VERSION,
  }
}

export const createDemoState = (): PersistedState => {
  const records = [
    practiceRecord('practice_001', '2026-07-28', 15, 'focused', ['assigned_section', 'rhythm_improved'], 'small', 'Steady and musical today.'),
    practiceRecord('practice_002', '2026-07-29', 20, 'focused', ['completed_today_task', 'tried_without_help'], 'clear', 'The phrase sounded more even.'),
    practiceRecord('practice_003', '2026-07-30', 10, 'normal', ['assigned_section'], 'small', 'A little slower today but careful.'),
    practiceRecord('practice_004', '2026-07-31', 25, 'focused', ['played_difficult_section', 'remembered_notes_independently'], 'clear', 'Lovely focus and confidence.'),
    practiceRecord('practice_005', '2026-08-01', 18, 'focused', ['assigned_section'], 'small', 'Nice calm start to the week.'),
    practiceRecord('practice_006', '2026-08-02', 12, 'normal', ['played_whole_piece'], 'clear', 'A cheerful, strong run through the piece.'),
  ]
  const tree = { ...createInitialTreeState(), leafCount: INITIAL_EARNED_LEAF_COUNT, flowerCount: 3, glowLevel: 2, message: 'The tree is glowing with happy practice memories.' }
  return {
    version: 1,
    leafRewardConfig: normalizeLeafRewardConfig(undefined),
    leafPunishment: null,
    creatureCollection: createCreatureCollection(INITIAL_EARNED_LEAF_COUNT),
    childProfile: { id: 'child_001', displayName: 'Lucy', avatarId: 'ice_princess' },
    practiceRecords: records,
    homeworkItems: [
      { id: 'homework_item_001', childId: 'child_001', title: 'Little Snow Waltz', type: 'piece', section: 'Bars 1–16', instruction: 'Practise slowly with steady rhythm', status: 'active', createdAt: '2026-08-01' },
      { id: 'homework_item_002', childId: 'child_001', title: 'C major scale', type: 'scale', instruction: 'Two times with each hand', status: 'active', createdAt: '2026-08-01' },
      { id: 'homework_item_003', childId: 'child_001', title: 'Rhythm exercise', type: 'rhythm', section: 'Page 8', status: 'active', createdAt: '2026-08-01' },
    ],
    teacherEvaluations: [], lessonEvaluations: [], completedPieces: [{ id: 'completed_piece_001', pieceName: 'Little Star', completionDate: '2026-08-02', confirmedBy: 'teacher', note: 'Lovely relaxed playing.' }], concerts: [], rewards: clone(defaultRewards),
    rewardProgress: { childId: 'child_001', rewardPracticeDates: [], rewardCompletedPieceIds: ['completed_piece_001'], rewardHighestTeacherEvaluationIds: [], updatedAt: '2026-08-01' }, specialFruits: [], treeState: tree, stageEntrySnapshots: [], learningCycles: [], rewardReminders: [], vacationPeriods: [], rootAwards: [], parentRewards: [], leafGrowthEvents: [], migrationBaseEarnedLeafCount: tree.leafCount, rewardReminderBaselineLeafCount: tree.leafCount, initialLeafBaselineVersion: INITIAL_LEAF_BASELINE_VERSION,
  }
}

const isObject = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
const isDate = (value: unknown) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
const LEGACY_AVATAR_IDS: Record<string, AvatarId> = {
  'ice-princess': 'ice_princess',
  'snow-sisters': 'warm_winter_princess',
  'friendly-snowman': 'friendly_snow_buddy',
  'rescue-puppy': 'rescue_puppy',
  unicorn: 'rainbow_unicorn',
}
const HOMEWORK_TYPES: HomeworkItemType[] = ['piece', 'scale', 'rhythm', 'technique', 'other']
const LEGACY_DEMO_PRACTICE_IDS = ['practice_001', 'practice_002', 'practice_003', 'practice_004', 'practice_005', 'practice_006']
const LEGACY_DEMO_HOMEWORK_IDS = ['homework_item_001', 'homework_item_002', 'homework_item_003']
const idsEqual = (values: unknown, expected: string[]) => Array.isArray(values) && values.map((item) => isObject(item) ? item.id : undefined).sort().join('|') === [...expected].sort().join('|')
const emptyArray = (value: unknown) => Array.isArray(value) && value.length === 0
const isUntouchedPreviousFresh12 = (value: Record<string, unknown>) => {
  if (value.leafPunishment) return false
  if (value.initialLeafBaselineVersion !== 1 || value.migrationBaseEarnedLeafCount !== 12 || value.rewardReminderBaselineLeafCount !== 12) return false
  if (!isObject(value.treeState) || JSON.stringify(value.treeState) !== JSON.stringify({ ...createInitialTreeState(), leafCount: 12 })) return false
  if (!isObject(value.childProfile) || JSON.stringify(value.childProfile) !== JSON.stringify({ id: 'child_001', displayName: 'Lucy', avatarId: 'ice_princess' })) return false
  if (!Array.isArray(value.rewards) || JSON.stringify(value.rewards) !== JSON.stringify(defaultRewards)) return false
  if (!isObject(value.rewardProgress) || value.rewardProgress.childId !== 'child_001' || !emptyArray(value.rewardProgress.rewardPracticeDates) || !emptyArray(value.rewardProgress.rewardCompletedPieceIds) || !emptyArray(value.rewardProgress.rewardHighestTeacherEvaluationIds)) return false
  return ['practiceRecords', 'homeworkItems', 'teacherEvaluations', 'lessonEvaluations', 'completedPieces', 'concerts', 'specialFruits', 'stageEntrySnapshots', 'learningCycles', 'rewardReminders', 'vacationPeriods', 'rootAwards', 'parentRewards', 'leafGrowthEvents'].every((key) => emptyArray(value[key]))
}
const isUntouchedLegacyDemo29 = (value: Record<string, unknown>) => {
  if (value.leafPunishment) return false
  if (value.initialLeafBaselineVersion !== undefined || !isObject(value.treeState) || value.treeState.leafCount !== 29) return false
  if (value.migrationBaseEarnedLeafCount !== undefined && value.migrationBaseEarnedLeafCount !== 29) return false
  if (value.rewardReminderBaselineLeafCount !== undefined && value.rewardReminderBaselineLeafCount !== 29) return false
  if (!isObject(value.childProfile) || value.childProfile.id !== 'child_001' || value.childProfile.displayName !== 'Lucy') return false
  if (!idsEqual(value.practiceRecords, LEGACY_DEMO_PRACTICE_IDS) || !idsEqual(value.homeworkItems, LEGACY_DEMO_HOMEWORK_IDS) || !idsEqual(value.completedPieces, ['completed_piece_001'])) return false
  return ['teacherEvaluations', 'lessonEvaluations', 'concerts', 'specialFruits', 'stageEntrySnapshots', 'learningCycles', 'rewardReminders', 'vacationPeriods', 'rootAwards', 'parentRewards', 'leafGrowthEvents'].every((key) => emptyArray(value[key]))
}
const withProfileDefaults = (value: unknown): unknown => {
  if (!isObject(value) || !isObject(value.childProfile)) return value
  if (isUntouchedLegacyDemo29(value)) value = { ...value, treeState: { ...(value.treeState as Record<string, unknown>), leafCount: INITIAL_EARNED_LEAF_COUNT }, migrationBaseEarnedLeafCount: INITIAL_EARNED_LEAF_COUNT, rewardReminderBaselineLeafCount: INITIAL_EARNED_LEAF_COUNT, initialLeafBaselineVersion: INITIAL_LEAF_BASELINE_VERSION }
  if (isObject(value) && isUntouchedPreviousFresh12(value)) value = { ...value, treeState: { ...(value.treeState as Record<string, unknown>), leafCount: INITIAL_EARNED_LEAF_COUNT }, migrationBaseEarnedLeafCount: INITIAL_EARNED_LEAF_COUNT, rewardReminderBaselineLeafCount: INITIAL_EARNED_LEAF_COUNT, initialLeafBaselineVersion: INITIAL_LEAF_BASELINE_VERSION }
  if (!isObject(value) || !isObject(value.childProfile)) return value
  const avatarId = isAvatarId(value.childProfile.avatarId)
    ? value.childProfile.avatarId
    : LEGACY_AVATAR_IDS[String(value.childProfile.avatarChoice)] ?? 'ice_princess'
  const homeworkItems = Array.isArray(value.homeworkItems)
    ? value.homeworkItems.map((item) => isObject(item) ? { ...item, type: HOMEWORK_TYPES.includes(item.type as HomeworkItemType) ? item.type : 'other' } : item)
    : value.homeworkItems
  const legacyLeafCount = isObject(value.treeState) && typeof value.treeState.leafCount === 'number' ? value.treeState.leafCount : 0
  const migrationBaseEarnedLeafCount = typeof value.migrationBaseEarnedLeafCount === 'number' ? value.migrationBaseEarnedLeafCount : legacyLeafCount
  return { ...value, leafRewardConfig: normalizeLeafRewardConfig(value.leafRewardConfig), ...(value.creatureCollection === undefined ? {} : { creatureCollection: migrateCreatureCollection(value.creatureCollection) }), childProfile: { id: value.childProfile.id, displayName: value.childProfile.displayName, avatarId }, homeworkItems, rewardReminders: Array.isArray(value.rewardReminders) ? value.rewardReminders : [], vacationPeriods: Array.isArray(value.vacationPeriods) ? value.vacationPeriods : [], rootAwards: Array.isArray(value.rootAwards) ? value.rootAwards : [], parentRewards: Array.isArray(value.parentRewards) ? value.parentRewards : [], leafGrowthEvents: Array.isArray(value.leafGrowthEvents) ? value.leafGrowthEvents : [], migrationBaseEarnedLeafCount, rewardReminderBaselineLeafCount: typeof value.rewardReminderBaselineLeafCount === 'number' ? value.rewardReminderBaselineLeafCount : migrationBaseEarnedLeafCount }
}
type CompatibleState = Omit<PersistedState, 'creatureCollection'> & { creatureCollection?: CreatureCollection }
const permanentLeafCount = (state: CompatibleState) => selectLeafState({
  migrationBaseEarnedLeafCount: state.migrationBaseEarnedLeafCount,
  events: state.leafGrowthEvents,
  childId: state.childProfile.id,
  health: 100,
}).earnedLeafCount
const withCreatureCollection = (state: CompatibleState): PersistedState => ({
  ...state,
  leafPunishment: state.leafPunishment ?? null,
  creatureCollection: state.creatureCollection ?? createCreatureCollection(permanentLeafCount(state)),
})
const isState = (value: unknown): value is CompatibleState => {
  if (isObject(value) && value.creatureCollection !== undefined && !isCreatureCollection(value.creatureCollection)) return false
  if (!isObject(value) || value.version !== 1 || !isObject(value.childProfile) || !isObject(value.treeState)) return false
  normalizeLeafRewardConfig(value.leafRewardConfig)
  const profile = value.childProfile
  if (typeof profile.id !== 'string' || typeof profile.displayName !== 'string' || !isAvatarId(profile.avatarId)) return false
  const arrays = ['practiceRecords', 'homeworkItems', 'teacherEvaluations', 'lessonEvaluations', 'completedPieces', 'concerts', 'rewards', 'specialFruits', 'stageEntrySnapshots', 'learningCycles', 'rewardReminders', 'vacationPeriods', 'rootAwards', 'parentRewards', 'leafGrowthEvents']
  if (!arrays.every((key) => Array.isArray(value[key]))) return false
  validateLeafPunishmentLedger(value.leafPunishment, profile.id, permanentLeafCount(value as unknown as CompatibleState))
  return (value.practiceRecords as unknown[]).every((record) => isObject(record) && typeof record.id === 'string' && typeof record.childId === 'string' && isDate(record.date) && typeof record.minutes === 'number' && ['difficult', 'normal', 'focused'].includes(String(record.quality)) && Array.isArray(record.achievements) && typeof record.createdAt === 'string' && typeof record.updatedAt === 'string')
}

export const parseBackup = (json: string): PersistedState => {
  let parsed: unknown
  try { parsed = JSON.parse(json) } catch { throw new Error('This file is not valid JSON.') }
  parsed = withProfileDefaults(parsed)
  if (!isState(parsed)) throw new Error('This file is not a valid Music Tree MVP backup.')
  return withCreatureCollection(parsed)
}

const csvCell = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`

// Activity date is primary; audit time and ID only break ties within a day.
const comparePracticeRecords = (left: PracticeRecord, right: PracticeRecord) => left.date.localeCompare(right.date) || left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id)

const practiceDates = (records: PracticeRecord[]) => [...new Set(records.filter((record) => record.minutes >= 5 && Boolean(record.quality)).map((record) => record.date))].sort()
export const derivePracticeStats = (records: PracticeRecord[]) => {
  const dates = practiceDates(records)
  let longest = 0; let run = 0; let previous: Date | null = null
  dates.forEach((date) => { const current = new Date(`${date}T00:00:00Z`); run = previous && (current.getTime() - previous.getTime()) === 86_400_000 ? run + 1 : 1; longest = Math.max(longest, run); previous = current })
  let currentStreak = dates.length ? 1 : 0
  for (let index = dates.length - 1; index > 0; index -= 1) { if (new Date(`${dates[index]}T00:00:00Z`).getTime() - new Date(`${dates[index - 1]}T00:00:00Z`).getTime() === 86_400_000) currentStreak += 1; else break }
  return { totalPracticeDays: dates.length, totalPracticeMinutes: records.reduce((sum, record) => sum + Math.max(0, record.minutes), 0), currentPracticeStreak: currentStreak, longestPracticeStreak: longest, lastPracticeDate: dates.at(-1) ?? null }
}

export const createLocalRepository = (storage?: StorageLike, timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone, creatureRandom: () => number = Math.random) => {
  const today = () => localCalendarDate(new Date(), timeZone)
  let storedSnapshot: string | null | undefined
  const validatePracticeInput = (input: Pick<PracticeRecord, 'date' | 'minutes' | 'quality'>) => {
    if (!isCalendarDate(input.date)) throw new Error('Choose a valid practice date.')
    if (input.date > today()) throw new Error('Practice date cannot be in the future. Choose today or an earlier date.')
    if (!Number.isFinite(input.minutes) || input.minutes < 0 || !['normal', 'focused', 'difficult'].includes(input.quality)) throw new Error('Enter a valid practice record.')
  }
  let loadWarning: string | null = null
  const storageUnavailableMessage = 'Browser storage is unavailable. Changes cannot be saved on this device right now.'
  const writeStorage = (key: string, value: string) => {
    if (!storage) return
    try { storage.setItem(key, value); if (key === STORAGE_KEY) storedSnapshot = value }
    catch (error) { loadWarning = storageUnavailableMessage; console.warn(storageUnavailableMessage, error); throw new Error(storageUnavailableMessage, { cause: error }) }
  }
  const load = () => {
    let raw: string | null | undefined
    try { raw = storage?.getItem(STORAGE_KEY); storedSnapshot = raw }
    catch (error) { loadWarning = storageUnavailableMessage; console.warn(storageUnavailableMessage, error); return createFreshState() }
    if (raw === null || raw === undefined) { const defaults = createFreshState(); try { writeStorage(STORAGE_KEY, JSON.stringify(defaults)) } catch { /* warning is exposed through getLoadWarning */ } return defaults }
    try {
      const parsed = withProfileDefaults(JSON.parse(raw))
      if (!isState(parsed)) throw new Error('Saved data failed validation.')
      const migrated = withCreatureCollection(parsed)
      try { writeStorage(STORAGE_KEY, JSON.stringify(migrated)) } catch { /* valid data remains available in memory */ }
      return migrated
    } catch (error) {
      if (error instanceof LeafPunishmentDataError) throw error
      loadWarning = 'Saved Music Tree data could not be loaded. Safe demo data was restored.'
      console.warn(loadWarning, error)
      try { writeStorage(`${STORAGE_KEY}:invalid:${Date.now()}`, raw) } catch (backupError) { console.warn('The invalid saved-data backup could not be written.', backupError) }
      const defaults = createFreshState()
      try { writeStorage(STORAGE_KEY, JSON.stringify(defaults)) } catch { /* warning is exposed through getLoadWarning */ }
      return defaults
    }
  }
  let state = load()
  const loadCreaturePositions = (): CreaturePositions => {
    try {
      const raw = storage?.getItem(CREATURE_POSITIONS_STORAGE_KEY)
      return raw ? parseCreaturePositions(JSON.parse(raw)) : {}
    } catch (error) {
      console.warn('Saved creature positions could not be loaded.', error)
      return {}
    }
  }
  let creaturePositions = loadCreaturePositions()
  const persistenceListeners = new Set<(json: string) => void>()
  const notifyPersistence = (json: string) => {
    for (const listener of persistenceListeners) {
      // A remote save failure must never turn a successful local save into a failure.
      try { listener(json) } catch (error) { console.warn('Music Tree sync listener failed.', error) }
    }
  }
  const persist = () => {
    state.creatureCollection = unlockEarnedCreatures(state.creatureCollection, permanentLeafCount(state), now(), creatureRandom)
    const json = JSON.stringify(state)
    writeStorage(STORAGE_KEY, json)
    notifyPersistence(json)
  }
  const assertPunishmentActivationCompatible = (incoming: PersistedState) => {
    const previous = state.leafPunishment
    if (!previous || incoming.childProfile.id !== state.childProfile.id) return
    const next = incoming.leafPunishment
    if (!next || next.activatedAt !== previous.activatedAt || next.startDate !== previous.startDate || next.timeZone !== previous.timeZone ||
      next.openingEarnedLeafCount !== previous.openingEarnedLeafCount || JSON.stringify(next.openingAwardDates) !== JSON.stringify(previous.openingAwardDates)) {
      throw new LeafPunishmentDataError('This snapshot would replace the existing leaf punishment activation. Export both copies and resolve the snapshot conflict explicitly.')
    }
  }
  const commitLeafPunishment = (ledger: LeafPunishmentLedger) => {
    // Compare the complete local snapshot before writing; do not overwrite a
    // sequential stale-tab update. localStorage itself provides no atomic CAS.
    if (storage && storage.getItem(STORAGE_KEY) !== storedSnapshot) throw new Error('Music Tree changed in another tab. Reload before reconciling leaf punishment.')
    if (JSON.stringify(state.leafPunishment) === JSON.stringify(ledger)) return clone(ledger)
    validateLeafPunishmentLedger(ledger, state.childProfile.id, permanentLeafCount(state))
    const next = { ...state, leafPunishment: ledger }
    const json = JSON.stringify(next)
    // Commit in memory and notify sync only after the single local write succeeds.
    // Deliberately bypass persist(): punishment must not unlock creatures.
    writeStorage(STORAGE_KEY, json)
    state = next
    notifyPersistence(json)
    return clone(ledger)
  }
  const reconcileCurrentLeafPunishment = () => {
    if (!state.leafPunishment) throw new Error('Activate leaf punishment before reconciling it.')
    const reconciledAt = now()
    return reconcileLeafPunishmentLedger({ ledger: state.leafPunishment,
      currentDate: localCalendarDate(reconciledAt, state.leafPunishment.timeZone), reconciledAt,
      practiceRecords: state.practiceRecords, vacationPeriods: state.vacationPeriods, leafGrowthEvents: state.leafGrowthEvents })
  }
  const savePracticeChanges = <T,>(change: () => T): T => {
    const previous = state
    state = clone(state)
    try {
      const result = change()
      if (state.leafPunishment) {
        if (storage && storage.getItem(STORAGE_KEY) !== storedSnapshot) throw new Error('Music Tree changed in another tab. Reload before reconciling leaf punishment.')
        state.leafPunishment = reconcileCurrentLeafPunishment()
        validateLeafPunishmentLedger(state.leafPunishment, state.childProfile.id, permanentLeafCount(state))
      }
      // Save the practice and its corrected schedule together. No intermediate
      // snapshot or separate refund; a failed write leaves both unchanged.
      persist()
      return result
    } catch (error) {
      state = previous
      throw error
    }
  }
  const saveCreatureVisit = (collection: CreatureCollection) => {
    const previous = state.creatureCollection
    state.creatureCollection = collection
    try { persist() }
    catch (error) { state.creatureCollection = previous; throw error }
    return clone(state.creatureCollection)
  }
  const progressionInput = (): StageProgressionInput => { const currentStage = Math.min(4, Math.max(1, state.treeState.stage)) as 1 | 2 | 3 | 4; const entry = [...state.stageEntrySnapshots].reverse().find((snapshot) => snapshot.newStage === currentStage)?.stageEntryDate ?? practiceDates(state.practiceRecords)[0] ?? today(); return { currentStage, stageEntryDate: entry, currentDate: today(), practiceRecords: state.practiceRecords.map((record) => ({ ...record, valid: true, saved: true })), learningCycles: state.learningCycles, lessonEvaluations: state.lessonEvaluations, completedPieces: state.completedPieces, concertRecords: state.concerts, vacationPeriods: state.vacationPeriods } }
  const applyProgression = () => { const input = progressionInput(); const result = evaluateStageProgression(input); const snapshot = createStageEntrySnapshot(result, input, state.stageEntrySnapshots, makeId('stage_entry')); if (snapshot) { state.stageEntrySnapshots.push(snapshot); state.treeState.stage = Math.max(state.treeState.stage, snapshot.newStage) } return { result, snapshot } }
  const syncStats = () => { Object.assign(state.treeState, derivePracticeStats(state.practiceRecords)) }
  const currentHealth = (date = today()) => replayHealth({ practiceRecords: state.practiceRecords, lessonEvaluations: state.lessonEvaluations, currentDate: date, vacationPeriods: state.vacationPeriods }).currentHealth
  const currentLeafState = (date = today()) => selectLeafState({ migrationBaseEarnedLeafCount: state.migrationBaseEarnedLeafCount, events: state.leafGrowthEvents, childId: state.childProfile.id, health: currentHealth(date), appliedPunishmentLoss: appliedLeafPunishmentLoss(state.leafPunishment) })
  const syncLeafCount = () => { state.treeState.leafCount = currentLeafState().earnedLeafCount }
  const syncRewardReminders = () => { syncLeafCount() }
  const createEligibleLeaf = (date: string) => { const childId = state.childProfile.id; const daily = selectDailyPractice(state.practiceRecords, childId, date); const eligibility = evaluateLeafRewardEligibility({ records: state.practiceRecords, childId, date, config: state.leafRewardConfig, existingEvents: state.leafGrowthEvents }); const before = currentLeafState(date); const event = createLeafGrowthEvent({ childId, date, eligible: eligibility.eligible, water: daily.water, health: currentHealth(date), existingEvents: state.leafGrowthEvents, createdAt: now() }); if (!event) return null; state.leafGrowthEvents.push(event); const after = currentLeafState(date); state.treeState.leafCount = after.earnedLeafCount; state.rewardReminders = ensureCrossedRewardReminders(state.rewardReminders, childId, before.earnedLeafCount, after.earnedLeafCount, event.createdAt, state.rewardReminderBaselineLeafCount); return event }
  syncStats()
  syncLeafCount()

  return {
    reload: () => {
      if (state.leafPunishment) {
        const raw = storage?.getItem(STORAGE_KEY)
        if (!raw) throw new LeafPunishmentDataError('The saved leaf punishment activation is missing. Export the current copy before resolving this conflict.')
        assertPunishmentActivationCompatible(parseBackup(raw))
      }
      state = load(); creaturePositions = loadCreaturePositions(); syncStats(); syncLeafCount()
    }, resetDemoData: () => { state = createDemoState(); creaturePositions = {}; storage?.removeItem(CREATURE_POSITIONS_STORAGE_KEY); syncStats(); syncLeafCount(); persist() }, clearStoredData: () => { storage?.removeItem(STORAGE_KEY); storage?.removeItem(CREATURE_POSITIONS_STORAGE_KEY); state = createFreshState(); creaturePositions = {}; persist() }, getLoadWarning: () => loadWarning,
    // Explicit opt-in: migration and read selectors never start the clock.
    activateLeafPunishment: () => {
      if (state.leafPunishment) return commitLeafPunishment(state.leafPunishment)
      const activatedAt = now()
      return commitLeafPunishment({ version: 1, childId: state.childProfile.id, activatedAt,
        startDate: shiftPunishmentDate(localCalendarDate(activatedAt, timeZone), 1), timeZone,
        openingEarnedLeafCount: permanentLeafCount(state),
        openingAwardDates: [...new Set(state.leafGrowthEvents.filter((event) => event.childId === state.childProfile.id).map((event) => event.date))].sort(),
        evaluatedThrough: null, events: [] })
    },
    reconcileLeafPunishment: () => commitLeafPunishment(reconcileCurrentLeafPunishment()),
    getLeafPunishmentLedger: () => clone(state.leafPunishment ?? null),
    getLeafPunishmentBalance: () => {
      const earnedLeafCount = permanentLeafCount(state)
      const appliedLoss = appliedLeafPunishmentLoss(state.leafPunishment)
      return { earnedLeafCount, appliedLoss, availableLeafCount: Math.max(0, earnedLeafCount - appliedLoss) }
    },
    subscribeToPersistence: (listener: (json: string) => void) => { persistenceListeners.add(listener); return () => { persistenceListeners.delete(listener) } },
    // Hydrate an already validated complete snapshot without emitting a local mutation.
    loadSnapshot: (json: string) => { const validated = parseBackup(json); assertPunishmentActivationCompatible(validated); const snapshot = { ...JSON.parse(json), leafRewardConfig: validated.leafRewardConfig, creatureCollection: validated.creatureCollection, leafPunishment: validated.leafPunishment } as PersistedState; writeStorage(STORAGE_KEY, JSON.stringify(snapshot)); state = snapshot; loadWarning = null },
    getLeafRewardConfig: () => clone(state.leafRewardConfig),
    updateLeafRewardConfig: (values: Partial<LeafRewardConfig>) => {
      const config = normalizeLeafRewardConfig({ ...state.leafRewardConfig, ...values })
      const next = { ...state, leafRewardConfig: config }
      const json = JSON.stringify(next)
      // A settings save cannot award, revoke, reconcile, or unlock anything.
      writeStorage(STORAGE_KEY, json)
      state = next
      notifyPersistence(json)
      return clone(config)
    },
    exportBackupJson: () => JSON.stringify(state, null, 2),
    exportPracticeCsv: () => ['date,minutes,quality,achievements,improvement,parent note', ...[...state.practiceRecords].sort(comparePracticeRecords).map((record) => [record.date, record.minutes, record.quality, record.achievements.join('; '), record.improvement, record.parentNote].map(csvCell).join(','))].join('\r\n'),
    validateBackupJson: (json: string) => { parseBackup(json); return true },
    restoreBackupJson: (json: string) => { const restored = clone(parseBackup(json)); assertPunishmentActivationCompatible(restored); const previous = state; state = restored; try { syncStats(); syncRewardReminders(); persist() } catch (error) { state = previous; throw error }; loadWarning = null; return clone(state) },
    sendCreatureHome: (id: CreatureId) => saveCreatureVisit(sendCreatureHome(state.creatureCollection, id)),
    showCreatureOnTree: (id: CreatureId) => saveCreatureVisit(showCreatureOnTree(state.creatureCollection, id)),
    saveCreaturePosition: (id: CreatureId, position: CreaturePosition) => {
      if (!isCreatureId(id) || !isCreaturePosition(position)) throw new Error('Choose a valid position inside the Music Tree scene.')
      const next = { ...creaturePositions, [id]: position }
      writeStorage(CREATURE_POSITIONS_STORAGE_KEY, JSON.stringify(next))
      creaturePositions = next
      return clone(position)
    },
    getCreaturePositions: () => clone(creaturePositions),
    getCreatureCollection: () => clone(state.creatureCollection),
    getCreatureProgress: () => selectCreatureProgress(state.creatureCollection, permanentLeafCount(state)),
    getChildProfile: () => clone(state.childProfile), getPracticeRecords: () => clone(state.practiceRecords).sort((left, right) => comparePracticeRecords(right, left)), getTreeState: () => clone(state.treeState), getHomeworkItems: () => clone(state.homeworkItems), getTeacherEvaluations: () => clone(state.teacherEvaluations), getLessonEvaluations: () => clone(state.lessonEvaluations), getCompletedPieces: () => clone(state.completedPieces), getConcerts: () => clone(state.concerts), getRewards: () => clone(state.rewards), getRewardProgress: () => clone(state.rewardProgress), getSpecialFruits: () => clone(state.specialFruits), getStageEntrySnapshots: () => clone(state.stageEntrySnapshots), getLearningCycles: () => clone(state.learningCycles), getRewardReminders: () => clone(state.rewardReminders), getVacationPeriods: () => clone(state.vacationPeriods), getRootAwards: () => clone(state.rootAwards), getParentRewards: () => clone(state.parentRewards), getLeafGrowthEvents: () => clone(state.leafGrowthEvents), getLeafState: (date = today()) => clone(currentLeafState(date)), getDailyWater: (date = today(), childId = state.childProfile.id) => selectDailyWater(state.practiceRecords, childId, date), getCurrentHealth: (date = today()) => currentHealth(date), getHealthReplay: (date = today()) => clone(replayHealth({ practiceRecords: state.practiceRecords, lessonEvaluations: state.lessonEvaluations, currentDate: date, vacationPeriods: state.vacationPeriods })), getCurrentStageProgression: () => clone(evaluateStageProgression(progressionInput())),
    grantParentReward: (title: string, fruitType: RewardFruitType) => { const trimmedTitle = title.trim(); if (!trimmedTitle) throw new Error('Enter reward content.'); if (!isRewardFruitType(fruitType)) throw new Error('Choose a supported reward fruit.'); const reward: ParentReward = { id: makeId('parent_reward'), childId: state.childProfile.id, title: trimmedTitle, fruitType, status: 'available', grantedAt: now(), fruitSlotId: selectRewardFruitSlot(state.parentRewards) }; state.parentRewards.unshift(reward); persist(); return clone(reward) },
    claimParentReward: (id: string) => { const reward = state.parentRewards.find((item) => item.id === id); if (!reward) return null; if (reward.status === 'available') { reward.status = 'claimed'; reward.claimedAt = now(); persist() } return clone(reward) },
    handleRewardReminder: (id: string, status: Extract<RewardReminderStatus, 'granted' | 'skipped'>) => { const reminder = state.rewardReminders.find((item) => item.id === id); if (!reminder) return null; if (reminder.status === 'pending') { reminder.status = status; reminder.handledAt = now(); persist() } return clone(reminder) },
    addVacationPeriod: (values: Pick<VacationPeriod, 'startDate' | 'endDate' | 'note'>) => { const error = validateVacationPeriod(values.startDate, values.endDate); if (error) throw new Error(error); if (state.vacationPeriods.some((period) => !period.cancelledAt && period.startDate === values.startDate && period.endDate === values.endDate)) throw new Error('This Urlaub period has already been saved.'); const period: VacationPeriod = { id: makeId('vacation'), childId: state.childProfile.id, startDate: values.startDate, endDate: values.endDate, note: values.note?.trim() || undefined, createdAt: now() }; state.vacationPeriods.push(period); applyProgression(); persist(); return clone(period) },
    updateVacationPeriod: (id: string, values: Pick<VacationPeriod, 'startDate' | 'endDate' | 'note'>) => { const period = state.vacationPeriods.find((item) => item.id === id); if (!period) throw new Error('Urlaub period not found.'); if (vacationStatus(period, today()) !== 'scheduled') throw new Error('Only a scheduled Urlaub period can be edited.'); const error = validateVacationPeriod(values.startDate, values.endDate); if (error) throw new Error(error); if (state.vacationPeriods.some((item) => item.id !== id && !item.cancelledAt && item.startDate === values.startDate && item.endDate === values.endDate)) throw new Error('This Urlaub period has already been saved.'); Object.assign(period, { startDate: values.startDate, endDate: values.endDate, note: values.note?.trim() || undefined }); applyProgression(); persist(); return clone(period) },
    cancelVacationPeriod: (id: string) => { const period = state.vacationPeriods.find((item) => item.id === id); if (!period) return null; if (vacationStatus(period, today()) !== 'scheduled') throw new Error('Only a future Urlaub period can be cancelled.'); period.cancelledAt = now(); applyProgression(); persist(); return clone(period) },
    endVacationPeriodEarly: (id: string) => { const period = state.vacationPeriods.find((item) => item.id === id); if (!period) return null; if (vacationStatus(period, today()) !== 'active') throw new Error('Only an active Urlaub period can be ended early.'); period.endedEarlyAt = now(); applyProgression(); persist(); return clone(period) },
    updateChildProfile: (values: Pick<ChildProfile, 'displayName' | 'avatarId'>) => { if (!values.displayName.trim()) throw new Error('Enter the child’s display name.'); if (!isAvatarId(values.avatarId)) throw new Error('Choose a valid avatar.'); state.childProfile = { ...state.childProfile, displayName: values.displayName.trim(), avatarId: values.avatarId }; persist(); return clone(state.childProfile) },
    recalculateTreeStateFromHistory: () => { const permanentRoot = state.treeState.rootStrength; const legacyHealth = state.treeState.treeHealth; const legacyWater = state.treeState.waterBalance; let rebuilt = createInitialTreeState(); [...state.practiceRecords].sort(comparePracticeRecords).forEach((record) => { rebuilt = calculatePracticeGrowth(rebuilt, record).updatedState }); rebuilt.stage = Math.max(1, ...state.stageEntrySnapshots.map((snapshot) => snapshot.permanentStage)); rebuilt.rootStrength = Math.max(permanentRoot, createInitialTreeState().rootStrength + totalRootAwardPoints(state.rootAwards)); rebuilt.treeHealth = legacyHealth; rebuilt.waterBalance = legacyWater; rebuilt.completedPieces = state.completedPieces.map((piece) => piece.id); rebuilt.fruitCount = state.completedPieces.length; state.treeState = rebuilt; syncStats(); syncRewardReminders(); persist(); return clone(state.treeState) },
    getCurrentHomework: (): HomeworkAssignment => ({ id: 'legacy_homework', childId: state.childProfile.id, pieceName: state.homeworkItems[0]?.title ?? '', section: state.homeworkItems[0]?.section ?? '', focus: '', instruction: state.homeworkItems[0]?.instruction ?? '', recommendedPracticeDays: 4, status: 'active', assignedAt: state.homeworkItems[0]?.createdAt ?? today() }),
    savePracticeRecord: (input: Omit<PracticeRecord, 'id' | 'childId' | 'createdAt' | 'updatedAt'>) => savePracticeChanges(() => { validatePracticeInput(input); if (countDailyPracticeRecords(state.practiceRecords, state.childProfile.id, input.date) >= MAX_DAILY_PRACTICE_RECORDS) throw new Error(input.date === today() ? 'Today already has three practice moments saved. Your music is safely recorded for the day.' : 'That day already has three practice moments saved. Your music is safely recorded for the day.'); const fingerprint = JSON.stringify([input.date, input.minutes, input.quality, input.achievements, input.improvement, input.parentNote]); if (state.practiceRecords.some((record) => JSON.stringify([record.date, record.minutes, record.quality, record.achievements, record.improvement, record.parentNote]) === fingerprint)) throw new Error('This practice entry has already been saved.'); const stamp = now(); const record: PracticeRecord = { ...input, id: makeId('practice'), childId: state.childProfile.id, createdAt: stamp, updatedAt: stamp }; const legacyWater = state.treeState.waterBalance; const waterBefore = selectDailyWater(state.practiceRecords, record.childId, record.date); const waterAfter = selectDailyWater([...state.practiceRecords, record], record.childId, record.date); const growth = calculatePracticeGrowth(state.treeState, record, Math.max(0, waterAfter - waterBefore)); state.practiceRecords.unshift(record); state.treeState = { ...growth.updatedState, waterBalance: legacyWater }; syncStats(); applyProgression(); const earnedLeaf = createEligibleLeaf(input.date); if (earnedLeaf) growth.message = 'A new permanent leaf was earned for ' + input.date + '.'; state.treeState.message = growth.message; syncRewardReminders(); return { record: clone(record), treeState: clone(state.treeState), dailyWater: selectDailyWater(state.practiceRecords, state.childProfile.id, input.date), message: growth.message } }),
    addPracticeRecord: (record: PracticeRecord) => savePracticeChanges(() => { validatePracticeInput(record); if (state.practiceRecords.some((item) => item.id === record.id)) throw new Error('This practice entry has already been saved.'); if (countDailyPracticeRecords(state.practiceRecords, record.childId, record.date) >= MAX_DAILY_PRACTICE_RECORDS) throw new Error('That day already has three practice moments saved.'); state.practiceRecords.unshift(clone(record)); syncStats(); applyProgression(); if (record.childId === state.childProfile.id) createEligibleLeaf(record.date); syncLeafCount(); return clone(record) }),
    updatePracticeRecord: (id: string, input: Omit<PracticeRecord, 'id' | 'childId' | 'createdAt' | 'updatedAt'>) => savePracticeChanges(() => { const record = state.practiceRecords.find((item) => item.id === id); if (!record) throw new Error('Practice record not found.'); validatePracticeInput(input); if (countDailyPracticeRecords(state.practiceRecords, record.childId, input.date, id) >= MAX_DAILY_PRACTICE_RECORDS) throw new Error('That day already has three practice moments saved.'); const previousDate = record.date; if (input.date !== previousDate && state.leafGrowthEvents.some((event) => event.childId === record.childId && event.date === previousDate)) throw new Error('This activity date has already earned a permanent leaf. You can edit the practice details, but cannot move its date.'); Object.assign(record, input, { id: record.id, childId: record.childId, createdAt: record.createdAt, updatedAt: now() }); syncStats(); applyProgression(); if (record.childId === state.childProfile.id) { createEligibleLeaf(input.date); if (previousDate !== input.date) createEligibleLeaf(previousDate) }; syncLeafCount(); return clone(record) }),
    saveTreeState: (treeState: TreeState) => { state.treeState = clone(treeState); syncStats(); syncRewardReminders(); persist(); return clone(state.treeState) },
    addHomeworkItem: (values: Pick<HomeworkItem, 'title' | 'section' | 'instruction'> & { type?: HomeworkItemType }) => { const error = validateHomeworkItem(values); if (error) throw new Error(error); const item: HomeworkItem = { id: makeId('homework_item'), childId: state.childProfile.id, title: values.title.trim(), type: values.type ?? 'other', section: values.section?.trim() || undefined, instruction: values.instruction?.trim() || undefined, status: 'active', createdAt: today() }; state.homeworkItems.push(item); persist(); return clone(item) },
    updateHomeworkItem: (id: string, values: Pick<HomeworkItem, 'title' | 'section' | 'instruction'> & { type?: HomeworkItemType }) => { const error = validateHomeworkItem(values); if (error) throw new Error(error); const item = state.homeworkItems.find((value) => value.id === id); if (!item || item.status !== 'active') throw new Error('Only active homework can be edited.'); Object.assign(item, { title: values.title.trim(), type: values.type ?? item.type, section: values.section?.trim() || undefined, instruction: values.instruction?.trim() || undefined }); persist(); return clone(item) },
    canRemoveHomeworkItem: (id: string) => { const item = state.homeworkItems.find((value) => value.id === id); if (!item || item.status !== 'active') return false; return !state.lessonEvaluations.some((evaluation) => evaluation.itemEvaluations.some((result) => result.homeworkItemId === id)) && !state.learningCycles.some((cycle) => cycle.homeworkItemIds.includes(id) || cycle.completedHomeworkItemIds.includes(id) || cycle.unfinishedHomeworkItemIds.includes(id)) && !state.completedPieces.some((piece) => piece.homeworkItemId === id) },
    removeHomeworkItem: (id: string): { status: 'deleted' | 'blocked_historical_reference' | 'not_found' } => { const item = state.homeworkItems.find((value) => value.id === id); if (!item) return { status: 'not_found' }; const referenced = state.lessonEvaluations.some((evaluation) => evaluation.itemEvaluations.some((result) => result.homeworkItemId === id)) || state.learningCycles.some((cycle) => cycle.homeworkItemIds.includes(id) || cycle.completedHomeworkItemIds.includes(id) || cycle.unfinishedHomeworkItemIds.includes(id)) || state.completedPieces.some((piece) => piece.homeworkItemId === id); if (item.status !== 'active' || referenced) return { status: 'blocked_historical_reference' }; state.homeworkItems = state.homeworkItems.filter((value) => value.id !== id); persist(); return { status: 'deleted' } },
    saveLessonEvaluation: (items: HomeworkItemEvaluation[]) => { const active = state.homeworkItems.filter((item) => item.status === 'active'); const date = today(); if (state.lessonEvaluations.some((item) => item.childId === state.childProfile.id && item.lessonDate === date)) throw new Error('This lesson evaluation has already been saved.'); const stamp = now(); const evaluation = createLessonEvaluation({ childId: state.childProfile.id, activeItems: active, itemEvaluations: items, now: stamp, lessonDate: date, id: makeId('lesson_evaluation') }); const completed = new Set(items.filter((item) => item.completed).map((item) => item.homeworkItemId)); let newlyCompletedPieceCount = 0; active.forEach((item) => { if (completed.has(item.id)) { item.status = 'completed'; item.completedAt = date; if (item.type === 'piece' && !state.completedPieces.some((piece) => piece.homeworkItemId === item.id)) { state.completedPieces.push({ id: `completed_piece_${item.id}`, pieceName: item.title, completionDate: date, confirmedBy: 'teacher', homeworkItemId: item.id, lessonEvaluationId: evaluation.id }); newlyCompletedPieceCount += 1 } } }); const start = active.map((item) => item.createdAt).sort()[0] ?? date; const practiceRecordIds = state.practiceRecords.filter((record) => record.date >= start && record.date <= date && record.minutes >= 5 && Boolean(record.quality)).map((record) => record.id); state.lessonEvaluations.unshift(evaluation); const completedCycle = active.length > 0 && practiceRecordIds.length > 0; if (completedCycle && !state.learningCycles.some((cycle) => cycle.teacherLessonEvaluationId === evaluation.id)) state.learningCycles.unshift({ id: `cycle_${evaluation.id}`, childId: state.childProfile.id, startedAt: start, completedAt: date, homeworkItemIds: active.map((item) => item.id), practiceRecordIds, teacherLessonEvaluationId: evaluation.id, completedHomeworkItemIds: items.filter((item) => item.completed).map((item) => item.homeworkItemId), unfinishedHomeworkItemIds: items.filter((item) => !item.completed).map((item) => item.homeworkItemId), status: 'completed' }); const rootAward = calculateLessonRootAward({ lessonEvaluationId: evaluation.id, completedCycle, newlyCompletedPieceCount, improvements: items.map((item) => item.improvement), createdAt: date }); if (!state.rootAwards.some((award) => award.lessonEvaluationId === evaluation.id)) { state.rootAwards.push(rootAward); state.treeState.rootStrength += rootAward.points } state.treeState.completedPieces = state.completedPieces.map((piece) => piece.id); state.treeState.fruitCount = state.completedPieces.length; applyProgression(); createEligibleLeaf(date); syncLeafCount(); persist(); return clone(evaluation) },
    addTeacherEvaluation: (value: TeacherEvaluation) => { state.teacherEvaluations.unshift(clone(value)); persist(); return clone(value) }, saveCompletedPieces: (values: CompletedPiece[]) => { state.completedPieces = clone(values); state.treeState.completedPieces = values.map((piece) => piece.id); state.treeState.fruitCount = values.length; applyProgression(); persist(); return clone(values) }, saveConcerts: (values: ConcertRecord[]) => { state.concerts = clone(values); applyProgression(); persist(); return clone(values) }, saveRewards: (values: FamilyReward[]) => { state.rewards = clone(values); persist(); return clone(values) }, saveRewardProgress: (value: RewardProgress) => { state.rewardProgress = clone(value); persist(); return clone(value) }, saveSpecialFruits: (values: SpecialFruit[]) => { state.specialFruits = clone(values); persist(); return clone(values) }, applyStageProgression: (input: StageProgressionInput) => { const result = evaluateStageProgression(input); const snapshot = createStageEntrySnapshot(result, input, state.stageEntrySnapshots, makeId('stage_entry')); if (snapshot) { state.stageEntrySnapshots.push(snapshot); state.treeState.stage = Math.max(state.treeState.stage, snapshot.newStage); persist() } return { result, snapshot } }, applyCurrentStageProgression: () => { const result = applyProgression(); persist(); return result },
  }
}

const browserStorage = typeof window !== 'undefined' ? window.localStorage : undefined
export const localRepository = createLocalRepository(browserStorage)
