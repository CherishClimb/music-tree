# Leaf punishment persistence, lifecycle and display

Phase 2B.3 adds lifecycle calls after hydration. Phase 2C displays the remaining
leaf balance. Health, rewards, roots, stages, earning, and creature unlocks retain
their existing rules.

## Repository API and activation

- `activateLeafPunishment()` is an explicit, idempotent mutation. It records
  the activation instant, child's ID, repository timezone, opening earned total,
  and opening award dates. The first eligible date is the **next local day**:
  partial activation days and all earlier missed days are excluded.
- `reconcileLeafPunishment()` explicitly evaluates completed dates with Phase
  2A's calculator. It requires activation. Activated repositories also run the
  same calculation when saving, adding, or updating practice, including backdated
  records. The app also calls it after hydration and when the saved local date
  changes. Same-day holiday mutations still require an explicit call or a new
  app mount. Reads never reconcile or write.
- `getLeafPunishmentLedger()` returns a defensive copy.
- `getLeafPunishmentBalance()` returns lifetime earned, effective applied loss,
  and the remaining balance. It describes the last reconciled ledger; it does
  not perform reconciliation or write. `getLeafState().visibleLeafCount` now
  derives the same remaining balance for both pages and tree rendering.

Activation is per child and its timezone is retained across devices. A backward
clock/date relative to the stored checkpoint is rejected rather than interpreted
as a history correction. Existing holiday membership, including the current UTC
interpretation of `endedEarlyAt`, is reused without changing health rules.

## Accounting and corrections

`leafPunishment` is a version-1 ledger (or `null` for inactive). Each three-day
block uses the deterministic Phase 2A ID and retains its three missed dates,
scheduled loss of five, first assessment time and first capped loss. Every event
has append-only revisions with a deterministic event-ID/revision-number identity,
active status, applied loss and reconciliation time. The effective debit is the
**latest revision** of each event, never the sum of every revision.

Reconciliation replays the entire prospective schedule from corrected evidence.
Invalid blocks get an inactive, zero-loss revision; valid blocks receive any
necessary capped adjustment. Old assessment records/revisions remain available.
If a block becomes valid again, it retains the original assessment cap and ID.
An unchanged calculation produces no write or notification. Refunds are the
reduction in effective debits, not additional leaf awards or mutable credits.

The opening earned total funds the activation balance. Later earnings are
deduplicated by child/activity date and become available no earlier than BOTH
their activity date and their creation date in the saved timezone. Thus a leaf
earned today, including a newly backdated award, cannot fund an older penalty
found during an offline catch-up. Active penalties are capped chronologically
against earnings available by their third missed date minus preceding effective
losses. A block's first capped assessment is never increased. Zero or partial
losses create no debt, including after future earnings or correction refunds.
Later blocks may consume newly available leaves normally.

## Migration, validation and replacement

The existing localStorage key, backup version and cloud schema version stay 1.
Fresh/demo states have a null ledger. Missing legacy fields normalize to null;
migration never invents an activation date. Existing baselines and award history
are retained under the existing legacy migration rules. Active ledgers are not
mistaken for untouched demo/fresh states.

Backup parsing validates ledger versions, activation boundary/timezone, event
identities, unique IDs, amounts, revision identities and checkpoint boundaries.
Malformed ledgers fail closed: local load does not replace them with fresh state.
Cloud validation accepts missing fields and retains unknown fields; hydration
installs the normalized ledger without issuing an echo-save.

Replacing an active child's snapshot with a missing or incompatible activation
is rejected **before changing repository state**. This is not an automatic merge.
Export both snapshots for explicit resolution. A complete older backup with the
same activation remains a deliberate full-snapshot rollback; its own history is
restored and then may be explicitly reconciled. A legacy backup can be imported
into an inactive repository and activated prospectively. Explicit existing reset
operations still reset all data, including this subsystem.

## Failures and concurrent snapshots

Punishment commits serialize the full candidate snapshot once, write it, then
replace in-memory state and notify persistence subscribers. Storage failure
leaves the prior ledger/checkpoint in memory and emits no cloud notification;
retry calculates the same event IDs. These commits bypass the ordinary creature
unlock hook. Backup restore also rolls back in-memory state if persistence fails.

A comparison with the last observed localStorage snapshot rejects sequential
stale-tab punishment writes. **localStorage has no atomic compare-and-swap**;
simultaneous cross-tab writes are not made transactional by this check. The
existing cloud gate's external-storage conflict handling remains in place.

Cloud synchronization is unchanged: whole snapshots use the expected server
revision. Failed network saves retain the local ledger for retry. If a save
committed but its response was lost, retry conflicts; reloading the chosen cloud
snapshot retains local safety copies. No ledger merge, automatic conflict
resolution, or last-write-wins fallback is introduced. Independent activations
with different metadata also require explicit snapshot resolution. The current
single-child IDs are not account-global identities, so an account switch can
likewise require resolving this conservative activation guard; do not combine
ledgers merely because both profiles use `child_001`.

## Integration boundary

The mounted app activates and reconciles after hydration; practice writes also
reconcile automatically. Phase 2C adds presentation of the remaining balance;
new conflict resolution UI remains out of scope. The existing cloud gate controls when
the app and its lifecycle may run. The ledger must not be subtracted again from
lifetime earned or existing award data.

## Phase 2B.1 local scope review

