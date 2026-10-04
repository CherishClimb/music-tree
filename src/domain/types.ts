export type AppRole = 'child' | 'parent' | 'teacher'

export type QualityLevel = 'difficult' | 'normal' | 'focused'
export type ImprovementLevel = 'none' | 'small' | 'clear' | 'breakthrough'
export type HomeworkItemStatus = 'active' | 'completed'
export type HomeworkItemType = 'piece' | 'scale' | 'rhythm' | 'technique' | 'other'
export type StarRating = 1 | 2 | 3 | 4 | 5
export type HomeworkItemImprovementLevel = 'none' | 'small' | 'clear' | 'big'
export type HomeworkItemScore = 20 | 40 | 60 | 80 | 100

export type HomeworkItem = {
  id: string
  childId: string
  title: string
  type: HomeworkItemType
  section?: string
  instruction?: string
  status: HomeworkItemStatus
  createdAt: string
  completedAt?: string
}

export type HomeworkItemEvaluation = {
  homeworkItemId: string
  score: HomeworkItemScore
  improvement: HomeworkItemImprovementLevel
  completed: boolean
}

export type TeacherLessonEvaluation = {
  id: string
  childId: string
  lessonDate: string
  itemEvaluations: HomeworkItemEvaluation[]
  createdAt: string
}
export type TreeState = {
  treeHealth: number
  growthLevel: number
  waterBalance: number
  rootStrength: number
  leafCount: number
  flowerCount: number
  fruitCount: number
  branchLevel: number
  glowLevel: number
  currentInactivityDays: number
  creatureState: 'hidden' | 'watching' | 'nibbling' | 'recovering'
  recoveryState: 'stable' | 'recovering'
  unlockedDecorations: string[]
  unlockedCreatures: string[]
  completedPieces: string[]
  totalPracticeDays: number
  totalPracticeMinutes: number
  currentPracticeStreak: number
  longestPracticeStreak: number
  lastPracticeDate: string | null
  lastTeacherEvaluationDate: string | null
  stage: number
  message: string
}

export type PracticeRecord = {
  id: string
  childId: string
  // Local calendar date of the activity (YYYY-MM-DD), independent of audit timestamps.
  date: string
  minutes: number
  quality: QualityLevel
  achievements: string[]
  customAchievement: string
  improvement: ImprovementLevel
  parentNote: string
  createdAt: string
  updatedAt: string
}

export type AvatarId =
  | 'ice_princess'
  | 'warm_winter_princess'
  | 'friendly_snow_buddy'
  | 'rescue_puppy'
  | 'rainbow_unicorn'

export interface ChildProfile {
  id: string
  displayName: string
  avatarId: AvatarId
}


export type DailyGrowthChange = {
  type: 'water' | 'leaf' | 'flower' | 'glow' | 'root'
  amount: number
  label?: string
}

export type GrowthEngineResult = {
  updatedState: TreeState
  changes: DailyGrowthChange[]
  message: string
}

export type HomeworkAssignment = {
  id: string
  childId: string
  pieceName: string
  section: string
  focus: string
  instruction: string
  recommendedPracticeDays: number
  targetMinutes?: number
  status: 'active' | 'completed'
  assignedAt: string
}

export type TeacherEvaluation = {
  id: string
  childId: string
  homeworkId: string
  score: number
  improvement: ImprovementLevel
  effortObservation?: string
  teacherComment: string
  completedPiece: boolean
  completedPieceName: string
  createdAt: string
}
