import { lazy, Suspense } from 'react'
import { AuthGate } from './AuthGate'

// Importing the application initializes its local repository; wait for sign-in.
const CloudApp = lazy(() => import('../cloud/CloudApp'))

export function AuthenticatedApp() {
  return <AuthGate>{(user) =>
    <Suspense fallback={<main className="auth-screen"><p role="status">Loading Music Tree...</p></main>}>
      <CloudApp key={user.id} userId={user.id} />
    </Suspense>
  }</AuthGate>
}