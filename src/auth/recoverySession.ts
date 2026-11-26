import type { SupabaseClient } from '@supabase/supabase-js'
import { readRecoveryCallback } from './passwordRecovery'

// Only an SDK recovery event can establish this document-local proof.
// Never retain tokens or authorize recovery from a restored ordinary session.
let observedRecoveryUserId: string | null = null

export function observeRecovery(client: SupabaseClient | null) {
  const callbackAtEntry = readRecoveryCallback()
  clearObservedRecovery()
  const observer = client?.auth.onAuthStateChange((event, session) => {
    if (event === 'PASSWORD_RECOVERY') {
      observedRecoveryUserId = callbackAtEntry.invalid ? null : session?.user.id ?? null
    } else if (event === 'SIGNED_OUT' || event === 'SIGNED_IN' || event === 'USER_UPDATED'
      || (observedRecoveryUserId !== null && session?.user.id !== observedRecoveryUserId)) {
      clearObservedRecovery()
    }
  })
  return () => {
    observer?.data.subscription.unsubscribe()
    clearObservedRecovery()
  }
}

export function getObservedRecoveryUserId() {
  return observedRecoveryUserId
}

export function hasObservedRecovery(userId: string | undefined) {
  return observedRecoveryUserId !== null && observedRecoveryUserId === userId
}

export function clearObservedRecovery() {
  observedRecoveryUserId = null
}
