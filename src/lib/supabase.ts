import { createClient } from '@supabase/supabase-js'
import { observeRecovery } from '../auth/recoverySession'

const url = import.meta.env.VITE_SUPABASE_URL
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

// Auth uses Supabase's own storage key. Music Tree's saved data is untouched.
export const supabase = url && publishableKey
  ? createClient(url, publishableKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  })
  : null

// Register before yielding: the SDK may consume the callback before React mounts.
const stopRecoveryObserver = observeRecovery(supabase)
if (import.meta.hot) import.meta.hot.dispose(stopRecoveryObserver)
