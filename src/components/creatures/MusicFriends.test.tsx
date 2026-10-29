// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MusicFriends } from './MusicFriends'
import { CREATURE_POSITIONS_STORAGE_KEY, createFreshState, createLocalRepository, STORAGE_KEY } from '../../data/localRepository'
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
  render(<MusicFriends repository={repository} placementEnabled><div>Music Tree scene</div></MusicFriends>)
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
    expect(screen.queryByRole('button', { name: 'Send Bellwing Bird home' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Music Friends/ }))
    const home = screen.getByRole('region', { name: 'Creature Home' })
    fireEvent.click(within(home).getByRole('button', { name: 'Send Bellwing Bird home' }))
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

  it.each(['mouse', 'touch', 'pen'])('drags with a %s pointer, clamps to safe normalized bounds, and restores after reload', (pointerType) => {
    const { storage, repository } = fixture()
    const first = mount(repository)
    const visitor = screen.getByRole('button', { name: /Move Bellwing Bird on tree/ })
    Object.defineProperty(visitor, 'setPointerCapture', { value: vi.fn() })
    Object.defineProperty(visitor, 'releasePointerCapture', { value: vi.fn() })
    vi.spyOn(document.querySelector('.music-friends-world')!, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, right: 400, bottom: 460, width: 400, height: 460, x: 0, y: 0, toJSON: () => ({}) })
    vi.spyOn(visitor, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 276, right: 84, bottom: 360, width: 84, height: 84, x: 0, y: 276, toJSON: () => ({}) })
    fireEvent.pointerDown(visitor, { pointerId: 1, pointerType, button: 0, isPrimary: true, clientX: 42, clientY: 318 })
    fireEvent.pointerMove(visitor, { pointerId: 1, pointerType, isPrimary: true, clientX: 1000, clientY: 1000 })
    fireEvent.pointerUp(visitor, { pointerId: 1, pointerType, isPrimary: true, clientX: 1000, clientY: 1000 })
    const saved = repository.getCreaturePositions()['bellwing-bird']!
    expect(saved.x).toBeCloseTo(0.885)
    expect(saved.y).toBeCloseTo(0.9)
    expect(JSON.parse(storage.getItem(CREATURE_POSITIONS_STORAGE_KEY)!)).toEqual({ 'bellwing-bird': saved })

    first.unmount()
    const reloaded = createLocalRepository(storage, 'UTC', () => 0)
    mount(reloaded)
    const restored = screen.getByRole('button', { name: /Move Bellwing Bird on tree/ })
    expect(restored.dataset.positioned).toBe('true')
    expect(restored.style.getPropertyValue('--creature-x')).toBe('88.5%')
    expect(reloaded.getCreatureCollection().ownedCreatures[0]).toMatchObject({ newlyUnlocked: true, atHome: false, visibleSlotId: 'left' })
  })

  it('keeps a saved position through Creature Home send-home and return actions', () => {
    const { repository } = fixture()
    repository.saveCreaturePosition('bellwing-bird', { x: 0.4, y: 0.3 })
    mount(repository)
    fireEvent.click(screen.getByRole('button', { name: /Music Friends/ }))
    const home = screen.getByRole('region', { name: 'Creature Home' })
    fireEvent.click(within(home).getByRole('button', { name: 'Send Bellwing Bird home' }))
    expect(screen.queryByRole('button', { name: /Move Bellwing Bird on tree/ })).toBeNull()
    fireEvent.click(within(home).getByRole('button', { name: 'Show Bellwing Bird on tree' }))
    expect(screen.getByRole('button', { name: /Move Bellwing Bird on tree/ }).style.getPropertyValue('--creature-x')).toBe('40%')
    expect(repository.getCreaturePositions()['bellwing-bird']).toEqual({ x: 0.4, y: 0.3 })
  })

  it('supports keyboard repositioning without changing creature visit state', () => {
    const { repository } = fixture()
    mount(repository)
    const visitor = screen.getByRole('button', { name: /Move Bellwing Bird on tree/ })
    vi.spyOn(document.querySelector('.music-friends-world')!, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, right: 400, bottom: 460, width: 400, height: 460, x: 0, y: 0, toJSON: () => ({}) })
    vi.spyOn(visitor, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 276, right: 84, bottom: 360, width: 84, height: 84, x: 0, y: 276, toJSON: () => ({}) })
    const before = repository.getCreatureCollection()
    fireEvent.keyDown(visitor, { key: 'ArrowRight' })
    expect(repository.getCreaturePositions()['bellwing-bird']).toEqual({ x: 0.125, y: 318 / 460 })
    expect(repository.getCreatureCollection()).toEqual(before)
  })

  it('does not enable placement outside the Child Page opt-in', () => {
    const { repository } = fixture()
    render(<MusicFriends repository={repository}><div>Parent tree scene</div></MusicFriends>)
    expect(screen.queryByRole('button', { name: /Move Bellwing Bird/ })).toBeNull()
    expect(screen.getByRole('img', { name: 'Bellwing Bird' })).toBeTruthy()
  })

  it('reveals queued arrivals one at a time and respects the two-visitor limit', () => {
    const { repository } = fixture(40)
    mount(repository)
    expect(screen.getAllByRole('img')).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: /Music Friends/ }))
    const home = screen.getByRole('region', { name: 'Creature Home' })
    fireEvent.click(within(home).getByRole('button', { name: 'Send Bellwing Bird home' }))
    expect(screen.getByRole('status').textContent).toContain('Tempo Squirrel')
    fireEvent.click(within(home).getByRole('button', { name: 'Send Tempo Squirrel home' }))
    expect(screen.getByRole('status').textContent).toContain('Melody Moth')
    fireEvent.click(within(home).getByRole('button', { name: 'Show Bellwing Bird on tree' }))
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
    fireEvent.click(screen.getByRole('button', { name: /Music Friends/ }))
    const home = screen.getByRole('region', { name: 'Creature Home' })
    fireEvent.click(within(home).getByRole('button', { name: 'Send Bellwing Bird home' }))
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
