import { localCalendarDate } from '../domain/localCalendarDate'
import type { localRepository } from './localRepository'

type Repository = Pick<typeof localRepository, 'getLeafPunishmentLedger' | 'activateLeafPunishment' | 'reconcileLeafPunishment'>

// Find the next date boundary in the saved zone, including 23/25-hour DST days.
// This schedules one timeout at midnight; it does not poll for date changes.
const untilNextDate = (timeZone?: string) => {
  const now = Date.now()
  const today = localCalendarDate(now, timeZone)
  let before = now
  let after = now + 36 * 60 * 60 * 1000
  while (after - before > 1) {
    const middle = Math.floor((before + after) / 2)
    if (localCalendarDate(middle, timeZone) === today) before = middle
    else after = middle
  }
  return after - now
}

/** Start only after hydration, from an effect. Cleanup stops all future work. */
export function startLeafPunishmentLifecycle(repository: Repository, onError: (message: string | null) => void) {
  let checkedDate: string | null = null
  let timer: ReturnType<typeof setTimeout>
  let stopped = false

  const check = () => {
    if (stopped) return
    clearTimeout(timer)
    let timeZone: string | undefined
    try {
      const existing = repository.getLeafPunishmentLedger()
      const ledger = existing ?? repository.activateLeafPunishment()
      timeZone = ledger.timeZone
      const date = localCalendarDate(Date.now(), timeZone)
      if (!existing || date !== checkedDate) {
        repository.reconcileLeafPunishment()
        checkedDate = date
        onError(null)
      }
    } catch (error) {
      // Failed writes remain retryable on focus; never mark the date as checked.
      onError(error instanceof Error ? error.message : 'Leaf punishment could not be saved. Return to the app to retry.')
    }
    timer = setTimeout(check, untilNextDate(timeZone))
  }
  const onVisible = () => { if (document.visibilityState === 'visible') check() }
  window.addEventListener('focus', check)
  document.addEventListener('visibilitychange', onVisible)
  check()
  return () => {
    stopped = true
    clearTimeout(timer)
    window.removeEventListener('focus', check)
    document.removeEventListener('visibilitychange', onVisible)
  }
}
