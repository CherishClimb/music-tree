import { useCallback, useMemo, useState } from 'react'
import { HomeworkMissionCard } from '../components/child/HomeworkMissionCard'
import { RecentRewardCard } from '../components/child/RecentRewardCard'
import { StageProgress } from '../components/child/StageProgress'
import { TodayPracticeCard } from '../components/child/TodayPracticeCard'
import { MusicTreeStory } from '../components/child/MusicTreeStory'
import { MusicTree } from '../components/tree/MusicTree'
import { localRepository } from '../data/localRepository'
import { calculateStageProgress } from '../domain/childStageProgress'
import { TREE_STAGE_BLUEPRINTS, type TreeStage } from '../domain/treeStageBlueprints'
import { CHILD_AVATARS } from '../domain/avatarOptions'
import { AvatarIllustration } from '../components/profile/AvatarIllustration'
import { deriveInactivityTreeState } from '../domain/treeInactivity'
import { selectLatestParentNote } from '../domain/parentNote'
import type { HomeworkItem, PracticeRecord, TreeState } from '../domain/types'
import { isVacationDay } from '../domain/vacation'
import type { ParentReward } from '../domain/parentReward'
import { localCalendarDate } from '../domain/localCalendarDate'
import { selectDailyWater } from '../domain/water'
import { replayHealth } from '../domain/health'
import type { LeafState } from '../domain/leafGrowth'

type ChildPageProps = { treeState?: TreeState; practiceRecords?: PracticeRecord[]; homeworkItems?: HomeworkItem[]; parentRewards?: ParentReward[]; leafState?: LeafState; onParentRewardsChange?: (rewards: ParentReward[]) => void }

