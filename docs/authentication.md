# Supabase authentication

Authentication wraps the existing application in `src/auth/AuthGate.tsx`. After authentication, Phase 2 resolves cloud persistence before rendering the editable application. Auth and cloud persistence remain separate from the existing role selection and progression rules. See [cloud persistence and migration](cloud-persistence.md).

## Configuration

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in the ignored `.env.local`, then restart Vite. Use the project's public publishable key, never a service-role or secret key. Vite embeds these public settings into the browser build.

For GitHub Pages, add repository **Actions variables** with these same two names before deploying. The Pages workflow passes them to the build; `.env.local` is never uploaded or committed. Missing settings show a configuration message instead of exposing the application.

In Supabase Auth:

- Enable the Email provider and allow new signups.
- Set the Site URL to `https://cherishclimb.github.io/music-tree/`.
- Add that exact URL and your local Vite URL (normally `http://localhost:5173/`) to the allowed redirect URLs. Account creation requests confirmation back to the current origin and path.
- Keep email confirmation enabled if desired. The signup screen tells users to check their email when confirmation is required; otherwise Supabase signs them in immediately. Configure email delivery/SMTP as needed for production.

## Sessions and existing records

Supabase persists and refreshes its session using its own browser storage key. Refreshing the page first shows a loading state, then restores the session. Auth events also update the screen after login, logout, expiration, or changes in another tab. Logout signs out the current browser session; it does not clear Music Tree storage.

Music Tree still uses `music-tree:mvp:v1`. It is now the local cache and offline safety copy for the signed-in account's cloud tree. Meaningful local data is never uploaded to an account without an explicit migration choice. Untouched Fresh State never claims an empty cloud automatically. The MVP's parent/child/teacher permissions are unchanged.

Tests mock the Auth API and exercise the React boundary and forms. They do not create real accounts or send confirmation emails. A live signup/confirmation/login check requires a configured Supabase project.
