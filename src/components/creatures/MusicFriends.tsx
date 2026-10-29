import { useId, useRef, useState, useSyncExternalStore, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import { localRepository } from '../../data/localRepository'
import { CREATURE_CATALOG, type CreatureId } from '../../domain/creatures/creatureCatalog'
import { selectVisibleCreatures, VISIBLE_CREATURE_LIMIT, type CreatureCollection } from '../../domain/creatures/creatureCollection'
import type { CreaturePosition } from '../../domain/creatures/creaturePosition'
import { CreatureIllustration } from './CreatureIllustration'
import './creatures.css'

type CreatureRepository = Pick<typeof localRepository, 'getCreatureCollection' | 'subscribeToPersistence' | 'sendCreatureHome' | 'showCreatureOnTree' | 'getCreaturePositions' | 'saveCreaturePosition'>
type DragState = { id: CreatureId; pointerId: number; offsetX: number; offsetY: number; startX: number; startY: number; original?: CreaturePosition; position?: CreaturePosition; moved: boolean }
const SAFE_INSET = 4
const DRAG_THRESHOLD = 3

function positionFromCenter(world: DOMRect, creature: DOMRect, centerX: number, centerY: number): CreaturePosition | null {
  if (world.width <= 0 || world.height <= 0) return null
  const halfWidth = creature.width / 2
  const halfHeight = creature.height / 2
  const minX = halfWidth + SAFE_INSET
  const maxX = world.width - halfWidth - SAFE_INSET
  const minY = halfHeight + SAFE_INSET
  const maxY = world.height - halfHeight - SAFE_INSET
  const x = minX > maxX ? world.width / 2 : Math.min(maxX, Math.max(minX, centerX - world.left))
  const y = minY > maxY ? world.height / 2 : Math.min(maxY, Math.max(minY, centerY - world.top))
  return { x: x / world.width, y: y / world.height }
}

export function MusicFriends({ children, repository = localRepository, placementEnabled = false }: { children: ReactNode; repository?: CreatureRepository; placementEnabled?: boolean }) {
  const snapshot = useSyncExternalStore(repository.subscribeToPersistence,
    () => JSON.stringify(repository.getCreatureCollection()), () => JSON.stringify(repository.getCreatureCollection()))
  const collection = JSON.parse(snapshot) as CreatureCollection
  const visible = selectVisibleCreatures(collection)
  const arrival = visible.find((owned) => owned.newlyUnlocked)
  const arrivalDefinition = CREATURE_CATALOG.find((item) => item.id === arrival?.creatureId)
  const [open, setOpen] = useState(false)
  const [error, setError] = useState('')
  const [positions, setPositions] = useState(() => repository.getCreaturePositions())
  const worldRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<DragState | null>(null)
  const panelId = useId()
  const restorePosition = (id: CreatureId, position?: CreaturePosition) => setPositions((current) => {
    if (position) return { ...current, [id]: position }
    const next = { ...current }
    delete next[id]
    return next
  })
  const persistPosition = (id: CreatureId, position: CreaturePosition, previous?: CreaturePosition) => {
    try {
      repository.saveCreaturePosition(id, position)
      setError('')
    } catch (caught) {
      restorePosition(id, previous)
      setError(caught instanceof Error ? caught.message : 'Your friend’s position could not be saved. Please try again.')
    }
  }
  const moveWithKeyboard = (event: KeyboardEvent<HTMLButtonElement>, id: CreatureId) => {
    const directions: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }
    const direction = directions[event.key]
    const world = worldRef.current
    if (!direction || !world) return
    event.preventDefault()
    const step = event.shiftKey ? 24 : 8
    const creature = event.currentTarget.getBoundingClientRect()
    const next = positionFromCenter(world.getBoundingClientRect(), creature,
      creature.left + creature.width / 2 + direction[0] * step,
      creature.top + creature.height / 2 + direction[1] * step)
    if (!next) return
    const previous = positions[id]
    setPositions((current) => ({ ...current, [id]: next }))
    persistPosition(id, next, previous)
  }
  const startDrag = (event: PointerEvent<HTMLButtonElement>, id: CreatureId) => {
    if (event.isPrimary === false || event.button !== 0) return
    const creature = event.currentTarget.getBoundingClientRect()
    dragRef.current = {
      id, pointerId: event.pointerId,
      offsetX: event.clientX - (creature.left + creature.width / 2),
      offsetY: event.clientY - (creature.top + creature.height / 2),
      startX: event.clientX, startY: event.clientY, original: positions[id], position: positions[id], moved: false,
    }
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }
  const continueDrag = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current
    const world = worldRef.current
    if (!drag || drag.pointerId !== event.pointerId || !world) return
    if (!drag.moved && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < DRAG_THRESHOLD) return
    event.preventDefault()
    const next = positionFromCenter(world.getBoundingClientRect(), event.currentTarget.getBoundingClientRect(), event.clientX - drag.offsetX, event.clientY - drag.offsetY)
    if (!next) return
    drag.moved = true
    drag.position = next
    setPositions((current) => ({ ...current, [drag.id]: next }))
  }
  const finishDrag = (event: PointerEvent<HTMLButtonElement>, cancelled = false) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    dragRef.current = null
    event.currentTarget.releasePointerCapture?.(event.pointerId)
    if (cancelled) restorePosition(drag.id, drag.original)
    else if (drag.moved && drag.position) persistPosition(drag.id, drag.position, drag.original)
  }
  const act = (id: CreatureId, home: boolean) => {
    try {
      if (home) repository.sendCreatureHome(id)
      else repository.showCreatureOnTree(id)
      setError('')
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Your friend could not be saved. Please try again.') }
  }
  return <div className="music-friends">
    <div ref={worldRef} className="music-friends-world">
      {children}
      {visible.map((owned) => {
        const definition = CREATURE_CATALOG.find((item) => item.id === owned.creatureId)!
        const position = placementEnabled ? positions[owned.creatureId] : undefined
        const style = position ? { '--creature-x': `${position.x * 100}%`, '--creature-y': `${position.y * 100}%` } as CSSProperties : undefined
        const className = `creature-visitor creature-slot-${owned.visibleSlotId}${owned.newlyUnlocked ? ' creature-arrival' : ''}`
        if (!placementEnabled) return <div key={owned.creatureId} className={className} data-creature-id={owned.creatureId}><CreatureIllustration creatureId={owned.creatureId} idle /></div>
        return <button key={owned.creatureId} type="button" className={className} data-creature-id={owned.creatureId} data-positioned={position ? 'true' : undefined} style={style}
          aria-label={`Move ${definition.displayName} on tree. Use arrow keys to reposition.`}
          onKeyDown={(event) => moveWithKeyboard(event, owned.creatureId)}
          onPointerDown={(event) => startDrag(event, owned.creatureId)} onPointerMove={continueDrag}
          onPointerUp={finishDrag} onPointerCancel={(event) => finishDrag(event, true)}>
          <CreatureIllustration creatureId={owned.creatureId} idle />
        </button>
      })}
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
