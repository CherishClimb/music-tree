# Supabase authentication

Authentication wraps the existing application in `src/auth/AuthGate.tsx`. After authentication, Phase 2 resolves cloud persistence before rendering the editable application. Auth and cloud persistence remain separate from the existing role selection and progression rules. See [cloud persistence and migration](cloud-persistence.md).

## Configuration

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in the ignored `.env.local`, then restart Vite. Use the project's public publishable key, never a service-role or secret key. Vite embeds these public settings into the browser build.

For GitHub Pages, add repository **Actions variables** with these same two names before deploying. The Pages workflow passes them to the build; `.env.local` is never uploaded or committed. Missing settings show a configuration message instead of exposing the application.

In Supabase Auth:

- Enable the Email provider and allow new signups.
- Production Site URL: `https://music.curigrove.com/`. On 2026-11-26, separately approved Phase 2 dashboard verification confirmed Music Tree project `elvfdppwiuhsdzoejwcb` and saved this Site URL plus the exact recovery callbacks below.
- Preserve the needed existing sign-up redirects. Account creation still requests confirmation back to the current origin and path. The existing `https://cherishclimb.github.io/music-tree/` and `https://music.curigrove.com/` redirects were preserved; the three exact recovery callbacks below were added (five entries total).
- Keep email confirmation enabled if desired. The signup screen tells users to check their email when confirmation is required; otherwise Supabase signs them in immediately. Configure email delivery/SMTP as needed for production.

## Sessions and existing records

Supabase persists and refreshes its session using its own browser storage key. Refreshing the page first shows a loading state, then restores the session. Auth events also update the screen after login, logout, expiration, or changes in another tab. Logout signs out the current browser session; it does not clear Music Tree storage.

Music Tree still uses `music-tree:mvp:v1`. It is now the local cache and offline safety copy for the signed-in account's cloud tree. Meaningful local data is never uploaded to an account without an explicit migration choice. Untouched Fresh State never claims an empty cloud automatically. The MVP's parent/child/teacher permissions are unchanged.

Tests mock the Auth API and exercise the React boundary and forms. They do not create real accounts or send confirmation emails. A live signup/confirmation/login check requires a configured Supabase project.

## Password recovery - MUSIC-TREE-AUTH-001

Phase 1 implements and tests the UI locally. Phase 2 was separately approved: the project and redirect settings above were verified/saved, and an authorized recovery request was accepted. The user reports receiving and opening the email; its local callback failed. An offline installed-SDK regression reproduced a listener-registration race, now corrected locally. After the correction, the Product Owner reported that recovery worked. This is user-reported live evidence, not an independently observed reset/login test. Subsequent login, old-password rejection, link reuse/expiry and live data preservation are not independently verified. Phase 3 requires independent Anthropic review before final acceptance. Production release remains separately approved.

### Flow and boundary

- Login includes **Forgot Password?**, an email-only request form and a generic confirmation regardless of account existence. It calls the existing client `auth.resetPasswordForEmail(email, { redirectTo })`. Provider/account details are not echoed in request errors. Busy guards prevent duplicate pending requests.
- Recovery stays at the application root with `?auth=recovery`, so GitHub Pages needs no new deep-route rewrite or client router. Configured Phase 2 callbacks are `https://music.curigrove.com/?auth=recovery`, `http://localhost:5173/?auth=recovery` and `http://127.0.0.1:5173/?auth=recovery`. Local callback selection accepts only these fixed local origins; other origins select production. These exact entries were saved in the allowlist during Phase 2; live completion must still verify that email delivery returns to the intended callback. Do not add a broad production wildcard.
- The marker selects recovery UI only. The SDK must establish a valid `PASSWORD_RECOVERY` session before the form is enabled. An ordinary restored session, invalid callback or supplied marker cannot enable password submission. Recovery takes precedence over the editable/cloud app, including session refresh and `USER_UPDATED` events. The existing client settings and SDK token processing remain unchanged. With the narrow client-file scope explicitly approved on 2026-11-26, an observer now registers synchronously immediately after client creation, before SDK initialization can emit recovery. It retains only the witnessed user ID in document memory so a delayed React mount can recognize that event. Sign-out, ordinary sign-in, user updates, identity changes and hot-disposal clear that proof; it is never persisted.
- New password and confirmation must match. The client retains the existing six-character minimum; Supabase still enforces the configured account password policy, which is not changed by this task. Submission sends only `auth.updateUser({ password })`, without changing metadata, roles, profiles or application records.
- Expired/invalid/used links, missing sessions and changed recovery-account identity fail closed and offer a new request. A page refresh after the SDK has consumed a callback cannot authorize recovery from the stored ordinary session: after initialization, absence of the recovery event produces an invalid-link message. Request a fresh email in that case. No custom recovery token or password is stored.
- After a successful update, recovery stays locked while the current browser session signs out with `scope: local`. Success returns to login; sign-out failure has an explicit finishing retry and does not submit the password again. Callback markers/errors are cleared only when leaving/finishing the recovery view. Existing practice storage and other application state are untouched.

### Verification and remaining phases

- Focused mocked checks: `npm test -- src/auth/RecoverySdkOrdering.test.tsx src/auth/PasswordRecovery.test.tsx src/auth/AuthGate.test.tsx src/cloud/CloudGate.test.tsx`. Existing full acceptance checks remain `npm test`, `npm run lint`, `npm run build`. The installed-SDK ordering regression uses synthetic credentials and fake fetch/storage to verify early-event retention, clearing on sign-out, and rejection of ordinary restored sessions/invalid callbacks. Unit tests and an intercepted local browser preview do not establish real email delivery or password changes.
- Phase 2, only after separate approval: confirm the intended Supabase project/access, inspect current Site URL and needed redirects, narrowly configure the exact callbacks and recovery template/delivery settings, and designate a non-child test account/mailbox. Test real delivery, normal TLS/callback behavior, reset, old-password rejection/new-password login, invalid/expired/reused links and unchanged user ID/profile/role/practice records. Keep live passwords, tokens and recovery links out of evidence.
- A later approved local callback can test real recovery without deploying this code. Testing the new production UI still requires a separately approved release. No live verification, production readiness or final task acceptance is implied by Phase 1 passing.

### Live verification handoff

After local checks passed, a fresh request for the already authorized non-child test account was accepted; the Product Owner subsequently reported recovery success. Do not request another email merely to repeat that handoff. The user must enter, confirm and submit the new password, and perform credential entry for login checks themselves. Never collect passwords or recovery links in chat or evidence. Keep the local server running during this handoff. Do not deploy to make the test pass.
