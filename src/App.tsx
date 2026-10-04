import { useMemo, useState } from 'react'
import './App.css'
import { MusicTree } from './components/tree/MusicTree'
import { localRepository } from './data/localRepository'
import { createInitialTreeState } from './domain/treeGrowthEngine'
import { getPermissionsForRole, MVP_ROLE_NOTE } from './domain/permissions'
import { chooseRandomReward, type FamilyReward, type SpecialFruit } from './domain/specialFruitEngine'
import { TREE_STAGE_BLUEPRINTS, type TreeStage } from './domain/treeStageBlueprints'
import type { AppRole, HomeworkItem, HomeworkItemType, PracticeRecord, TreeState } from './domain/types'
import { TeacherPage } from './pages/TeacherPage'
import { ChildPage } from './pages/ChildPage'
import { ParentDataTools } from './components/parent/ParentDataTools'
import { CHILD_AVATARS } from './domain/avatarOptions'
import { AvatarIllustration } from './components/profile/AvatarIllustration'
import { confirmHomeworkRemoval } from './domain/homeworkRemoval'
import { selectDominantPendingReminder, type RewardReminderStatus } from './domain/rewardReminder'
import { VacationManager } from './components/parent/VacationManager'
import { ParentStageProgress } from './components/parent/ParentStageProgress'
import { SUPPORTED_REWARD_FRUIT_TYPES, type ParentReward, type RewardFruitType } from './domain/parentReward'
import { isCalendarDate, localCalendarDate } from './domain/localCalendarDate'
import { countDailyPracticeRecords, MAX_DAILY_PRACTICE_RECORDS, selectDailyWater } from './domain/water'
import type { LeafState } from './domain/leafGrowth'
import { selectDeveloperPreviewStage } from './domain/developmentPreview'

const initialRole: AppRole = 'parent'

const roleLabel: Record<AppRole, string> = {
  child: 'Child',
  parent: 'Parent',
  teacher: 'Teacher',
}

const defaultRewardName = 'Choose the family movie'

