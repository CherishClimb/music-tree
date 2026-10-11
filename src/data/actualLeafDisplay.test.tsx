// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import { createFreshState, createLocalRepository, STORAGE_KEY } from './localRepository'

const injected = vi.hoisted(() => ({ repository: null as ReturnType<typeof createLocalRepository> | null }))
vi.mock('./localRepository', async (importOriginal) => {
  const original = await importOriginal<typeof import('./localRepository')>()
  return { ...original, get localRepository() { return injected.repository ?? original.localRepository } }
})

const clock = (day: string) => vi.setSystemTime(new Date(`${day}T12:00:00Z`))
const practice = (date: string, minutes = 5) => ({ date, minutes, quality: 'normal' as const, achievements: [], customAchievement: '', improvement: 'none' as const, parentNote: '' })
function setup(leaves = 16) {
  const initial = createFreshState()
  initial.migrationBaseEarnedLeafCount = leaves
  initial.treeState.leafCount = leaves
  const values = new Map([[STORAGE_KEY, JSON.stringify(initial)]])
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: vi.fn((key: string, value: string) => { values.set(key, value) }),
    removeItem: (key: string) => { values.delete(key) },
  }
  const repository = createLocalRepository(storage, 'UTC')
  injected.repository = repository
  return { repository, storage }
}

// Count represented leaves, including the existing overflow clusters.
function renderedLeaves(container: HTMLElement) {
  const tree = container.querySelector('.tree-leaves')!
  const singles = tree.querySelectorAll('.leaf-silhouette').length
  const clusters = [...tree.querySelectorAll('[data-leaf-count]')]
    .map((cluster) => Number(cluster.getAttribute('data-leaf-count')))
    .filter((count) => count > 1)
  return singles + clusters.reduce((sum, count) => sum + count, 0)
}
const showRole = (name: string) => fireEvent.click(screen.getByRole('button', { name }))
function expectChildBalance(container: HTMLElement, leaves: number) {
  const card = screen.getByText('Today', { selector: '.child-kicker' }).closest('section')!
  expect(card.textContent).toContain(` · ${leaves} ${leaves === 1 ? 'leaf' : 'leaves'}.`)
  expect(card.textContent).not.toContain('earned leaves shining')
  expect(renderedLeaves(container)).toBe(leaves)
}

beforeEach(() => { vi.useFakeTimers(); clock('2026-10-01') })
afterEach(() => { cleanup(); injected.repository = null; vi.useRealTimers(); vi.restoreAllMocks() })

