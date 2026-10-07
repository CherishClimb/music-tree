import { STORAGE_KEY } from './localRepository'
import { canonicalJson } from './cloudState'

export type CacheStorage = Pick<Storage, 'getItem' | 'setItem'>
export const CLOUD_CACHE_OWNER_KEY = 'music-tree:cloud-owner:v1'
export const LAST_SAFETY_COPY_KEY = 'music-tree:cloud-safety-latest:v1'
export const SAFETY_COPY_PREFIX = 'music-tree:cloud-safety:v1:'

export function localCacheOwner(storage: CacheStorage): string | null {
  return storage.getItem(CLOUD_CACHE_OWNER_KEY)
}

// Never delete or reuse a safety-copy key. A quota error stops cloud hydration,
// leaving the current local state in place rather than losing the safety copy.
export function preserveLocalCopy(storage: CacheStorage, incomingJson?: string, localJson = storage.getItem(STORAGE_KEY)): string | null {
  if (!localJson) return null
  if (incomingJson && canonicalJson(JSON.parse(localJson)) === canonicalJson(JSON.parse(incomingJson))) return null
  const key = SAFETY_COPY_PREFIX + crypto.randomUUID()
  storage.setItem(key, localJson)
  storage.setItem(LAST_SAFETY_COPY_KEY, key)
  return localJson
}

export function latestSafetyCopy(storage: CacheStorage): string | null {
  const key = storage.getItem(LAST_SAFETY_COPY_KEY)
  return key?.startsWith(SAFETY_COPY_PREFIX) ? storage.getItem(key) : null
}