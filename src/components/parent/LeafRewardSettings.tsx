import { useState, type FormEvent } from 'react'
import { normalizeLeafRewardConfig, type LeafRewardConfig } from '../../domain/leafReward'

type LeafRewardSettingsProps = {
  value: LeafRewardConfig
  onSave: (value: LeafRewardConfig) => void
}

export function LeafRewardSettings({ value, onSave }: LeafRewardSettingsProps) {
  const [loadedValue, setLoadedValue] = useState(value)
  const [targetMinutes, setTargetMinutes] = useState(String(value.targetMinutes))
  const [rewardOnTarget, setRewardOnTarget] = useState(value.rewardOnTarget)
  const [rewardOnFocusedPractice, setRewardOnFocusedPractice] = useState(value.rewardOnFocusedPractice)
  const [rewardOnBreakthrough, setRewardOnBreakthrough] = useState(value.rewardOnBreakthrough)
  const [message, setMessage] = useState('')
  const [hasError, setHasError] = useState(false)

  if (value !== loadedValue) {
    setLoadedValue(value)
    setTargetMinutes(String(value.targetMinutes))
    setRewardOnTarget(value.rewardOnTarget)
    setRewardOnFocusedPractice(value.rewardOnFocusedPractice)
    setRewardOnBreakthrough(value.rewardOnBreakthrough)
  }

  const save = (event: FormEvent) => {
    event.preventDefault()
    try {
      const next = normalizeLeafRewardConfig({
        targetMinutes: Number(targetMinutes),
        rewardOnTarget,
        rewardOnFocusedPractice,
        rewardOnBreakthrough,
      })
      onSave(next)
      setTargetMinutes(String(next.targetMinutes))
      setHasError(false)
      setMessage('Leaf reward settings saved.')
    } catch (caught) {
      setHasError(true)
      setMessage(caught instanceof Error ? caught.message : 'Leaf reward settings could not be saved.')
    }
  }

  return (
    <form className="card form-card leaf-reward-settings" data-parent-section="leaf-rewards" onSubmit={save} noValidate>
      <div>
        <h2>Leaf Rewards</h2>
        <p>Choose what helps your tree grow.</p>
      </div>

      <label className="leaf-goal-field" htmlFor="leaf-reward-target">
        <span id="leaf-reward-target-label">Daily Practice Goal</span>
        <span className="leaf-goal-input">
          <input id="leaf-reward-target" aria-labelledby="leaf-reward-target-label" type="number" inputMode="numeric" min={1} max={180} step={1} required value={targetMinutes} onChange={(event) => { setTargetMinutes(event.target.value); setMessage('') }} />
          <span>minutes</span>
        </span>
      </label>

      <fieldset className="leaf-reward-options">
        <legend>Earn a Leaf When…</legend>
        <label className="leaf-reward-option">
          <input type="checkbox" checked={rewardOnTarget} onChange={(event) => { setRewardOnTarget(event.target.checked); setMessage('') }} />
          <span><strong>Practice goal reached</strong><small>Practice for the full goal time.</small></span>
        </label>
        <label className="leaf-reward-option">
          <input type="checkbox" checked={rewardOnFocusedPractice} onChange={(event) => { setRewardOnFocusedPractice(event.target.checked); setMessage('') }} />
          <span><strong>Focused practice</strong><small>Practice for at least 60% of the goal with care and focus.</small></span>
        </label>
        <label className="leaf-reward-option">
          <input type="checkbox" checked={rewardOnBreakthrough} onChange={(event) => { setRewardOnBreakthrough(event.target.checked); setMessage('') }} />
          <span><strong>Breakthrough</strong><small>Make a meaningful improvement.</small></span>
        </label>
      </fieldset>

      <p className="leaf-reward-footer">Your tree can grow one new leaf each day.</p>
      {message && <p className={hasError ? 'form-message error' : 'form-message success'} role={hasError ? 'alert' : 'status'}>{message}</p>}
      <button type="submit" className="primary-button">Save Leaf Rewards</button>
    </form>
  )
}
