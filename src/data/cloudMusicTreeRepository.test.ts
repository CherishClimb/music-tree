import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createFreshState } from './localRepository'
import { CloudConflictError, createCloudMusicTreeRepository } from './cloudMusicTreeRepository'

const treeId = '00000000-0000-4000-8000-000000000001'
const revision = '2026-10-07T10:00:00.123456+00:00'
const row = (updatedAt = revision) => ({ music_tree_id: treeId, schema_version: 1, state: createFreshState(), updated_at: updatedAt })
function setup(result: { data: unknown; error: unknown }) {
  const query = {
    select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(), update: vi.fn().mockReturnThis(),
    abortSignal: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(result), maybeSingle: vi.fn().mockResolvedValue(result),
  }
  const from = vi.fn().mockReturnValue(query)
  const repository = createCloudMusicTreeRepository({ from } as unknown as SupabaseClient)
  return { repository, query, from }
}

describe('Supabase Music Tree adapter', () => {
  it('queries only the authenticated owner and does not choose arbitrarily among multiple trees', async () => {
    const { repository, query, from } = setup({ data: null, error: null })
    expect(await repository.findMusicTreeForUser(treeId)).toBeNull()
    expect(from).toHaveBeenCalledWith('music_trees')
    expect(query.eq).toHaveBeenCalledWith('owner_user_id', treeId)
    query.maybeSingle.mockResolvedValue({ data: null, error: { message: 'Multiple rows' } })
    await expect(repository.findMusicTreeForUser(treeId)).rejects.toThrow('Could not load')
  })
  it('uses a deterministic primary key to serialize concurrent first-tree creation', async () => {
    const tree = { id: treeId, owner_user_id: treeId, name: 'Music Tree' }
    const { repository, query } = setup({ data: tree, error: null })
    expect(await repository.createMusicTreeForUser(treeId)).toEqual(tree)
    expect(query.insert).toHaveBeenCalledWith(tree)
    query.single.mockResolvedValue({ data: null, error: { code: '23505' } })
    expect(await repository.createMusicTreeForUser(treeId)).toEqual(tree)
  })
  it('uses insert-only initial state creation, preserving schema and internal versions', async () => {
    const { repository, query } = setup({ data: row(), error: null })
    const state = { ...createFreshState(), unknownField: { retained: true } }
    await repository.createCloudState(treeId, state)
    expect(query.insert).toHaveBeenCalledWith(expect.objectContaining({ music_tree_id: treeId, state, schema_version: 1 }))
    expect(query.update).not.toHaveBeenCalled()
    query.single.mockResolvedValue({ data: null, error: { code: '23505' } })
    await expect(repository.createCloudState(treeId, state)).rejects.toBeInstanceOf(CloudConflictError)
  })
  it('conditions updates on both tree ID and the exact returned timestamp', async () => {
    const saved = row('2026-10-07T10:00:00.123457+00:00')
    const { repository, query } = setup({ data: saved, error: null })
    expect(await repository.updateCloudState(treeId, createFreshState(), revision)).toEqual(saved)
    expect(query.eq.mock.calls).toEqual([['music_tree_id', treeId], ['updated_at', revision]])
    const update = query.update.mock.calls[0][0]
    expect(update.schema_version).toBe(1)
    expect(update.state.version).toBe(1)
    expect(Date.parse(update.updated_at)).toBeGreaterThan(Date.parse(revision))
    expect(query.select).toHaveBeenCalledWith('music_tree_id,state,schema_version,updated_at')
  })
  it('turns a zero-row conditional update into a conflict without an insert fallback', async () => {
    const { repository, query } = setup({ data: null, error: null })
    await expect(repository.updateCloudState(treeId, createFreshState(), revision)).rejects.toBeInstanceOf(CloudConflictError)
    expect(query.insert).not.toHaveBeenCalled()
    expect(query.update).toHaveBeenCalledTimes(1)
  })
  it('rejects unsupported schema versions and invalid cloud state', async () => {
    const { repository, query } = setup({ data: { ...row(), schema_version: 2 }, error: null })
    await expect(repository.loadCloudState(treeId)).rejects.toThrow('unsupported')
    query.maybeSingle.mockResolvedValue({ data: { ...row(), state: {} }, error: null })
    await expect(repository.loadCloudState(treeId)).rejects.toThrow()
  })
  it('distinguishes a failed load from an absent cloud snapshot', async () => {
    const { repository } = setup({ data: null, error: { message: 'offline' } })
    await expect(repository.loadCloudState(treeId)).rejects.toThrow('Could not load')
  })
})