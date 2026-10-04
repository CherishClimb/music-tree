import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ParentRewardFruits } from '../components/tree/ParentRewardFruits'
import { ChildPage } from '../pages/ChildPage'
import { createDemoState, createLocalRepository, STORAGE_KEY } from '../data/localRepository'
import { createInitialTreeState } from './treeGrowthEngine'
import { REWARD_FRUIT_SLOTS, SUPPORTED_REWARD_FRUIT_TYPES, rewardFruitPosition, selectRewardFruitSlot, type ParentReward } from './parentReward'

class MemoryStorage {
  values = new Map<string, string>()
  getItem(key: string) { return this.values.get(key) ?? null }
  setItem(key: string, value: string) { this.values.set(key, value) }
  removeItem(key: string) { this.values.delete(key) }
}

describe('Parent Reward Fruit interaction', () => {
  it('supports exactly Apple, Pear, Berry, and Peach', () => expect(SUPPORTED_REWARD_FRUIT_TYPES).toEqual(['apple', 'pear', 'berry', 'peach']))

  it.each(SUPPORTED_REWARD_FRUIT_TYPES)('persists selectable %s fruit after reload', (fruitType) => {
    const storage = new MemoryStorage()
    const granted = createLocalRepository(storage).grantParentReward(`${fruitType} reward`, fruitType)
    expect(createLocalRepository(storage).getParentRewards()[0]).toMatchObject({ id: granted.id, fruitType, status: 'available', fruitSlotId: REWARD_FRUIT_SLOTS[0].id })
  })

  it('assigns and preserves a stable tree position', () => {
    const first = { id: 'one', childId: 'child', title: 'One', fruitType: 'apple', status: 'available', grantedAt: 'now', fruitSlotId: selectRewardFruitSlot([]) } satisfies ParentReward
    expect(selectRewardFruitSlot([first])).toBe(REWARD_FRUIT_SLOTS[1].id)
    expect(rewardFruitPosition(first.fruitSlotId)).toEqual(REWARD_FRUIT_SLOTS[0])
  })

  it('assigns stable, non-overlapping overflow identities after six rewards', () => {
    const existing = REWARD_FRUIT_SLOTS.map((slot, index) => ({ id: `reward-${index}`, childId: 'child', title: `Reward ${index}`, fruitType: 'apple', status: 'claimed', grantedAt: 'now', fruitSlotId: slot.id } satisfies ParentReward))
    const seventh = selectRewardFruitSlot(existing)
    const eighth = selectRewardFruitSlot([...existing, { ...existing[0], id: 'reward-7', fruitSlotId: seventh }])
    expect(seventh).toBe('reward-overflow-1')
    expect(eighth).toBe('reward-overflow-2')
    expect(rewardFruitPosition(seventh)).not.toEqual(rewardFruitPosition(eighth))
    expect(rewardFruitPosition(seventh)).toEqual(rewardFruitPosition(seventh))
  })

  it('renders the selected fruit on ChildPage with available glow state and reward content', () => {
    const reward: ParentReward = { id: 'reward', childId: 'child_001', title: 'Choose tonight’s story', fruitType: 'apple', status: 'available', grantedAt: 'now', fruitSlotId: 'reward-slot-1' }
    const markup = renderToStaticMarkup(<ChildPage treeState={createInitialTreeState()} practiceRecords={[]} homeworkItems={[]} parentRewards={[reward]} />)
    expect(markup).toContain('apple reward: Choose tonight’s story. available')
    expect(markup).toContain('parent-reward-fruit apple available')
    expect(markup).toContain('data-fruit-slot="reward-slot-1"')
  })

  it('routes a fruit click to the claim handler', () => {
    const reward: ParentReward = { id: 'reward', childId: 'child', title: 'Story', fruitType: 'pear', status: 'available', grantedAt: 'now', fruitSlotId: 'reward-slot-2' }
    const onSelect = vi.fn()
    const element = ParentRewardFruits({ rewards: [reward], onSelect })
    const fruit = element.props.children[0]
    fruit.props.onClick()
    expect(onSelect).toHaveBeenCalledOnce()
    expect(onSelect).toHaveBeenCalledWith(reward)
  })

  it('claims idempotently, keeps one history entry and loses glow without changing position', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-04T12:00:00.000Z'))
    try {
      const repository = createLocalRepository(new MemoryStorage())
      const granted = repository.grantParentReward('Pick the family game', 'berry')
      const first = repository.claimParentReward(granted.id)!
      const second = repository.claimParentReward(granted.id)!
      expect(second).toEqual(first)
      expect(first).toMatchObject({ status: 'claimed', claimedAt: '2026-08-04T12:00:00.000Z', fruitSlotId: granted.fruitSlotId })
      expect(repository.getParentRewards()).toHaveLength(1)
      const markup = renderToStaticMarkup(<svg><ParentRewardFruits rewards={repository.getParentRewards()} /></svg>)
      expect(markup).toContain('parent-reward-fruit berry claimed')
      expect(markup).not.toContain('berry available')
      expect(markup).toContain(`data-fruit-slot="${granted.fruitSlotId}"`)
    } finally { vi.useRealTimers() }
  })

  it('preserves fruit type, status, content, and position through JSON export/import', () => {
    const source = createLocalRepository(new MemoryStorage())
    const reward = source.grantParentReward('Bake together', 'peach')
    source.claimParentReward(reward.id)
    const restoredStorage = new MemoryStorage()
    restoredStorage.setItem(STORAGE_KEY, JSON.stringify(createDemoState()))
    const restored = createLocalRepository(restoredStorage)
    restored.restoreBackupJson(source.exportBackupJson())
    expect(restored.getParentRewards()).toEqual(source.getParentRewards())
  })
})
