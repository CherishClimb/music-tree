import { createFreshState, type createLocalRepository } from './localRepository'
import { isMeaningfulLocalState, validateCloudState } from './cloudState'
import { bootstrapCloudForAuthenticatedUser, CloudConflictError, type CloudMusicTreeRepository, type CloudState } from './cloudMusicTreeRepository'
import { CLOUD_CACHE_OWNER_KEY, latestSafetyCopy, localCacheOwner, preserveLocalCopy, type CacheStorage } from './cloudLocalCache'

type LocalRepository = ReturnType<typeof createLocalRepository>
export type CloudSyncView = {
  phase: 'loading' | 'migration' | 'empty' | 'ready' | 'error' | 'conflict'
  saveStatus: 'saved' | 'saving' | 'offline'
  message: string
  localOwner: string | null
  safetyCopy: string | null
}
export const initialCloudSyncView: CloudSyncView = {
  phase: 'loading', saveStatus: 'saved', message: '', localOwner: null, safetyCopy: null,
}

export function createCloudSync({
  cloud, repository, storage, userId, onChange,
}: {
  cloud: CloudMusicTreeRepository
  repository: LocalRepository
  storage: CacheStorage
  userId: string
  onChange: (view: CloudSyncView) => void
}) {
  let active = true
  let generation = 0
  let view = { ...initialCloudSyncView }
  let unsubscribe: (() => void) | undefined
  let treeId: string | null = null
  let revision: string | null = null
  let pending: string | null = null
  let flushing = false

  const publish = (patch: Partial<CloudSyncView>) => {
    if (!active) return
    view = { ...view, ...patch }
    onChange(view)
  }
  const currentLocalState = () => validateCloudState(JSON.parse(repository.exportBackupJson()))
  const fail = (caught: unknown) => publish({
    phase: caught instanceof CloudConflictError ? 'conflict' : 'error',
    message: caught instanceof Error ? caught.message : 'Cloud access failed. Your local copy has been kept. Please retry.',
  })

  async function flush() {
    if (!active || flushing || view.phase !== 'ready' || !pending || !treeId || !revision) return
    flushing = true
    const ticket = generation
    try {
      while (pending && active && ticket === generation) {
        const json = pending
        pending = null
        publish({ saveStatus: 'saving', message: '' })
        try {
          const saved = await cloud.updateCloudState(treeId, validateCloudState(JSON.parse(json)), revision)
          if (!active || ticket !== generation) return
          revision = saved.updated_at
          publish({ saveStatus: pending ? 'saving' : 'saved' })
        } catch (caught) {
          if (!active || ticket !== generation) return
          pending = pending ?? json
          if (caught instanceof CloudConflictError) {
            unsubscribe?.()
            unsubscribe = undefined
            publish({ phase: 'conflict', message: caught.message })
          } else {
            publish({ saveStatus: 'offline', message: 'Changes are saved on this device. Cloud saving is unavailable. Check your connection and retry.' })
          }
          return
        }
      }
    } finally {
      flushing = false
      if (active && ticket !== generation && view.phase === 'ready' && pending) void flush()
    }
  }

  function installCloud(snapshot: CloudState, message = '', keepLocal = false) {
    const state = validateCloudState(snapshot.state)
    const json = JSON.stringify(state)
    let safetyCopy = latestSafetyCopy(storage)
    if (!keepLocal) {
      const previousCopy = preserveLocalCopy(storage, json)
      safetyCopy = previousCopy ?? safetyCopy
      if (previousCopy && !message) message = 'Loaded the cloud Music Tree. A safety copy of the previous local data is available to export.'
      repository.loadSnapshot(json)
    }
    storage.setItem(CLOUD_CACHE_OWNER_KEY, userId)
    treeId = snapshot.music_tree_id
    revision = snapshot.updated_at
    pending = null
    unsubscribe?.()
    unsubscribe = repository.subscribeToPersistence((localJson) => {
      if (!active || view.phase !== 'ready') return
      pending = localJson
      void flush()
    })
    publish({ phase: 'ready', saveStatus: 'saved', message, localOwner: userId, safetyCopy })
  }

  async function load() {
    const ticket = ++generation
    unsubscribe?.()
    unsubscribe = undefined
    publish({ phase: 'loading', message: '' })
    try {
      const resolution = await bootstrapCloudForAuthenticatedUser(cloud, userId, currentLocalState())
      if (!active || ticket !== generation) return
      if (resolution.kind === 'cloud') installCloud(resolution.snapshot)
      else publish({
        phase: resolution.kind, localOwner: localCacheOwner(storage),
        safetyCopy: latestSafetyCopy(storage), saveStatus: 'saved',
      })
    } catch (caught) {
      if (active && ticket === generation) fail(caught)
    }
  }

  async function initialize(choice: 'local' | 'new') {
    if (!active || (view.phase !== 'migration' && view.phase !== 'empty')) return
    const ticket = ++generation
    publish({ phase: 'loading', message: '' })
    try {
      const localState = currentLocalState()
      // Re-read cloud at confirmation time. Never trust the earlier empty result.
      const resolution = await bootstrapCloudForAuthenticatedUser(cloud, userId, localState)
      if (!active || ticket !== generation) return
      if (resolution.kind === 'cloud') {
        installCloud(resolution.snapshot, 'An existing cloud Music Tree was found and loaded.')
        return
      }
      if (choice === 'local' && !isMeaningfulLocalState(localState)) throw new Error('This device has no existing Music Tree to migrate. Check the cloud again.')
      if (choice === 'new' && isMeaningfulLocalState(localState)) throw new Error('This device now has existing data. Check the cloud again before choosing what to migrate.')
      const tree = resolution.tree ?? await cloud.createMusicTreeForUser(userId)
      if (!active || ticket !== generation) return
      const snapshot = await cloud.createCloudState(tree.id, choice === 'local' ? localState : createFreshState())
      if (!active || ticket !== generation) return
      installCloud(snapshot, choice === 'local' ? 'This device\'s Music Tree is now saved to your cloud account.' : 'Your new Music Tree is saved to your cloud account.', choice === 'local')
    } catch (caught) {
      if (active && ticket === generation) fail(caught)
    }
  }

  return {
    start: load,
    useLocal: () => initialize('local'),
    createNew: () => initialize('new'),
    retry: () => view.phase === 'ready' ? flush() : load(),
    reloadLatest: load,
    getView: () => view,
    exportLocal: () => repository.exportBackupJson(),
    pauseForExternalChange: () => {
      if (!active) return
      ++generation
      unsubscribe?.()
      unsubscribe = undefined
      // Another tab may already have replaced the shared localStorage key.
      // Preserve this tab's in-memory edits independently before reloading.
      let safetyCopy = view.safetyCopy
      try { safetyCopy = preserveLocalCopy(storage, undefined, repository.exportBackupJson()) ?? safetyCopy }
      catch { /* The in-memory copy remains available through Export local backup. */ }
      publish({ phase: 'conflict', safetyCopy, message: 'Music Tree changed in another tab. Reload the latest version before continuing.' })
    },
    stop: () => {
      active = false
      ++generation
      unsubscribe?.()
      unsubscribe = undefined
      pending = null
      treeId = null
      revision = null
    },
  }
}