import { useEffect, useRef, useState, type ReactNode } from 'react'
import { localRepository, STORAGE_KEY } from '../data/localRepository'
import { CLOUD_CACHE_OWNER_KEY, type CacheStorage } from '../data/cloudLocalCache'
import { createCloudSync, initialCloudSyncView } from '../data/cloudSync'
import { createCloudMusicTreeRepository, type CloudMusicTreeRepository } from '../data/cloudMusicTreeRepository'
import { supabase } from '../lib/supabase'
import './cloud.css'

function downloadBackup(json: string, name: string) {
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = name + '.json'
  link.click()
  URL.revokeObjectURL(url)
}

export function CloudGate({
  userId, children, cloud, repository = localRepository, storage,
}: {
  userId: string
  children: ReactNode
  cloud?: CloudMusicTreeRepository
  repository?: typeof localRepository
  storage?: CacheStorage
}) {
  const [view, setView] = useState(initialCloudSyncView)
  const controller = useRef<ReturnType<typeof createCloudSync> | null>(null)

  useEffect(() => {
    const abort = new AbortController()
    const sync = createCloudSync({
      userId, repository, storage: storage ?? window.localStorage,
      cloud: cloud ?? createCloudMusicTreeRepository(supabase!, abort.signal),
      onChange: setView,
    })
    controller.current = sync
    void sync.start()
    const onStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY || event.key === CLOUD_CACHE_OWNER_KEY || event.key === null) sync.pauseForExternalChange()
    }
    const onOnline = () => {
      if (sync.getView().phase === 'ready' && sync.getView().saveStatus === 'offline') void sync.retry()
    }
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      const current = sync.getView()
      if (current.phase === 'ready' && current.saveStatus !== 'saved') {
        event.preventDefault()
        event.returnValue = ''
      }
    }
    window.addEventListener('storage', onStorage)
    window.addEventListener('online', onOnline)
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => {
      sync.stop()
      abort.abort()
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('online', onOnline)
      window.removeEventListener('beforeunload', onBeforeUnload)
      controller.current = null
    }
  }, [cloud, repository, storage, userId])

  const exportLocal = () => {
    const json = controller.current?.exportLocal()
    if (json) downloadBackup(json, 'music-tree-local-backup')
  }
  const safetyBackup = view.safetyCopy && <button type="button" onClick={() => downloadBackup(view.safetyCopy!, 'music-tree-previous-local-backup')}>Export previous local copy</button>

  if (view.phase === 'loading') return <main className="cloud-loading"><p role="status">Loading your cloud Music Tree...</p></main>
  if (view.phase === 'ready') return <>
    <section className="cloud-status" aria-label="Cloud saving">
      <p role="status">{view.saveStatus === 'saving' ? 'Saving to cloud...' : view.saveStatus === 'offline' ? view.message : view.message || 'Saved to cloud'}</p>
      {view.saveStatus === 'offline' && <button type="button" onClick={() => void controller.current?.retry()}>Retry cloud save</button>}
      {safetyBackup}
    </section>
    {children}
  </>

  return <main className="cloud-loading">
    <section className="cloud-setup" aria-labelledby="cloud-title">
      <h1 id="cloud-title">Your Music Tree</h1>
      {view.phase === 'migration' ? <>
        <p>No cloud Music Tree exists yet. This device has an existing Music Tree.</p>
        <p>Only continue if this is the tree you want to use with the signed-in account. Local data may belong to another or an unknown account.</p>
        {view.localOwner && view.localOwner !== userId && <p role="alert">This local copy was previously used by a different account.</p>}
        <button className="cloud-primary" type="button" onClick={() => void controller.current?.useLocal()}>Use this device's existing Music Tree</button>
      </> : view.phase === 'empty' ? <>
        <p>No cloud Music Tree exists yet.</p>
        <p>If you already use Music Tree on another device, open that device first and sign in there to move your existing tree to the cloud.</p>
        <p>Only create a new tree if you have no existing Music Tree to move.</p>
        <button type="button" onClick={() => void controller.current?.createNew()}>Create a new Music Tree</button>
      </> : <p role="alert">{view.message}</p>}
      {(view.phase === 'migration' || view.phase === 'empty') &&
        <button type="button" onClick={() => void controller.current?.reloadLatest()}>Check cloud again</button>}
      {view.phase === 'error' && <button type="button" onClick={() => void controller.current?.retry()}>Retry cloud load</button>}
      {view.phase === 'conflict' && <>
        <p>Your local copy is still available to export. Reloading keeps a safety copy before loading the cloud version.</p>
        <button type="button" onClick={() => void controller.current?.reloadLatest()}>Reload latest version</button>
      </>}
      <button type="button" onClick={exportLocal}>Export local backup</button>
      {safetyBackup}
    </section>
  </main>
}