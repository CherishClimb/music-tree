// Root-based callbacks work on GitHub Pages without a new client-side router.
export const PRODUCTION_RECOVERY_URL = 'https://music.curigrove.com/?auth=recovery'
export const RECOVERY_EVENT_WAIT_MS = 3000

export function passwordRecoveryRedirect(origin = window.location.origin) {
  if (origin === 'http://localhost:5173' || origin === 'http://127.0.0.1:5173') {
    return origin + '/?auth=recovery'
  }
  return PRODUCTION_RECOVERY_URL
}

export function readRecoveryCallback(search = window.location.search, hash = window.location.hash) {
  const query = new URLSearchParams(search)
  const fragment = new URLSearchParams(hash.replace(/^#/, ''))
  const requested = query.get('auth') === 'recovery' || query.get('type') === 'recovery'
    || fragment.get('type') === 'recovery'
  const invalid = requested && ['error', 'error_code', 'error_description']
    .some((key) => query.has(key) || fragment.has(key))
  return { requested, invalid }
}

// Keep the non-secret marker until completion: a refresh must not turn an
// unfinished recovery session into ordinary app access. The SDK owns tokens.
export function markRecoveryView() {
  const url = new URL(window.location.href)
  url.searchParams.set('auth', 'recovery')
  window.history.replaceState(null, '', url)
}

export function clearRecoveryLocation() {
  const url = new URL(window.location.href)
  if (url.searchParams.get('auth') === 'recovery') url.searchParams.delete('auth')
  for (const key of ['type', 'error', 'error_code', 'error_description']) url.searchParams.delete(key)
  const fragment = new URLSearchParams(url.hash.slice(1))
  if (['access_token', 'refresh_token', 'error', 'error_code', 'type'].some((key) => fragment.has(key))) {
    url.hash = ''
  }
  window.history.replaceState(null, '', url)
}