export function ChildPage({ treeState: suppliedTreeState, practiceRecords, homeworkItems, parentRewards: suppliedParentRewards, leafState: suppliedLeafState, onParentRewardsChange }: ChildPageProps = {}) {
  const profile = useMemo(() => localRepository.getChildProfile(), [])
  const avatar = CHILD_AVATARS.find((option) => option.id === profile.avatarId) ?? CHILD_AVATARS[0]
  const treeState = suppliedTreeState ?? localRepository.getTreeState()
  const practice = practiceRecords ?? localRepository.getPracticeRecords()
  const homework = (homeworkItems ?? localRepository.getHomeworkItems()).filter((item) => item.status === 'active')
  const lessonEvaluations = useMemo(() => localRepository.getLessonEvaluations(), [])
  const learningCycles = useMemo(() => localRepository.getLearningCycles(), [])
  const completedPieces = useMemo(() => localRepository.getCompletedPieces(), [])
  const fruits = useMemo(() => localRepository.getSpecialFruits(), [])
  const stageSnapshots = useMemo(() => localRepository.getStageEntrySnapshots(), [])
  const vacationPeriods = useMemo(() => localRepository.getVacationPeriods(), [])
  const parentRewards = suppliedParentRewards ?? localRepository.getParentRewards()
  const today = localCalendarDate()
  const vacationToday = isVacationDay(today, vacationPeriods)
  const [magicMessage, setMagicMessage] = useState(() => vacationToday ? `The Music Tree is resting while ${profile.displayName} is on holiday.` : selectLatestParentNote(practice, today))
  const [storyOpen, setStoryOpen] = useState(false)
  const closeStory = useCallback(() => setStoryOpen(false), [])
  const leafState = suppliedLeafState ?? localRepository.getLeafState(today)
  const visualTreeState = useMemo(() => {
    const treeWithVisibleLeaves = { ...treeState, leafCount: leafState.visibleLeafCount }
    return vacationToday ? treeWithVisibleLeaves : deriveInactivityTreeState(treeWithVisibleLeaves, today)
  }, [treeState, leafState.visibleLeafCount, today, vacationToday])
  const todayRecords = practice.filter((record) => record.date === today)
  const todayWater = selectDailyWater(practice, profile.id, today)
  const currentHealth = replayHealth({ practiceRecords: practice, lessonEvaluations, currentDate: today, vacationPeriods }).currentHealth
  const stage = Math.min(5, Math.max(1, treeState.stage)) as TreeStage
  const progressionStage = Math.min(4, stage) as 1 | 2 | 3 | 4
  const currentStageEntry = [...stageSnapshots].reverse().find((snapshot) => snapshot.newStage === stage)?.stageEntryDate
  const progress = calculateStageProgress({
    currentStage: progressionStage,
    stageEntryDate: currentStageEntry ?? practice.map((record) => record.date).sort()[0] ?? today,
    currentDate: today,
    practiceRecords: practice.map((record) => ({ id: record.id, date: record.date, minutes: record.minutes, quality: record.quality, achievements: record.achievements, valid: true, saved: true })),
    learningCycles,
    lessonEvaluations,
    completedPieces,
    concertRecords: localRepository.getConcerts(),
    vacationPeriods,
  })
  const unopenedFruit = fruits.find((fruit) => fruit.status === 'unopened')
  const selectParentReward = (reward: ParentReward) => {
    setMagicMessage(reward.title)
    if (reward.status === 'claimed' || !window.confirm(`Pick this ${reward.fruitType} reward?\n\n${reward.title}`)) return
    localRepository.claimParentReward(reward.id)
    onParentRewardsChange?.(localRepository.getParentRewards())
    setMagicMessage(`${reward.title} — picked and saved in your reward history.`)
  }

  return (
    <main className="child-page">
      <div className="child-profile-banner"><AvatarIllustration avatarId={avatar.id} className="child-avatar" /><div><p className="child-kicker">Welcome back</p><h1>{profile.displayName}’s Music Tree</h1></div></div>
      <StageProgress currentName={TREE_STAGE_BLUEPRINTS[stage].name} nextName={stage === 5 ? undefined : TREE_STAGE_BLUEPRINTS[progress.nextStage as TreeStage].name} percentage={stage === 5 ? null : progress.percentage} message={stage === 5 ? 'Your grand tree can keep collecting music memories.' : progress.message} structureComplete={stage === 5} />
      <div className="child-game-layout">
        <section className="child-tree-scene" aria-label="Your magical Music Tree">
          <div className="child-tree-glow" />
          <button type="button" className="story-button" aria-haspopup="dialog" onClick={() => setStoryOpen(true)}><span aria-hidden="true">📖</span> Story</button>
          <MusicTree treeState={visualTreeState} stage={stage} childAvatarId={profile.avatarId} parentRewards={parentRewards} onParentRewardSelect={selectParentReward} onLeafSelect={() => setMagicMessage('A new crystal leaf is humming your song.')} onFlowerSelect={() => setMagicMessage('This flower bloomed from your careful practice.')} onFruitSelect={() => setMagicMessage('This fruit remembers a piece you completed.')} />
          <p className="tree-whisper" role="status">{magicMessage}</p>
          {unopenedFruit && <button type="button" className="surprise-fruit-button" onClick={() => setMagicMessage('A surprise fruit is waiting to be opened with your family!')}>✦ Unopened surprise fruit</button>}
        </section>
        <div className="child-side-cards">
          <HomeworkMissionCard items={homework} />
          <TodayPracticeCard practised={todayRecords.length > 0} minutes={todayRecords.reduce((sum, record) => sum + record.minutes, 0)} water={todayWater} health={currentHealth} visibleLeaves={leafState.visibleLeafCount} />
          <RecentRewardCard message={treeState.message} />
          <button type="button" className="memories-button" onClick={() => setMagicMessage('Your music memories are sparkling safely in the tree.')}>✧ Visit my music memories</button>
        </div>
      </div>
      {storyOpen && <MusicTreeStory onClose={closeStory} />}
    </main>
  )
}
