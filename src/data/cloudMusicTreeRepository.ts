import type { SupabaseClient } from '@supabase/supabase-js'
import type { PersistedState } from './localRepository'
import { isMeaningfulLocalState, validateCloudState } from './cloudState'

export type CloudMusicTree = { id: string; owner_user_id: string; name: string }
export type CloudState = { music_tree_id: string; state: PersistedState; schema_version: 1; updated_at: string }
export interface CloudMusicTreeRepository {
  findMusicTreeForUser(userId: string): Promise<CloudMusicTree | null>
  createMusicTreeForUser(userId: string): Promise<CloudMusicTree>
  loadCloudState(musicTreeId: string): Promise<CloudState | null>
  createCloudState(musicTreeId: string, state: PersistedState): Promise<CloudState>
  updateCloudState(musicTreeId: string, state: PersistedState, expectedUpdatedAt: string): Promise<CloudState>
}
export class CloudConflictError extends Error {
  constructor() { super('This Music Tree was updated on another device. Reload the latest version before continuing.') }
}
const stateColumns = 'music_tree_id,state,schema_version,updated_at'

function readCloudRow(value: unknown): CloudState {
  const row = value as CloudState | null
  if (!row || row.schema_version !== 1 || typeof row.music_tree_id !== 'string' ||
    typeof row.updated_at !== 'string' || !Number.isFinite(Date.parse(row.updated_at))) {
    throw new Error('The cloud Music Tree has an unsupported or invalid snapshot. Your local copy has been kept.')
  }
  return { ...row, state: validateCloudState(row.state) }
}

export function createCloudMusicTreeRepository(client: SupabaseClient, signal = new AbortController().signal): CloudMusicTreeRepository {
  const repository: CloudMusicTreeRepository = {
    async findMusicTreeForUser(userId) {
      const { data, error } = await client.from('music_trees').select('id,owner_user_id,name')
        .eq('owner_user_id', userId).abortSignal(signal).maybeSingle()
      if (error) throw new Error('Could not load your cloud Music Tree. Check your connection and cloud access, then retry.', { cause: error })
      return data as CloudMusicTree | null
    },
    async createMusicTreeForUser(userId) {
      // One stable UUID per owner prevents two first devices from creating competing trees.
      // Existing trees with other IDs are still found and reused before this method is called.
      const { data, error } = await client.from('music_trees')
        .insert({ id: userId, owner_user_id: userId, name: 'Music Tree' })
        .select('id,owner_user_id,name').abortSignal(signal).single()
      if (error?.code === '23505') {
        const existing = await repository.findMusicTreeForUser(userId)
        if (existing) return existing
      }
      if (error || !data) throw new Error('Could not create your cloud Music Tree. Your local copy has been kept. Please retry.', { cause: error })
      return data as CloudMusicTree
    },
    async loadCloudState(musicTreeId) {
      const { data, error } = await client.from('music_tree_states').select(stateColumns)
        .eq('music_tree_id', musicTreeId).abortSignal(signal).maybeSingle()
      if (error) throw new Error('Could not load your cloud state. Your local copy has been kept. Please retry.', { cause: error })
      return data ? readCloudRow(data) : null
    },
    async createCloudState(musicTreeId, state) {
      const snapshot = validateCloudState(state)
      const { data, error } = await client.from('music_tree_states')
        .insert({ music_tree_id: musicTreeId, state: snapshot, schema_version: 1, updated_at: new Date().toISOString() })
        .select(stateColumns).abortSignal(signal).single()
      if (error?.code === '23505') throw new CloudConflictError()
      if (error || !data) throw new Error('The initial upload failed. Your local Music Tree is safe. Please retry.', { cause: error })
      return readCloudRow(data)
    },
    async updateCloudState(musicTreeId, state, expectedUpdatedAt) {
      const snapshot = validateCloudState(state)
      const expectedTime = Date.parse(expectedUpdatedAt)
      if (!Number.isFinite(expectedTime)) throw new Error('The cloud save version is invalid. Reload before saving.')
      // Advance even when several saves share a millisecond or a device clock is behind.
      // If the database has an updated_at trigger, its returned value is used instead.
      const updatedAt = new Date(Math.max(Date.now(), expectedTime + 1)).toISOString()
      const { data, error } = await client.from('music_tree_states')
        .update({ state: snapshot, schema_version: 1, updated_at: updatedAt })
        .eq('music_tree_id', musicTreeId).eq('updated_at', expectedUpdatedAt)
        .select(stateColumns).abortSignal(signal).maybeSingle()
      if (error) throw new Error('Cloud saving is unavailable. Changes are saved on this device. Check your connection and retry.', { cause: error })
      if (!data) throw new CloudConflictError()
      const saved = readCloudRow(data)
      if (saved.updated_at === expectedUpdatedAt) throw new Error('The cloud timestamp did not advance. Reload before saving again.')
      return saved
    },
  }
  return repository
}

export type CloudBootstrap =
  | { kind: 'cloud'; tree: CloudMusicTree; snapshot: CloudState }
  | { kind: 'migration' | 'empty'; tree: CloudMusicTree | null }

// Read-only: neither an empty browser nor a failed cloud load may create cloud data.
export async function bootstrapCloudForAuthenticatedUser(
  cloud: CloudMusicTreeRepository, userId: string, localState: PersistedState,
): Promise<CloudBootstrap> {
  const tree = await cloud.findMusicTreeForUser(userId)
  if (tree) {
    if (tree.owner_user_id !== userId) throw new Error('This cloud tree does not belong to the signed-in account.')
    const snapshot = await cloud.loadCloudState(tree.id)
    if (snapshot) {
      if (snapshot.music_tree_id !== tree.id || snapshot.schema_version !== 1) throw new Error('The cloud snapshot does not match this Music Tree.')
      validateCloudState(snapshot.state)
      return { kind: 'cloud', tree, snapshot }
    }
  }
  return { kind: isMeaningfulLocalState(localState) ? 'migration' : 'empty', tree }
}