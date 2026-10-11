// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createFreshState, createLocalRepository, STORAGE_KEY } from '../../data/localRepository'
import { DEFAULT_LEAF_REWARD_CONFIG } from '../../domain/leafReward'
import { LeafRewardSettings } from './LeafRewardSettings'

class MemoryStorage {
  values = new Map<string, string>()
  getItem(key: string) { return this.values.get(key) ?? null }
  setItem(key: string, value: string) { this.values.set(key, value) }
  removeItem(key: string) { this.values.delete(key) }
}

const mount = (repository: ReturnType<typeof createLocalRepository>) => render(
  <LeafRewardSettings value={repository.getLeafRewardConfig()} onSave={(value) => { repository.updateLeafRewardConfig(value) }} />,
)

afterEach(() => cleanup())

describe('Parent Leaf Rewards settings', () => {
  it('shows defaults for an existing profile without saved settings', () => {
    const storage = new MemoryStorage()
    const legacy = createFreshState() as unknown as Record<string, unknown>
    delete legacy.leafRewardConfig
    storage.setItem(STORAGE_KEY, JSON.stringify(legacy))
    mount(createLocalRepository(storage))

    expect(screen.getByRole('spinbutton', { name: 'Daily Practice Goal' })).toHaveProperty('value', '20')
    expect(screen.getByRole('checkbox', { name: /Practice goal reached/ })).toHaveProperty('checked', true)
    expect(screen.getByRole('checkbox', { name: /Focused practice/ })).toHaveProperty('checked', true)
    expect(screen.getByRole('checkbox', { name: /Breakthrough/ })).toHaveProperty('checked', true)
  })

  it('loads saved custom values after repository reload', () => {
    const storage = new MemoryStorage()
    const repository = createLocalRepository(storage)
    repository.updateLeafRewardConfig({ targetMinutes: 45, rewardOnTarget: false, rewardOnFocusedPractice: true, rewardOnBreakthrough: false })
    mount(createLocalRepository(storage))

    expect(screen.getByRole('spinbutton', { name: 'Daily Practice Goal' })).toHaveProperty('value', '45')
    expect(screen.getByRole('checkbox', { name: /Practice goal reached/ })).toHaveProperty('checked', false)
    expect(screen.getByRole('checkbox', { name: /Focused practice/ })).toHaveProperty('checked', true)
    expect(screen.getByRole('checkbox', { name: /Breakthrough/ })).toHaveProperty('checked', false)
  })

  it('saves independent checkbox choices, including all conditions disabled', async () => {
    const user = userEvent.setup()
    const storage = new MemoryStorage()
    const repository = createLocalRepository(storage)
    mount(repository)

    await user.click(screen.getByRole('checkbox', { name: /Practice goal reached/ }))
    await user.click(screen.getByRole('checkbox', { name: /Focused practice/ }))
    await user.click(screen.getByRole('checkbox', { name: /Breakthrough/ }))
    await user.click(screen.getByRole('button', { name: 'Save Leaf Rewards' }))

    expect(createLocalRepository(storage).getLeafRewardConfig()).toEqual({
      ...DEFAULT_LEAF_REWARD_CONFIG,
      rewardOnTarget: false,
      rewardOnFocusedPractice: false,
      rewardOnBreakthrough: false,
    })
    expect(screen.getByRole('status').textContent).toBe('Leaf reward settings saved.')
  })

  it('can enable every independently saved disabled condition', async () => {
    const user = userEvent.setup()
    const repository = createLocalRepository(new MemoryStorage())
    repository.updateLeafRewardConfig({ rewardOnTarget: false, rewardOnFocusedPractice: false, rewardOnBreakthrough: false })
    mount(repository)

    await user.click(screen.getByRole('checkbox', { name: /Practice goal reached/ }))
    await user.click(screen.getByRole('checkbox', { name: /Focused practice/ }))
    await user.click(screen.getByRole('checkbox', { name: /Breakthrough/ }))
    await user.click(screen.getByRole('button', { name: 'Save Leaf Rewards' }))

    expect(repository.getLeafRewardConfig()).toEqual(DEFAULT_LEAF_REWARD_CONFIG)
  })

  it.each(['', '0', '181', '20.5'])('blocks invalid target value %j', (targetMinutes) => {
    const onSave = vi.fn()
    render(<LeafRewardSettings value={{ ...DEFAULT_LEAF_REWARD_CONFIG }} onSave={onSave} />)
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Daily Practice Goal' }), { target: { value: targetMinutes } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Leaf Rewards' }))
    expect(onSave).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toMatch(/whole number of minutes from 1 to 180/i)
    cleanup()
  })

  it('changes only settings and preserves existing records, awards, and balances', async () => {
    const user = userEvent.setup()
    const storage = new MemoryStorage()
    const state = createFreshState()
    state.practiceRecords = [{ id: 'practice', childId: 'child_001', date: '2026-10-01', minutes: 20, quality: 'normal', achievements: [], customAchievement: '', improvement: 'none', parentNote: '', createdAt: '2026-10-01T12:00:00.000Z', updatedAt: '2026-10-01T12:00:00.000Z' }]
    state.leafGrowthEvents = [{ id: 'leaf_growth_child_001_2026-10-01', childId: 'child_001', date: '2026-10-01', sourceWater: 3, sourceHealth: 100, createdAt: '2026-10-01T12:00:00.000Z' }]
    storage.setItem(STORAGE_KEY, JSON.stringify(state))
    const repository = createLocalRepository(storage)
    const records = repository.getPracticeRecords()
    const events = repository.getLeafGrowthEvents()
    const balance = repository.getLeafPunishmentBalance()
    mount(repository)

    const target = screen.getByRole('spinbutton', { name: 'Daily Practice Goal' })
    await user.clear(target)
    await user.type(target, '35')
    await user.click(screen.getByRole('checkbox', { name: /Focused practice/ }))
    await user.click(screen.getByRole('button', { name: 'Save Leaf Rewards' }))

    expect(repository.getPracticeRecords()).toEqual(records)
    expect(repository.getLeafGrowthEvents()).toEqual(events)
    expect(repository.getLeafPunishmentBalance()).toEqual(balance)
    expect(repository.getLeafRewardConfig()).toMatchObject({ targetMinutes: 35, rewardOnFocusedPractice: false })
  })
})
