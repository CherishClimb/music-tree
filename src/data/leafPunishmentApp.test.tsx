// @vitest-environment jsdom
import { StrictMode } from 'react'
import { act, cleanup, render, screen } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import { CloudGate } from '../cloud/CloudGate'
import { CloudConflictError, type CloudMusicTreeRepository, type CloudState } from './cloudMusicTreeRepository'
import { createFreshState, createLocalRepository, STORAGE_KEY } from './localRepository'

const injected = vi.hoisted(() => ({ repository: null as ReturnType<typeof createLocalRepository> | null }))
vi.mock('./localRepository', async (importOriginal) => {
  const original = await importOriginal<typeof import('./localRepository')>()
  return { ...original, get localRepository() { return injected.repository ?? original.localRepository } }
})
vi.mock('../lib/supabase', () => ({ supabase: null }))

const clock = (instant: string) => vi.setSystemTime(new Date(instant))
function setup() {
  const values = new Map<string, string>()
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: vi.fn((key: string, value: string) => { values.set(key, value) }),
    removeItem: (key: string) => { values.delete(key) },
  }
  const repository = createLocalRepository(storage, 'UTC')
  injected.repository = repository
  storage.setItem.mockClear()
  return { repository, storage }
}
beforeEach(() => { vi.useFakeTimers(); clock('2026-10-01T12:00:00Z') })
afterEach(() => { cleanup(); injected.repository = null; vi.useRealTimers(); vi.restoreAllMocks() })

describe('App punishment lifecycle integration', () => {
  it('does not activate or write during server rendering', () => {
    const { repository, storage } = setup()
    renderToStaticMarkup(<App />)
    expect(repository.getLeafPunishmentLedger()).toBeNull()
    expect(storage.setItem).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('activates once under StrictMode and refreshes the App through repository notifications', () => {
    const { repository, storage } = setup()
    const view = render(<StrictMode><App /></StrictMode>)
    expect(repository.getLeafPunishmentLedger()!.startDate).toBe('2026-10-02')
    expect(storage.setItem).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(1)
    expect(screen.getByLabelText('Practice date').getAttribute('max')).toBe('2026-10-01')
    act(() => {
      clock('2026-10-05T12:00:00Z')
      window.dispatchEvent(new Event('focus'))
    })
    expect(repository.getLeafPunishmentBalance().appliedLoss).toBe(5)
    expect(screen.getByLabelText('Practice date').getAttribute('max')).toBe('2026-10-05')
    view.unmount()
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each([false, true])('waits for hydration and respects the cloud gate (conflict: %s)', async (conflict) => {
    const { repository, storage } = setup()
    const remoteState = createFreshState()
    remoteState.childProfile.displayName = 'Hydrated Child'
    const remote: CloudState = { music_tree_id: 'tree', schema_version: 1, state: remoteState, updated_at: '2026-10-01T11:00:00Z' }
    let resolveLoad!: (snapshot: CloudState) => void
    const cloud = {
      findMusicTreeForUser: vi.fn().mockResolvedValue({ id: 'tree', owner_user_id: 'owner', name: 'Music Tree' }),
      loadCloudState: vi.fn(() => new Promise<CloudState>((resolve) => { resolveLoad = resolve })),
      createMusicTreeForUser: vi.fn(),
      createCloudState: vi.fn(),
      updateCloudState: conflict ? vi.fn().mockRejectedValue(new CloudConflictError()) : vi.fn().mockResolvedValue({ ...remote, updated_at: '2026-10-01T12:00:01Z' }),
    } satisfies CloudMusicTreeRepository
    render(<CloudGate userId="owner" cloud={cloud} repository={repository} storage={storage}><App /></CloudGate>)
    await act(async () => {})
    expect(repository.getLeafPunishmentLedger()).toBeNull()
    expect(storage.setItem).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
    await act(async () => { resolveLoad(remote) })
    expect(repository.getChildProfile().displayName).toBe('Hydrated Child')
    expect(repository.getLeafPunishmentLedger()!.startDate).toBe('2026-10-02')
    expect(cloud.updateCloudState).toHaveBeenCalledTimes(1)
    expect(cloud.updateCloudState.mock.calls[0][1].leafPunishment).toEqual(repository.getLeafPunishmentLedger())
    if (conflict) {
      expect(screen.getByRole('alert').textContent).toContain('another device')
      expect(vi.getTimerCount()).toBe(0)
      const before = storage.getItem(STORAGE_KEY)
      act(() => {
        vi.advanceTimersByTime(7 * 86_400_000)
        window.dispatchEvent(new Event('focus'))
      })
      expect(storage.getItem(STORAGE_KEY)).toBe(before)
    } else {
      expect(screen.getByLabelText('Practice date')).toBeTruthy()
      expect(vi.getTimerCount()).toBe(1)
    }
  })
})
