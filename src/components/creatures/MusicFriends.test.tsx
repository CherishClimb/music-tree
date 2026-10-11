// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MusicFriends } from './MusicFriends'
import { createFreshState, createLocalRepository, STORAGE_KEY } from '../../data/localRepository'
import { createCreatureCollection, selectVisibleCreatures, unlockEarnedCreatures } from '../../domain/creatures/creatureCollection'
import { CREATURE_CATALOG } from '../../domain/creatures/creatureCatalog'
import { validateCloudState } from '../../data/cloudState'
import { CreatureIllustration } from './CreatureIllustration'

class MemoryStorage {
  values = new Map<string, string>()
  getItem(key: string) { return this.values.get(key) ?? null }
  setItem(key: string, value: string) { this.values.set(key, value) }
  removeItem(key: string) { this.values.delete(key) }
}
const stamp = '2026-10-07T12:00:00.000Z'
function fixture(leaves = 30) {
  const storage = new MemoryStorage()
  const state = createFreshState()
  state.migrationBaseEarnedLeafCount = leaves
  state.treeState.leafCount = leaves
  state.creatureCollection = unlockEarnedCreatures(createCreatureCollection(), leaves, stamp, () => 0)
  storage.setItem(STORAGE_KEY, JSON.stringify(state))
  const repository = createLocalRepository(storage, 'UTC', () => 0)
  return { storage, repository }
}
const mount = (repository: ReturnType<typeof createLocalRepository>) =>
  render(<MusicFriends repository={repository}><div>Music Tree scene</div></MusicFriends>)
afterEach(() => { cleanup(); vi.useRealTimers() })

describe('Music Friends arrivals and Creature Home', () => {
  it('reacts to a newly earned leaf immediately without remounting the tree', () => {
    const { repository } = fixture(29)
    mount(repository)
    expect(screen.queryByRole('status')).toBeNull()
    act(() => { repository.savePracticeRecord({ date: '2026-10-06', minutes: 20, quality: 'normal', improvement: 'none', achievements: [], customAchievement: '', parentNote: '' }) })
    expect(screen.getByRole('status').textContent).toContain('Bellwing Bird')
    expect(screen.getByRole('img', { name: 'Bellwing Bird' }).className).toContain('creature-idle')
  })

  it('keeps the arrival until explicitly sent home, across elapsed time and remount', () => {
    vi.useFakeTimers()
    const { storage, repository } = fixture()
    const first = mount(repository)
    act(() => { vi.advanceTimersByTime(600_000) })
    expect(screen.getByRole('status').textContent).toContain('A new music friend')
    first.unmount()
    const reloaded = createLocalRepository(storage, 'UTC', () => 0)
    mount(reloaded)
    fireEvent.click(screen.getByRole('button', { name: 'Send Bellwing Bird home' }))
    expect(screen.queryByRole('status')).toBeNull()
    expect(JSON.parse(storage.getItem(STORAGE_KEY)!).creatureCollection.ownedCreatures[0]).toMatchObject({
      creatureId: 'bellwing-bird', newlyUnlocked: false, atHome: true, visibleSlotId: null,
    })
    expect(screen.queryByRole('img', { name: 'Bellwing Bird' })).toBeNull()
  })

  it('lists six friends with locked placeholders and persists bringing a friend back out', () => {
    const { repository } = fixture()
    repository.sendCreatureHome('bellwing-bird')
    mount(repository)
    fireEvent.click(screen.getByRole('button', { name: /Music Friends/ }))
    const home = screen.getByRole('region', { name: 'Creature Home' })
    expect(within(home).getAllByRole('article')).toHaveLength(6)
    expect(within(home).getAllByText('Locked')).toHaveLength(5)
    fireEvent.click(within(home).getByRole('button', { name: 'Show Bellwing Bird on tree' }))
    expect(selectVisibleCreatures(repository.getCreatureCollection())).toHaveLength(1)
    expect(screen.getByRole('img', { name: 'Bellwing Bird' })).toBeTruthy()
    expect(screen.queryByRole('status')).toBeNull()
    const backup = repository.exportBackupJson()
    const imported = createLocalRepository(new MemoryStorage())
    imported.restoreBackupJson(backup)
    const cloud = createLocalRepository(new MemoryStorage())
    cloud.loadSnapshot(JSON.stringify(validateCloudState(JSON.parse(backup))))
    for (const restored of [imported, cloud]) expect(restored.getCreatureCollection()).toEqual(repository.getCreatureCollection())
  })

  it('reveals queued arrivals one at a time and respects the two-visitor limit', () => {
    const { repository } = fixture(40)
    mount(repository)
    expect(screen.getAllByRole('img')).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Send Bellwing Bird home' }))
    expect(screen.getByRole('status').textContent).toContain('Tempo Squirrel')
    fireEvent.click(screen.getByRole('button', { name: 'Send Tempo Squirrel home' }))
    expect(screen.getByRole('status').textContent).toContain('Melody Moth')
    fireEvent.click(screen.getByRole('button', { name: /Music Friends/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Show Bellwing Bird on tree' }))
    expect(selectVisibleCreatures(repository.getCreatureCollection())).toHaveLength(2)
    expect((screen.getByRole('button', { name: 'Show Tempo Squirrel on tree' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText('Two friends are visiting. Send one home to invite another.')).toBeTruthy()
  })

  it('keeps a new arrival visible if saving Send home fails', () => {
    const { repository, storage } = fixture()
    mount(repository)
    const before = repository.getCreatureCollection()
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(storage, 'setItem').mockImplementation(() => { throw new Error('quota') })
    fireEvent.click(screen.getByRole('button', { name: 'Send Bellwing Bird home' }))
    expect(screen.getByRole('alert').textContent).toContain('storage')
    expect(screen.getByRole('status').textContent).toContain('Bellwing Bird')
    expect(repository.getCreatureCollection()).toEqual(before)
    warning.mockRestore()
  })

  it('renders the idle hooks for all six assets', () => {
    render(<div>{CREATURE_CATALOG.map((creature) => <CreatureIllustration key={creature.id} creatureId={creature.id} idle />)}</div>)
    expect(screen.getAllByRole('img')).toHaveLength(6)
    for (const image of screen.getAllByRole('img')) {
      expect(image.className).toContain('creature-idle')
      expect(image.getAttribute('src')).toMatch(/\.svg|^data:image\/svg\+xml/)
    }
  })

  it('migrates variant saves through local, backup and cloud entry points without losing earned growth', () => {
    const old = createFreshState()
    const legacy = { ...old, migrationBaseEarnedLeafCount: 30, creatureCollection: {
      baselinePermanentLeafCount: 0, ownedCreatures: [{ creatureId: 'bellwing-bird-blue-curious', unlockedAt: stamp, seen: false }],
    } }
    const storage = new MemoryStorage()
    storage.setItem(STORAGE_KEY, JSON.stringify(legacy))
    const local = createLocalRepository(storage)
    const imported = createLocalRepository(new MemoryStorage())
    imported.restoreBackupJson(JSON.stringify(legacy))
    const cloud = createLocalRepository(new MemoryStorage())
    cloud.loadSnapshot(JSON.stringify(validateCloudState(legacy)))
    for (const saved of [local, imported, cloud]) {
      expect(saved.getCreatureCollection().ownedCreatures).toEqual([{
        creatureId: 'bellwing-bird', unlockedAt: stamp, newlyUnlocked: true, atHome: false, visibleSlotId: 'left',
      }])
      expect(saved.getLeafState().earnedLeafCount).toBe(30)
    }
  })
})
