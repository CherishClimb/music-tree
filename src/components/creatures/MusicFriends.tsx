import { useId, useState, useSyncExternalStore, type ReactNode } from 'react'
import { localRepository } from '../../data/localRepository'
import { CREATURE_CATALOG, type CreatureId } from '../../domain/creatures/creatureCatalog'
import { selectVisibleCreatures, VISIBLE_CREATURE_LIMIT, type CreatureCollection } from '../../domain/creatures/creatureCollection'
import { CreatureIllustration } from './CreatureIllustration'
import './creatures.css'

type CreatureRepository = Pick<typeof localRepository, 'getCreatureCollection' | 'subscribeToPersistence' | 'sendCreatureHome' | 'showCreatureOnTree'>
export function MusicFriends({ children, repository = localRepository }: { children: ReactNode; repository?: CreatureRepository }) {
  const snapshot = useSyncExternalStore(repository.subscribeToPersistence,
    () => JSON.stringify(repository.getCreatureCollection()), () => JSON.stringify(repository.getCreatureCollection()))
  const collection = JSON.parse(snapshot) as CreatureCollection
  const visible = selectVisibleCreatures(collection)
  const arrival = visible.find((owned) => owned.newlyUnlocked)
  const arrivalDefinition = CREATURE_CATALOG.find((item) => item.id === arrival?.creatureId)
  const [open, setOpen] = useState(false)
  const [error, setError] = useState('')
  const panelId = useId()
  const act = (id: CreatureId, home: boolean) => {
    try {
      if (home) repository.sendCreatureHome(id)
      else repository.showCreatureOnTree(id)
      setError('')
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Your friend could not be saved. Please try again.') }
  }
  return <div className="music-friends">
    <div className="music-friends-world">
      {children}
      {visible.map((owned) => <div key={owned.creatureId} className={`creature-visitor creature-slot-${owned.visibleSlotId}${owned.newlyUnlocked ? ' creature-arrival' : ''}`} data-creature-id={owned.creatureId}>
        <CreatureIllustration creatureId={owned.creatureId} idle />
        <button type="button" className="creature-home-action" aria-label={`Send ${CREATURE_CATALOG.find((item) => item.id === owned.creatureId)!.displayName} home`} onClick={() => act(owned.creatureId, true)}>Send home</button>
      </div>)}
    </div>
    {arrival && arrivalDefinition && <div className="creature-welcome" role="status">
      <span className="creature-welcome-star" aria-hidden="true">✧</span>
      <div><span className="creature-eyebrow">A new music friend!</span><strong>{arrivalDefinition.displayName}</strong><span>{arrivalDefinition.description}</span></div>
    </div>}
    <button type="button" className="music-friends-toggle" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen(!open)}>
      <span aria-hidden="true">⌂</span> Music Friends <span className="creature-count">{collection.ownedCreatures.length} / {CREATURE_CATALOG.length}</span>
    </button>
    {error && <p className="creature-error" role="alert">{error}</p>}
    {open && <section id={panelId} className="creature-home" aria-label="Creature Home">
      <div className="creature-home-heading"><h2>Creature Home</h2><p>{collection.ownedCreatures.length === CREATURE_CATALOG.length ? 'All six friends are here.' : 'A little home for your musical friends.'}</p></div>
      <div className="creature-home-grid">
        {CREATURE_CATALOG.map((creature) => {
          const owned = collection.ownedCreatures.find((item) => item.creatureId === creature.id)
          const full = visible.length >= VISIBLE_CREATURE_LIMIT
          return <article key={creature.id} className={`creature-home-card${owned ? '' : ' creature-locked'}`}>
            <CreatureIllustration creatureId={creature.id} decorative />
            <h3>{creature.displayName}</h3>
            <p>{!owned ? 'Not here yet' : owned.newlyUnlocked ? (owned.visibleSlotId ? 'New friend!' : 'Waiting to say hello') : owned.atHome ? creature.musicalConcept : 'Visiting your tree'}</p>
            {owned ? <button type="button" disabled={owned.atHome && full} aria-label={`${owned.atHome ? 'Show' : 'Send'} ${creature.displayName} ${owned.atHome ? 'on tree' : 'home'}`} onClick={() => act(creature.id, !owned.atHome)}>{owned.atHome ? 'Show on tree' : 'Send home'}</button> : <span className="creature-locked-label">Locked</span>}
          </article>
        })}
      </div>
      {visible.length >= VISIBLE_CREATURE_LIMIT && <p className="creature-capacity">Two friends are visiting. Send one home to invite another.</p>}
    </section>}
  </div>
}
