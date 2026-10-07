# Phase 2: cloud persistence and first-device migration

Implementation only: **do not deploy or migrate the phone until this change is reviewed.**

## Architecture

- `AuthGate` resolves Supabase Auth, then provides the authenticated user to a keyed `CloudGate`. The editable application mounts only after cloud resolution.
- `cloudMusicTreeRepository.ts` is the Supabase table adapter. It reads one tree per owner and stores the complete existing `PersistedState` JSON. Both `schema_version` and the internal `state.version` remain 1.
- `cloudState.ts` reuses the existing backup validator, checks snapshot structure, and compares local data with `createFreshState()`. Only default reward timestamps, the default reward-progress timestamp, and the optional initial-baseline marker are ignored for the fresh-state comparison. Unknown persisted changes count as meaningful.
- `localRepository.ts` adds a notification after its existing successful persistence point and a validated snapshot hydration method that does not notify subscribers. No growth, stage, lesson, water, health, leaf, root, reward, or Fresh State rules change.
- `cloudSync.ts` subscribes to local persistence and sends complete snapshots through a serial save queue. Several edits during an in-flight save are coalesced into the latest full snapshot. Each successful response supplies the next expected cloud timestamp.
- Existing Export Backup / Import Backup controls remain available. Explicit backup imports use the same local persistence point and therefore sync to cloud.

## Bootstrap choices

| Cloud | Local | Result |
| --- | --- | --- |
| Valid state exists | Any | Validate and load cloud; never upload the old local state automatically. |
| Tree exists but state is missing | Meaningful | Require **Use this device's existing Music Tree**. Reuse the existing tree. |
| No tree/state | Meaningful | Require **Use this device's existing Music Tree** before creating or uploading anything. |
| Missing cloud state | Untouched Fresh State | Show other-device instructions. No tree or snapshot is created automatically. |
| Missing cloud state | Explicit **Create a new Music Tree** | Recheck cloud, then create a Fresh State only if it is still empty. |

Confirmation rechecks cloud before writing. New tree IDs use the authenticated user's UUID as a deterministic primary key, so simultaneous first-device confirmations converge on one tree without a schema change. Previously existing tree IDs are reused. Initial states use INSERT, never UPSERT. A primary-key collision cannot overwrite a snapshot uploaded by another device. Multiple existing trees for one owner produce a load error rather than selecting one arbitrarily.

Local data from an unknown or different account always needs the same explicit migration confirmation. Signing in alone never assigns that local data to the new account.

## Conflict and offline behavior

Every ongoing save filters on both `music_tree_id` and the exact last returned `updated_at`, then returns the updated row. The adapter explicitly advances `updated_at`; if the database has an update trigger, the returned database value becomes the next expected timestamp. PostgreSQL timestamp precision is retained in the equality filter. Schema version is never a save counter.

A zero-row update stops cloud writes and replaces the editable UI with a conflict message. **Reload latest version** preserves the local snapshot before loading cloud. No automatic merge or last-write-wins fallback exists.

A failed save keeps changes locally and shows **Retry cloud save**. Reconnection retries pending saves while the app is open. If the original request committed but its response was lost, retrying safely produces a conflict rather than overwriting a newer state.

Starting or refreshing the app requires a successful cloud lookup before editing. On refresh, cloud remains authoritative: unsynced local edits are archived before loading cloud, not automatically replayed. **Export previous local copy** can recover them for review; importing any backup is an explicit full replacement and still uses conditional cloud saving.

Logout unsubscribes and discards in-memory pending work, aborts requests where possible, and leaves localStorage intact. An already accepted server request cannot be undone; late responses cannot update the next account's cache. Changes in another browser tab pause editing to avoid reusing stale in-memory data.

## Local safety copies

The active cache stays at `music-tree:mvp:v1`. Before cloud replaces a different local snapshot, its exact JSON is saved under a new `music-tree:cloud-safety:v1:<uuid>` key. No previous safety key is deleted or reused. `music-tree:cloud-safety-latest:v1` points to the latest exportable safety copy, and `music-tree:cloud-owner:v1` records the cache's last cloud owner.

Safety copies consume browser storage. If a safety copy cannot be written (for example, storage quota is exhausted), hydration stops rather than discarding the old local snapshot. Export local data before manually managing browser storage. These copies are local recovery aids; they do not grant cloud access or bypass RLS.

## Manual Supabase checks before the later migration

No schema changes, live data writes, or deployments are performed by this implementation.

Verify the existing RLS policies, not just that RLS is enabled:

- `music_trees`: authenticated users can SELECT their own rows and INSERT a row whose `owner_user_id = auth.uid()`. Inserts must permit the explicitly supplied UUID `id`.
- `music_tree_states`: SELECT, INSERT, and UPDATE must be restricted to rows whose parent tree belongs to `auth.uid()`. INSERT/UPDATE checks must enforce that same ownership.
- UPDATE permissions must allow changing `state`, `schema_version`, and `updated_at`, and SELECT policies must allow the updated row to be returned.
- If a trigger overrides `updated_at`, ensure it changes on every successful update. Do not use a fixed timestamp trigger.
- If an account already has multiple `music_trees` rows, review those rows manually before choosing a canonical tree. The application deliberately does not delete or guess.
- Keep the existing public URL/publishable-key configuration and Auth redirect/email setup. No service-role key is used.

Supabase reference: [conditional updates and returning rows](https://supabase.com/docs/reference/javascript/update).

## Review and later phone migration

1. Review this implementation and validation results. Do not deploy yet.
2. Before the later migration, use the phone's existing **Export complete backup** and retain that file.
3. After an approved deployment, sign in on the phone and choose **Use this device's existing Music Tree**. Check the success message and existing history.
4. On the desktop, choose **Check cloud again** or sign in again. Do not choose **Create a new Music Tree** if the phone holds the real data.
5. Verify the downloaded tree, then make a small edit and wait for **Saved to cloud**.
6. Test a deliberate stale-device conflict using test data before relying on concurrent editing.

Automated tests mock Supabase and cover the adapter, synchronization controller, and React auth/cloud boundaries. Live project RLS, phone data, email delivery, and multi-device network behavior require the later approved smoke test.