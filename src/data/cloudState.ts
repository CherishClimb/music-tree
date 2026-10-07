import { createFreshState, parseBackup, type PersistedState } from './localRepository'
import { isAvatarId } from '../domain/avatarOptions'
import { TREE_STAGE_BLUEPRINTS } from '../domain/treeStageBlueprints'

// Structural checks supplement the existing backup validator for data received from
// another device. These describe JSON shapes only; growth rules stay in the engines.
const recordTemplates = {
  practiceRecords: [{ id: '', childId: '', date: '', minutes: 0, quality: '', achievements: [''], createdAt: '', updatedAt: '' }],
  homeworkItems: [{ id: '', childId: '', title: '', type: '', status: '', createdAt: '' }],
  teacherEvaluations: [{ id: '', childId: '', homeworkId: '', score: 0, improvement: '', teacherComment: '', completedPiece: false, completedPieceName: '', createdAt: '' }],
  lessonEvaluations: [{ id: '', childId: '', lessonDate: '', createdAt: '', itemEvaluations: [{ homeworkItemId: '', score: 0, improvement: '', completed: false }] }],
  completedPieces: [{ id: '', pieceName: '', completionDate: '', confirmedBy: '' }],
  concerts: [{ id: '', childId: '', name: '', date: '', pieceName: '', createdAt: '' }],
  rewards: [{ id: '', name: '', active: false, createdAt: '', updatedAt: '' }],
  specialFruits: [{ id: '', childId: '', unlockReason: '', sourceEventIds: [''], status: '', unlockedAt: '' }],
  stageEntrySnapshots: [{ id: '', previousStage: 0, newStage: 0, stageEntryDate: '', qualifyingEventIds: [''], cumulativeTotals: { practiceDays: 0, learningCycles: 0, completedPieces: 0 }, stageCounters: {}, permanentStage: 0 }],
  learningCycles: [{ id: '', childId: '', startedAt: '', completedAt: '', homeworkItemIds: [''], practiceRecordIds: [''], teacherLessonEvaluationId: '', completedHomeworkItemIds: [''], unfinishedHomeworkItemIds: [''], status: '' }],
  rewardReminders: [{ id: '', childId: '', leafMilestone: 0, status: '', createdAt: '' }],
  vacationPeriods: [{ id: '', childId: '', startDate: '', endDate: '', createdAt: '' }],
  rootAwards: [{ lessonEvaluationId: '', completedCycle: false, completedPieceCategory: false, bigImprovement: false, points: 0, createdAt: '' }],
  parentRewards: [{ id: '', childId: '', title: '', fruitType: '', status: '', grantedAt: '', fruitSlotId: '' }],
  leafGrowthEvents: [{ id: '', childId: '', date: '', sourceWater: 0, sourceHealth: 0, createdAt: '' }],
}
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']'
  if (value !== null && typeof value === 'object') {
    const object = value as Record<string, unknown>
    return '{' + Object.keys(object).sort().map((key) => JSON.stringify(key) + ':' + canonicalJson(object[key])).join(',') + '}'
  }
  return JSON.stringify(value)
}

// Reuse backup validation without replacing the input with its normalized result.
// Cloud snapshots retain every field, including fields unknown to this client.
export function validateCloudState(value: unknown): PersistedState {
  const json = JSON.stringify(value)
  parseBackup(json)
  const object = value as Record<string, unknown>
  const fresh = createFreshState()
  function checkShape(actual: unknown, template: unknown): boolean {
    if (template === null) return actual === null || typeof actual === 'string'
    if (Array.isArray(template)) return Array.isArray(actual) && (!template.length || actual.every((item) => checkShape(item, template[0])))
    if (typeof template === 'object') {
      if (!actual || typeof actual !== 'object' || Array.isArray(actual)) return false
      return Object.entries(template as Record<string, unknown>).every(([key, item]) =>
        checkShape((actual as Record<string, unknown>)[key], item))
    }
    return typeof actual === typeof template && (typeof actual !== 'number' || Number.isFinite(actual))
  }
  const { initialLeafBaselineVersion: _baseline, ...required } = fresh
  // This optional migration marker is metadata, not a reason to reject an older snapshot.
  void _baseline
  const template = {
    ...required, ...recordTemplates,
    treeState: { ...required.treeState, unlockedDecorations: [''], unlockedCreatures: [''], completedPieces: [''] },
    rewardProgress: { ...required.rewardProgress, rewardPracticeDates: [''], rewardCompletedPieceIds: [''], rewardHighestTeacherEvaluationIds: [''] },
  }
  if (!checkShape(object, template) || !isAvatarId((value as PersistedState).childProfile.avatarId) ||
    !Object.hasOwn(TREE_STAGE_BLUEPRINTS, (value as PersistedState).treeState.stage)) {
    throw new Error('The cloud Music Tree is not a complete, valid backup. Your local copy has been kept.')
  }
  return JSON.parse(json) as PersistedState
}

export function isMeaningfulLocalState(state: PersistedState): boolean {
  function comparable(value: PersistedState) {
    const copy = JSON.parse(JSON.stringify(value)) as PersistedState
    // These dates record when defaults were generated, not user activity.
    delete (copy.rewardProgress as Partial<PersistedState['rewardProgress']>).updatedAt
    for (const reward of copy.rewards) {
      delete (reward as Partial<typeof reward>).createdAt
      delete (reward as Partial<typeof reward>).updatedAt
    }
    delete copy.initialLeafBaselineVersion
    return copy
  }
  return canonicalJson(comparable(state)) !== canonicalJson(comparable(createFreshState()))
}