function App() {
  const [role, setRole] = useState<AppRole>(initialRole)
  const [treeState, setTreeState] = useState<TreeState>(() => ({
    ...createInitialTreeState(),
    ...localRepository.getTreeState(),
  }))
  const [records, setRecords] = useState<PracticeRecord[]>(() => localRepository.getPracticeRecords())
  const [message, setMessage] = useState<string>(localRepository.getTreeState().message)
  const [minutes, setMinutes] = useState<number>(15)
  const [quality, setQuality] = useState<PracticeRecord['quality']>('focused')
  const [achievement, setAchievement] = useState<string>('assigned_section')
  const [customAchievement, setCustomAchievement] = useState('')
  const [improvement, setImprovement] = useState<PracticeRecord['improvement']>('small')
  const [note, setNote] = useState('')
  const [practiceFormMessage, setPracticeFormMessage] = useState('')
  const [practiceDate, setPracticeDate] = useState(() => localCalendarDate())
  const [rewards, setRewards] = useState<FamilyReward[]>(() => localRepository.getRewards())
  const [rewardName, setRewardName] = useState('')
  const [rewardFruitType, setRewardFruitType] = useState<RewardFruitType>('apple')
  const [rewardFormMessage, setRewardFormMessage] = useState('')
  const [parentRewards, setParentRewards] = useState<ParentReward[]>(() => localRepository.getParentRewards())
  const [fruitHistory, setFruitHistory] = useState<SpecialFruit[]>(() => localRepository.getSpecialFruits())
  const [openedRewardName, setOpenedRewardName] = useState<string | null>(null)
  const [developerPreviewEnabled, setDeveloperPreviewEnabled] = useState(false)
  const [previewStage, setPreviewStage] = useState<TreeStage>(1)
  const [homeworkItems, setHomeworkItems] = useState<HomeworkItem[]>(() => localRepository.getHomeworkItems())
  const [homeworkTitle, setHomeworkTitle] = useState('')
  const [homeworkSection, setHomeworkSection] = useState('')
  const [homeworkInstruction, setHomeworkInstruction] = useState('')
  const [homeworkType, setHomeworkType] = useState<HomeworkItemType>('piece')
  const [editingHomeworkId, setEditingHomeworkId] = useState<string | null>(null)
  const [homeworkError, setHomeworkError] = useState('')
  const [repositoryWarning] = useState(() => localRepository.getLoadWarning())
  const [childProfile, setChildProfile] = useState(() => localRepository.getChildProfile())
  const [profileName, setProfileName] = useState(() => localRepository.getChildProfile().displayName)
  const [profileAvatar, setProfileAvatar] = useState(() => localRepository.getChildProfile().avatarId)
  const [profileMessage, setProfileMessage] = useState('')
  const [rewardReminders, setRewardReminders] = useState(() => localRepository.getRewardReminders())
  const [dismissedReminderIds, setDismissedReminderIds] = useState<string[]>([])

  const permissions = useMemo(() => getPermissionsForRole(role), [role])
  const developerToolsAvailable = import.meta.env.DEV
  const effectiveStage = selectDeveloperPreviewStage(treeState.stage as TreeStage, previewStage, developerToolsAvailable && developerPreviewEnabled)
  const currentLocalDate = localCalendarDate()
  const todayWater = selectDailyWater(records, childProfile.id, currentLocalDate)
  const currentHealth = localRepository.getCurrentHealth(currentLocalDate)
  const currentLeafState: LeafState = localRepository.getLeafState(currentLocalDate)
  const visibleTreeState = { ...treeState, leafCount: currentLeafState.visibleLeafCount }
  const selectedDatePracticeRecordCount = countDailyPracticeRecords(records, childProfile.id, practiceDate)
  const practiceDateValid = isCalendarDate(practiceDate) && practiceDate <= currentLocalDate
  const practiceDateLabel = practiceDate === currentLocalDate ? 'today' : `for ${practiceDate}`

  const handleSubmitPractice = () => {
    try {
      const result = localRepository.savePracticeRecord({ date: practiceDate, minutes, quality, achievements: achievement ? [achievement] : [], customAchievement: achievement === 'other' ? customAchievement : '', improvement, parentNote: note })
      setRecords(localRepository.getPracticeRecords())
      setTreeState(result.treeState)
      setRewardReminders(localRepository.getRewardReminders())
      setMessage(result.message)
      setPracticeFormMessage(practiceDate === currentLocalDate ? 'Practice saved safely.' : `Practice saved for ${practiceDate}.`)
      setCustomAchievement('')
    } catch (caught) {
      const errorMessage = caught instanceof Error ? caught.message : 'Practice could not be saved.'
      setMessage(errorMessage)
      setPracticeFormMessage(errorMessage)
    }
  }

  const grantParentReward = () => {
    try {
      localRepository.grantParentReward(rewardName, rewardFruitType)
      setParentRewards(localRepository.getParentRewards())
      setRewardName('')
      setMessage('A new reward fruit is glowing on the tree.')
      setRewardFormMessage('Reward fruit granted and ready on the Child tree.')
    } catch (caught) {
      const errorMessage = caught instanceof Error ? caught.message : 'Reward could not be granted.'
      setMessage(errorMessage)
      setRewardFormMessage(errorMessage)
    }
  }

  const openFruit = () => {
    const activeRewards = rewards.filter((reward) => reward.active)
    if (activeRewards.length === 0) {
      setOpenedRewardName('Add or activate at least one family reward before opening the special fruit.')
      return
    }

    const selectedReward = chooseRandomReward(rewards)
    if (!selectedReward) {
      setOpenedRewardName('Add or activate at least one family reward before opening the special fruit.')
      return
    }

    const fruit: SpecialFruit = {
      id: `fruit_${Date.now()}`,
      childId: 'child_001',
      unlockReason: 'practice_and_pieces',
      sourceEventIds: ['manual_draw'],
      selectedRewardId: selectedReward.id,
      selectedRewardName: selectedReward.name,
      status: 'opened',
      unlockedAt: new Date().toISOString(),
      openedAt: new Date().toISOString(),
    }

    const nextFruits = [fruit, ...fruitHistory]
    setFruitHistory(nextFruits)
    localRepository.saveSpecialFruits(nextFruits)
    setOpenedRewardName(`Your surprise is: ${selectedReward.name}!`)
    setMessage('A magical fruit has grown! Tap it to discover your surprise.')
  }

  const roleOptions = (Object.keys(roleLabel) as AppRole[]).map((item) => ({
    value: item,
    label: roleLabel[item],
  }))

  const activeFruitReward = fruitHistory[0]?.selectedRewardName ?? defaultRewardName
  const pendingRewardReminder = selectDominantPendingReminder(rewardReminders.filter((reminder) => !dismissedReminderIds.includes(reminder.id)), childProfile.id)

  const resetHomeworkForm = () => {
    setHomeworkTitle('')
    setHomeworkSection('')
    setHomeworkInstruction('')
    setHomeworkType('piece')
    setEditingHomeworkId(null)
    setHomeworkError('')
  }

  const saveHomeworkItem = () => {
    try {
      const values = { title: homeworkTitle, type: homeworkType, section: homeworkSection, instruction: homeworkInstruction }
      if (editingHomeworkId) localRepository.updateHomeworkItem(editingHomeworkId, values)
      else localRepository.addHomeworkItem(values)
      setHomeworkItems(localRepository.getHomeworkItems())
      resetHomeworkForm()
    } catch (caught) {
      setHomeworkError(caught instanceof Error ? caught.message : 'Homework could not be saved.')
    }
  }

  const editHomeworkItem = (item: HomeworkItem) => {
    setEditingHomeworkId(item.id)
    setHomeworkTitle(item.title)
    setHomeworkSection(item.section ?? '')
    setHomeworkInstruction(item.instruction ?? '')
    setHomeworkType(item.type)
    setHomeworkError('')
  }

  const deleteHomeworkItem = (item: HomeworkItem) => {
    if (!confirmHomeworkRemoval(item.title, window.confirm)) return
    const result = localRepository.removeHomeworkItem(item.id)
    if (result.status === 'deleted') {
      setHomeworkItems(localRepository.getHomeworkItems())
      if (editingHomeworkId === item.id) resetHomeworkForm()
    } else {
      setHomeworkError(result.status === 'blocked_historical_reference' ? 'This homework is part of lesson history and cannot be deleted.' : 'That homework item was not found.')
    }
  }

  const refreshPersistedView = () => {
    setTreeState(localRepository.getTreeState())
    setRecords(localRepository.getPracticeRecords())
    setRewards(localRepository.getRewards())
    setFruitHistory(localRepository.getSpecialFruits())
    setHomeworkItems(localRepository.getHomeworkItems())
    setRewardReminders(localRepository.getRewardReminders())
    setParentRewards(localRepository.getParentRewards())
    setMessage(localRepository.getTreeState().message)
    const profile = localRepository.getChildProfile()
    setChildProfile(profile)
    setProfileName(profile.displayName)
    setProfileAvatar(profile.avatarId)
  }

  const saveChildProfile = () => {
    try { const profile = localRepository.updateChildProfile({ displayName: profileName, avatarId: profileAvatar }); setChildProfile(profile); setProfileMessage('Child profile saved.') }
    catch (caught) { setProfileMessage(caught instanceof Error ? caught.message : 'Profile could not be saved.') }
  }

  const handleRewardReminder = (status: Extract<RewardReminderStatus, 'granted' | 'skipped'>) => {
    if (!pendingRewardReminder) return
    localRepository.handleRewardReminder(pendingRewardReminder.id, status)
    setRewardReminders(localRepository.getRewardReminders())
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Music Tree</p>
          <h1>Magical winter practice</h1>
        </div>
        <div className="role-switcher" aria-label="Role selector">
          {roleOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              className={role === option.value ? 'pill active' : 'pill'}
              onClick={() => { refreshPersistedView(); setRole(option.value) }}
            >
              {option.label}
            </button>
          ))}
        </div>
      </header>

      {role === 'child' ? <ChildPage treeState={treeState} practiceRecords={records} homeworkItems={homeworkItems} parentRewards={parentRewards} leafState={currentLeafState} onParentRewardsChange={setParentRewards} /> : role === 'teacher' ? <TeacherPage /> : <main className="layout">
        <section className="tree-panel">
          <div className="tree-header">
            <span className="badge">{roleLabel[role]} view</span>
            <strong>{message}</strong>
          </div>

          {developerToolsAvailable && <div className={developerPreviewEnabled ? 'developer-preview active' : 'developer-preview'}>
            <label className="preview-toggle">
              <input type="checkbox" checked={developerPreviewEnabled} onChange={(event) => setDeveloperPreviewEnabled(event.target.checked)} />
              Developer preview {developerPreviewEnabled ? '— visual state override active' : '(off)'}
            </label>
            {developerPreviewEnabled && (
              <div className="stage-preview-controls" aria-label="Stage preview selector">
                {([1, 2, 3, 4, 5] as TreeStage[]).map((stage) => (
                  <button
                    key={stage}
                    type="button"
                    className={previewStage === stage ? 'stage-preview active' : 'stage-preview'}
                    onClick={() => setPreviewStage(stage)}
                  >
                    Stage {stage}
                  </button>
                ))}
              </div>
            )}
          </div>}

          <button type="button" className="tree-fruit-button" onClick={openFruit} aria-label="Open special fruit mystery reward">
            <MusicTree treeState={visibleTreeState} stage={effectiveStage} developerPreview={developerToolsAvailable && developerPreviewEnabled} />
          </button>
          <div className="tree-stats">
            <span>Stage {effectiveStage}</span>
            <span>{TREE_STAGE_BLUEPRINTS[effectiveStage].name}</span>
            <span>Leaves {currentLeafState.earnedLeafCount}</span>
            <span>Flowers {treeState.flowerCount}</span>
            <span>Glow {treeState.glowLevel}</span>
          </div>
        </section>

        <aside className="info-panel">
          {permissions.canRecordPractice && (
            <div className="card form-card parent-daily-section" data-parent-section="daily-practice">
              <h2>Daily practice</h2>
              <label>
                Practice date
                <input type="date" value={practiceDate} max={currentLocalDate} required aria-describedby="practice-date-help" onChange={(event) => { setPracticeDate(event.target.value); setPracticeFormMessage('') }} />
              </label>
              <small id="practice-date-help">Choose today or an earlier day when the practice happened.</small>
              <label>
                Practice minutes
                <input
                  type="number"
                  min={0}
                  max={120}
                  value={minutes}
                  onChange={(event) => setMinutes(Number(event.target.value))}
                />
              </label>
              <label>
                Quality
                <select value={quality} onChange={(event) => setQuality(event.target.value as PracticeRecord['quality'])}>
                  <option value="difficult">Difficult but kept trying</option>
                  <option value="normal">Practised normally</option>
                  <option value="focused">Focused and careful</option>
                </select>
              </label>
              <label>
                Achievement
                <select value={achievement} onChange={(event) => setAchievement(event.target.value)}>
                  <option value="">No achievement selected</option>
                  <option value="assigned_section">Practised the assigned section</option>
                  <option value="completed_today_task">Completed today’s task</option>
                  <option value="played_difficult_section">Played a difficult section correctly</option>
                  <option value="played_whole_piece">Played the whole piece</option>
                  <option value="remembered_notes_independently">Remembered notes independently</option>
                  <option value="improved_rhythm">Improved the rhythm</option>
                  <option value="tried_without_help">Tried without help</option>
                  <option value="other">Other</option>
                </select>
              </label>
              {achievement === 'other' && <label>
                Other achievement
                <input value={customAchievement} maxLength={160} onChange={(event) => setCustomAchievement(event.target.value)} placeholder="What went well?" />
              </label>}
              <label>
                Improvement
                <select value={improvement} onChange={(event) => setImprovement(event.target.value as PracticeRecord['improvement'])}>
                  <option value="none">Not visible yet</option>
                  <option value="small">A little better</option>
                  <option value="clear">Clearly better</option>
                  <option value="breakthrough">Breakthrough today</option>
                </select>
              </label>
              <label>
                Parent note
                <textarea
                  value={note}
                  maxLength={300}
                  onChange={(event) => setNote(event.target.value)}
                  rows={3}
                />
              </label>
              <button type="button" className="primary-button" disabled={!practiceDateValid} onClick={handleSubmitPractice}>
                Save practice
              </button>
              {practiceFormMessage && <p className="form-message" role="status">{practiceFormMessage}</p>}
              {practiceDateValid && <p className="practice-limit-note">{selectedDatePracticeRecordCount >= MAX_DAILY_PRACTICE_RECORDS ? `Three practice moments are safely saved ${practiceDate === currentLocalDate ? 'for today' : practiceDateLabel}.` : `${selectedDatePracticeRecordCount} of ${MAX_DAILY_PRACTICE_RECORDS} practice moments saved ${practiceDateLabel}.`}</p>}
            </div>
          )}

          {role === 'parent' && (
            <div className="card form-card homework-manager parent-homework-editor" data-parent-section="homework-editor">
              <h3>{editingHomeworkId ? 'Edit homework item' : 'Add homework item'}</h3>
              <label>Homework type<select value={homeworkType} onChange={(event) => setHomeworkType(event.target.value as HomeworkItemType)}><option value="piece">Piece</option><option value="scale">Scale</option><option value="rhythm">Rhythm</option><option value="technique">Technique</option><option value="other">Other</option></select></label>
              <label>Piece or exercise name<input value={homeworkTitle} onChange={(event) => setHomeworkTitle(event.target.value)} /></label>
              <label>Section, bars, or page <span className="optional-label">optional</span><input maxLength={120} value={homeworkSection} onChange={(event) => setHomeworkSection(event.target.value)} /></label>
              <label>Short instruction <span className="optional-label">optional</span><textarea rows={2} maxLength={200} value={homeworkInstruction} onChange={(event) => setHomeworkInstruction(event.target.value)} /></label>
              {homeworkError && <p className="form-message error" role="alert">{homeworkError}</p>}
              <div className="homework-form-actions"><button type="button" className="primary-button" onClick={saveHomeworkItem}>{editingHomeworkId ? 'Save changes' : 'Add homework item'}</button>{editingHomeworkId && <button type="button" className="mini-button" onClick={resetHomeworkForm}>Cancel</button>}</div>
            </div>
          )}

          {role === 'parent' && (
            <div className="card homework-manager parent-current-homework" data-parent-section="current-homework">
              <h2>Current Homework</h2>
              <ol className="homework-item-list">
                {homeworkItems.filter((item) => item.status === 'active').map((item) => (
                  <li key={item.id}>
                    <div><strong>{item.title}</strong><small>{item.type} · {item.status}</small>{item.section && <span>{item.section}</span>}{item.instruction && <small>{item.instruction}</small>}</div>
                    <div className="reward-actions"><button type="button" className="mini-button" onClick={() => editHomeworkItem(item)}>Edit</button>{localRepository.canRemoveHomeworkItem(item.id) && <button type="button" className="mini-button" onClick={() => deleteHomeworkItem(item)}>Delete</button>}</div>
                  </li>
                ))}
              </ol>
              {homeworkItems.every((item) => item.status !== 'active') && <p>No active homework.</p>}
              {homeworkItems.some((item) => item.status === 'completed') && <details><summary>Completed homework history</summary><ul>{homeworkItems.filter((item) => item.status === 'completed').map((item) => <li key={item.id}>{item.title}{item.section ? ` · ${item.section}` : ''}</li>)}</ul></details>}
            </div>
          )}

          {permissions.canManageRewards && (
            <div className="card form-card parent-reward-section" data-parent-section="reward-fruit">
              <h2>Reward fruit</h2>
              <label>
                Reward content
                <input value={rewardName} onChange={(event) => setRewardName(event.target.value)} placeholder="Add a little reward" />
              </label>
              <label>
                Fruit type
                <select value={rewardFruitType} onChange={(event) => setRewardFruitType(event.target.value as RewardFruitType)}>
                  {SUPPORTED_REWARD_FRUIT_TYPES.map((fruitType) => <option key={fruitType} value={fruitType}>{fruitType[0].toUpperCase() + fruitType.slice(1)}</option>)}
                </select>
              </label>
              <button type="button" className="primary-button" onClick={grantParentReward}>Grant reward</button>
              {rewardFormMessage && <p className="form-message" role="status">{rewardFormMessage}</p>}
              <h3>Reward History</h3>
              <ul className="reward-list">
                {parentRewards.map((reward) => (
                  <li key={reward.id}>
                    <span>{reward.title}</span>
                    <strong>{reward.fruitType} · {reward.status}</strong>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="card parent-reward-progress" data-parent-section="reward-progress">
            <h2>Reward progress</h2>
            <p>Practice days: 4 of 6</p>
            <p>Completed pieces: 1 of 2</p>
            <p>Highest teacher scores: 1 of 2</p>
            <p>Concert performance: not yet recorded</p>
          </div>

          <ParentStageProgress />
          {pendingRewardReminder && <section className="card reward-reminder-card" aria-labelledby="reward-reminder-title">
            <h2 id="reward-reminder-title">A little celebration?</h2>
            <p>{pendingRewardReminder.leafMilestone === 5 ? `${childProfile.displayName} has grown 5 more leaves. Would you like to add a little reward fruit?` : `${childProfile.displayName}’s tree has reached ${pendingRewardReminder.leafMilestone} leaves. Would you like to add a reward fruit?`}</p>
            <div className="reward-reminder-actions">
              <button type="button" className="primary-button" onClick={() => handleRewardReminder('granted')}>Grant reward</button>
              <button type="button" className="mini-button" onClick={() => setDismissedReminderIds((current) => [...current, pendingRewardReminder.id])}>Remind me later</button>
              <button type="button" className="mini-button" onClick={() => handleRewardReminder('skipped')}>Skip this milestone</button>
            </div>
          </section>}
          {repositoryWarning && role === 'parent' && <div className="card notice parent-secondary-section" role="alert"><h2>Saved data notice</h2><p>{repositoryWarning}</p></div>}
          <div className="card parent-secondary-section">
            <h2>Today’s tree status</h2>
            <ul>
              <li>Water today: {todayWater}/3</li>
              <li>Roots: {treeState.rootStrength}</li>
              <li>Health today: {currentHealth}%</li>
            </ul>
          </div>

          {role === 'parent' && (
            <div className="card form-card child-profile-editor parent-secondary-section">
              <h2>Child profile</h2>
              <label>Display name<input maxLength={40} value={profileName} onChange={(event) => setProfileName(event.target.value)} /></label>
              <fieldset><legend>Choose an avatar</legend><div className="avatar-options">{CHILD_AVATARS.map((avatar) => <button key={avatar.id} type="button" className={profileAvatar === avatar.id ? 'avatar-option selected' : 'avatar-option'} aria-label={`Choose ${avatar.label} avatar`} aria-pressed={profileAvatar === avatar.id} onClick={() => setProfileAvatar(avatar.id)}><AvatarIllustration avatarId={avatar.id} /><small>{avatar.label}</small>{profileAvatar === avatar.id && <strong className="avatar-selected-label">Selected</strong>}</button>)}</div></fieldset>
              <button type="button" className="primary-button" onClick={saveChildProfile}>Save child profile</button>
              {profileMessage && <p className="data-tool-message" role="status">{profileMessage}</p>}
              <small>Current profile: {childProfile.displayName}</small>
            </div>
          )}

          {role === 'parent' && <div className="parent-secondary-section" data-parent-section="data-tools"><ParentDataTools onRestored={refreshPersistedView} /></div>}
          {role === 'parent' && <div className="parent-secondary-section" data-parent-section="vacation"><VacationManager /></div>}

          <div className="card parent-secondary-section">
            <h2>Special fruit</h2>
            <p className="reward-reveal">{openedRewardName ?? `Your next magical fruit is growing.`}</p>
            <p className="reward-reveal">{activeFruitReward}</p>
          </div>

          <div className="card parent-secondary-section">
            <h2>Recent practice</h2>
            <ul className="record-list">
              {records.slice(0, 4).map((record) => (
                <li key={record.id}>
                  <strong>{record.date}</strong>
                  <span>{record.minutes} min · {record.quality}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="card notice parent-secondary-section">
            <h2>Role note</h2>
            <p>{MVP_ROLE_NOTE}</p>
          </div>
        </aside>
      </main>}
    </div>
  )
}

export default App
