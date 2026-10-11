import type { GrowthEngineResult, PracticeRecord, TreeState } from './types'
import { INITIAL_EARNED_LEAF_COUNT } from './initialLeafBaseline'
import { calculatePracticeWater } from './water'

export const createInitialTreeState = (): TreeState => ({
  treeHealth: 75,
  growthLevel: 2,
  waterBalance: 0,
  rootStrength: 3,
  leafCount: INITIAL_EARNED_LEAF_COUNT,
  flowerCount: 2,
  fruitCount: 0,
  branchLevel: 2,
  glowLevel: 1,
  currentInactivityDays: 0,
  creatureState: 'hidden',
  recoveryState: 'stable',
  unlockedDecorations: ['moon-glow'],
  unlockedCreatures: [],
  completedPieces: [],
  totalPracticeDays: 0,
  totalPracticeMinutes: 0,
  currentPracticeStreak: 0,
  longestPracticeStreak: 0,
  lastPracticeDate: null,
  lastTeacherEvaluationDate: null,
  stage: 1,
  message: 'Your Music Tree is glowing softly tonight.',
})

export const calculatePracticeGrowth = (
  currentState: TreeState,
  practice: PracticeRecord,
  waterAmount = calculatePracticeWater(practice),
): GrowthEngineResult => {
  const effectiveMinutes = Math.min(Math.max(practice.minutes, 0), 120)
  const achievementLeaves = 0
  const improvementFlowerBoost = {
    none: 0,
    small: 0,
    clear: 1,
    breakthrough: 2,
  }[practice.improvement]

  const nextState: TreeState = {
    ...currentState,
    // Legacy backup field only; authoritative Water is selected by activity date.
    waterBalance: currentState.waterBalance,
    rootStrength: currentState.rootStrength,
    leafCount: Math.max(currentState.leafCount + achievementLeaves, 12),
    flowerCount: currentState.flowerCount + (improvementFlowerBoost > 0 ? 1 : 0),
    glowLevel: Math.min(currentState.glowLevel + (waterAmount > 0 ? 1 : 0), 5),
    totalPracticeDays: currentState.totalPracticeDays + 1,
    totalPracticeMinutes: currentState.totalPracticeMinutes + effectiveMinutes,
    currentPracticeStreak: currentState.currentPracticeStreak + 1,
    longestPracticeStreak: Math.max(currentState.longestPracticeStreak, currentState.currentPracticeStreak + 1),
    lastPracticeDate: practice.date,
    currentInactivityDays: 0,
    creatureState: 'hidden',
    recoveryState: 'recovering',
    treeHealth: currentState.treeHealth,
    growthLevel: Math.max(currentState.growthLevel, Math.min(4, 1 + Math.floor((currentState.totalPracticeMinutes + effectiveMinutes) / 45))),
    stage: currentState.stage,
  }

  const changes = [] as GrowthEngineResult['changes']
  if (waterAmount > 0) {
    changes.push({ type: 'water', amount: waterAmount, label: 'water' })
  }
  if (achievementLeaves > 0) {
    changes.push({ type: 'leaf', amount: achievementLeaves, label: 'new leaves' })
  }
  if (improvementFlowerBoost > 0) {
    changes.push({ type: 'flower', amount: 1, label: 'crystal flower' })
  }

  let message = 'Your practice was saved.'
  if (waterAmount > 0 && achievementLeaves > 0) {
    message = 'Your music gave the tree two water drops. A new crystal leaf appeared.'
  } else if (waterAmount > 0) {
    message = 'Your music gave the tree some gentle water and a bright sparkle.'
  } else if (achievementLeaves > 0) {
    message = 'A fresh leaf shimmered into place.'
  } else if (improvementFlowerBoost > 0) {
    message = 'Your careful practice helped a crystal flower bloom.'
  }

  return { updatedState: nextState, changes, message }
}