The ledger, explicit repository APIs, revision accounting, and backup/cloud
integration described above were already present in the working tree when this
local-only task began. They were preserved. This pass makes `PersistedState`'s
punishment field optional at the type boundary and keeps the ledger getter
null-safe. Added local-only regression tests exercise old snapshots, populated
progression and creatures, explicit correction reconciliation, defensive reads,
and activation when UTC and local calendar dates differ. No UI, scheduler,
health, growth, backup-format, or cloud synchronization changes are added here.

Integration issues recorded at the end of Phase 2B.1:

- Corrections require an explicit reconciliation call. Until then the balance
  intentionally reflects the last saved ledger. Existing first-assessment caps
  remain authoritative: replay from a ledger preserves zero/partial losses even
  after an earlier debit is reversed. Rebuilding from practice evidence alone
  cannot reproduce those caps. Review that correction policy before automatic
  integration; do not discard the ledger or silently recompute its caps.
- Existing backup guards reject missing/different activation for the same child.
  A same-activation older snapshot can still roll back assessments. Historical
  rollback and cross-version import policy are not resolved by this local phase.
- Existing persistence subscribers receive explicit punishment commits, so the
  pre-existing whole-snapshot cloud adapter may transport them. This pass does
  not introduce or alter that behavior. Cross-device activation conflicts,
  shared `child_001` identities across accounts, older clients ignoring the
  ledger, and true concurrent localStorage writes still need integration review.
- Existing UTC handling of early-ended holidays is retained. This phase uses
  the Phase 2A holiday interpretation without changing health/holiday rules.

Phase 2B.1 stops at explicit repository calls. The running UI continues to use
the existing earned and temporarily visible leaf counts.

## Phase 2B.2 practice corrections

`savePracticeRecord`, `addPracticeRecord`, and `updatePracticeRecord` now
reconcile an activated child's complete schedule before saving. They use the
existing calculator and ledger without adding a schema or a separate refund
system. Inactive profiles remain inactive.

The practice change and corrected ledger are written as one snapshot. Failed
validation, reconciliation, or storage writes leave the previous in-memory
snapshot intact; no persistence notification is sent for a failed write.
Ordinary practice growth still runs once, under its existing rules.

Invalidated penalties stop contributing their actual applied loss. A three-leaf
loss therefore restores three leaves, and a zero-leaf loss restores none. Old
assessments remain in the ledger, replacement blocks are calculated together,
and repeat reconciliation produces no extra deductions, restorations, or writes.
Later earnings do not increase historical assessment caps. Existing health,
temporary leaf hiding, growth awards, stage rules, and cloud conflict handling
are unchanged.

Tests cover actual-loss restoration at zero/low balances, unchanged surviving
penalties, multiple replaced blocks, practice entry points, failed-save retry,
reloads, and matching health/growth effects with punishment active or inactive.
The Phase 2B.1 backup/cloud limitations above remain; automatic practice
reconciliation resolves its explicit-correction-call limitation. UI, Parent
Settings, Story, and automatic date scheduling remain outside this phase.

## Phase 2B.3 minimal app lifecycle

An App effect starts the lifecycle only after CloudGate has hydrated the chosen
profile and mounted App. It preserves an existing activation, or calls the
existing activation API once for an inactive profile, then reconciles completed
dates through yesterday. Activation still starts counting on the next local
date and never charges for older history.

Window focus and becoming visible check the date in the ledger's saved timezone.
One timeout targets the next midnight in that zone, including daylight-saving
changes, so an open app can update without a reload. Each check reschedules that
single timeout; there is no polling or background service. A suspended browser
catches up when a timer runs or the app resumes. Failed writes keep the date
retryable and use the existing saved-data notice. Unmounting removes the timer
and listeners, including when the existing cloud gate blocks the app.

App subscribes to the existing persistence notifications with a read-only ledger
snapshot so reconciliation updates cause a render. Selectors and rendering do
not activate, reconcile, or save. The calculator, ledger, local schema, cloud
conflict logic, practice corrections and other growth mechanics are unchanged.

Limitations: no work runs while the app is closed, and browsers may delay timers
while suspended. A same-day holiday edit is picked up by the next practice
save, explicit reconciliation, app mount, or date boundary. Phase 2B.3 retained
health-based leaf visibility; Phase 2C below replaces it. Parent Settings and
Story are not implemented here.

## Phase 2C actual remaining leaf display

The read-only leaf selector derives `visibleLeafCount` as lifetime earned leaves
minus the ledger's actual applied loss, clamped to zero. Parent and Child counts
and the existing MusicTree/TreeLeaves rendering use that balance. No counter is
persisted, and no rendering path activates, reconciles or saves penalties.

Health no longer hides leaves or imposes a minimum visible floor. The selector
still accepts health for existing callers, but ignores it when computing counts.
Health calculations and all other health behavior are unchanged. A historical
correction updates the ledger through Phase 2B.2; the existing App subscription
then makes restored leaves visible. Reloads and stage changes preserve the loss.

`earnedLeafCount` and the stored `treeState.leafCount` remain lifetime totals for
growth, reward reminders and creature progression. Tree UI supplies the derived
remaining count to the renderer. New profiles retain the 16-leaf baseline, and
the original leaf award rules, artwork, animations and stage layout are unchanged.
No new lifecycle work, settings, manual leaf rewards, Story or creature behavior
is added in this phase.