describe('actual remaining leaf display', () => {
  it.each([
    [16, '2026-10-01', 16],
    [16, '2026-10-05', 11],
    [16, '2026-10-08', 6],
    [16, '2026-10-11', 1],
    [3, '2026-10-05', 0],
    [0, '2026-10-05', 0],
    [300, '2026-10-05', 295],
  ] as const)('shows %i earned leaves through %s as %i in both pages and SVG after reload', (earned, date, remaining) => {
    const { repository, storage } = setup(earned)
    repository.activateLeafPunishment()
    clock(date)
    repository.reconcileLeafPunishment()
    const ledger = repository.getLeafPunishmentLedger()
    for (const current of [repository, createLocalRepository(storage, 'UTC')]) {
      injected.repository = current
      storage.setItem.mockClear()
      const view = render(<App />)
      expect(screen.getByText(`Leaves ${remaining}`)).toBeTruthy()
      expect(renderedLeaves(view.container)).toBe(remaining)
      showRole('Child')
      expectChildBalance(view.container, remaining)
      expect(current.getLeafState()).toMatchObject({ earnedLeafCount: earned, visibleLeafCount: remaining })
      expect(current.getLeafPunishmentBalance().availableLeafCount).toBe(remaining)
      expect(current.getLeafPunishmentLedger()).toEqual(ledger)
      expect(storage.setItem).not.toHaveBeenCalled()
      view.unmount()
    }
  })

  it('refreshes both pages through the existing lifecycle and subscription when penalties become due', () => {
    const { repository } = setup()
    const view = render(<App />)
    expect(renderedLeaves(view.container)).toBe(16)
    act(() => { vi.advanceTimersByTime(3.5 * 86_400_000) })
    expect(screen.getByText('Leaves 11')).toBeTruthy()
    expect(renderedLeaves(view.container)).toBe(11)
    showRole('Child')
    act(() => { vi.advanceTimersByTime(3 * 86_400_000) })
    expectChildBalance(view.container, 6)
    expect(repository.getLeafState().earnedLeafCount).toBe(16)
    expect(vi.getTimerCount()).toBe(1)
  })

  it.each([3, 16])('restores only deducted foliage after a correction with %i initial leaves', (earned) => {
    const { repository, storage } = setup(earned)
    repository.activateLeafPunishment()
    clock('2026-10-05')
    repository.reconcileLeafPunishment()
    const view = render(<App />)
    showRole('Child')
    expectChildBalance(view.container, Math.max(0, earned - 5))
    act(() => { repository.savePracticeRecord(practice('2026-10-03')) })
    expectChildBalance(view.container, earned)
    showRole('Parent')
    expect(screen.getByText(`Leaves ${earned}`)).toBeTruthy()
    expect(repository.getLeafGrowthEvents()).toEqual([])
    view.unmount()
    injected.repository = createLocalRepository(storage, 'UTC')
    const reopened = render(<App />)
    expect(renderedLeaves(reopened.container)).toBe(earned)
    expect(screen.getByText(`Leaves ${earned}`)).toBeTruthy()
  })

  it('does not hide extra leaves at low health or restore punished leaves on health recovery', () => {
    const { repository } = setup()
    repository.activateLeafPunishment()
    repository.savePracticeRecord({ ...practice('2026-10-01', 20), quality: 'difficult' })
    clock('2026-10-05')
    repository.reconcileLeafPunishment()
    const events = repository.getLeafGrowthEvents()
    expect(repository.getCurrentHealth()).toBeLessThan(60)
    expect(repository.getLeafState()).toMatchObject({ earnedLeafCount: 17, visibleLeafCount: 12 })
    const view = render(<App />)
    expect(renderedLeaves(view.container)).toBe(12)
    act(() => {
      for (const parentNote of ['first', 'second']) repository.savePracticeRecord({ ...practice('2026-10-05'), quality: 'focused', improvement: 'clear', achievements: ['assigned_section'], parentNote })
    })
    expect(repository.getCurrentHealth()).toBeGreaterThanOrEqual(60)
    expect(repository.getLeafGrowthEvents()).toEqual(events)
    expect(repository.getLeafState()).toMatchObject({ earnedLeafCount: 17, visibleLeafCount: 12 })
    showRole('Child')
    expectChildBalance(view.container, 12)
    showRole('Parent')
    expect(screen.getByText('Leaves 12')).toBeTruthy()
  })

  it('preserves the same remaining leaves across stages 1–5', () => {
    const { repository } = setup()
    repository.activateLeafPunishment()
    clock('2026-10-05')
    repository.reconcileLeafPunishment()
    const ledger = repository.getLeafPunishmentLedger()
    for (const stage of [1, 2, 3, 4, 5]) {
      repository.saveTreeState({ ...repository.getTreeState(), stage })
      const view = render(<App />)
      expect(screen.getByRole('img', { name: `Music tree stage ${stage}` })).toBeTruthy()
      expect(screen.getByText('Leaves 11')).toBeTruthy()
      expect(renderedLeaves(view.container)).toBe(11)
      showRole('Child')
      expectChildBalance(view.container, 11)
      expect(repository.getLeafPunishmentLedger()).toEqual(ledger)
      expect(repository.getLeafState().earnedLeafCount).toBe(16)
      view.unmount()
    }
  })

  it('keeps rewards based on lifetime earnings after deductions', () => {
    const { repository, storage } = setup(29)
    repository.activateLeafPunishment()
    clock('2026-10-05')
    repository.reconcileLeafPunishment()
    repository.savePracticeRecord(practice('2026-10-05', 20))
    expect(repository.getLeafState()).toMatchObject({ earnedLeafCount: 30, visibleLeafCount: 25 })
    expect(repository.getRewardReminders()).toContainEqual(expect.objectContaining({ leafMilestone: 30 }))
    const reminders = repository.getRewardReminders()
    clock('2026-10-09')
    repository.reconcileLeafPunishment()
    const reloaded = createLocalRepository(storage, 'UTC')
    expect(reloaded.getLeafState()).toMatchObject({ earnedLeafCount: 30, visibleLeafCount: 20 })
    expect(reloaded.getRewardReminders()).toEqual(reminders)
  })

  it('does not activate, reconcile, or persist during selectors and server rendering', () => {
    const { repository, storage } = setup()
    repository.activateLeafPunishment()
    clock('2026-10-05') // A penalty is due, but reads must not apply it.
    const before = repository.exportBackupJson()
    const reconcile = vi.spyOn(repository, 'reconcileLeafPunishment')
    storage.setItem.mockClear()
    for (let index = 0; index < 2; index += 1) {
      expect(repository.getLeafState().visibleLeafCount).toBe(16)
      repository.getLeafPunishmentBalance()
      expect(renderToStaticMarkup(<App />)).toContain('Leaves 16')
    }
    expect(repository.exportBackupJson()).toBe(before)
    expect(storage.setItem).not.toHaveBeenCalled()
    expect(reconcile).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })
})
