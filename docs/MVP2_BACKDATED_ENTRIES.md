# MVP2: backdated parent practice

## Architecture and scope

The existing Parent daily-practice form in `src/App.tsx` saves through `src/data/localRepository.ts`. Domain selectors derive daily water, health, practice statistics, and stage eligibility. Achievement, improvement, and parent note are fields on the same `PracticeRecord`, so the chosen date applies to all of them. There is one parent practice-creation surface.

The form now includes a native date picker, initially set to the local calendar date. Parents may select today or any earlier valid date. The picker limits future dates; save is disabled for an empty/invalid/future date, and all repository practice creation/update methods independently validate dates before mutation. The three-record count shown beside the form follows the selected date. Today's child card and water indicator still follow today.

There is no existing practice-editing screen. The existing repository `updatePracticeRecord` supports correcting dates, rejects future/invalid dates and a full destination day, retains record identity and `createdAt`, and updates `updatedAt`. This step adds no new history-editing workflow. Teacher lessons, homework, and reward management are unchanged.

## Data and compatibility

No migration or storage-schema change is required. MVP1 already has `PracticeRecord.date`, a local `YYYY-MM-DD` activity date, and separate ISO audit timestamps. The key remains `music-tree:mvp:v1`, version 1. For example, practice entered on October 4 for October 2 stores `date: "2026-10-02"`, with `createdAt` and `updatedAt` set to the actual October 4 save instant. No new `activityDate` field is introduced.

Existing saved records and backup imports retain their dates, timestamps, IDs, achievements, and other content. Read/import validation is unchanged; the new future-date restriction applies to new saves and edits, not retroactively to old backups. No records are removed or progress reset. Rendering-only overflow fixes from the previous task remain in place.

## Ordering and summaries

History reads return a copy sorted newest activity date first, using creation time and then ID only to break same-day ties. Stored array order is not rewritten to migrate history. CSV export and explicit tree-history replay use oldest activity date first. A recent-history card still shows its existing four most recent activities; older additions remain in saved history and exports.

Daily water and the three-record limit use the selected activity date. Health replays activity chronologically, including its achievement/improvement contributions. Adding earlier evidence can change health on following days under the existing decay rules. Current-day messages do not adopt a backdated parent note.

Stage practice-day counts use activity dates within the existing stage-entry window. Permanent stage snapshots are retained; historical additions do not backdate stage unlocks or rebuild completed teacher learning cycles. Without a stage snapshot, the existing earliest-valid-practice fallback remains in use. There are no dedicated weekly/monthly summary views in MVP1; regression tests verify week/month windows through existing progress and practice-statistics calculations without introducing new dashboards.

## Streaks and permanent progress

Streak rules are unchanged: a valid day has at least five practice minutes and a quality value; duplicate dates count once. Filling a gap can join consecutive days and increase the current/longest streak. The existing `currentPracticeStreak` means the consecutive run ending at the latest recorded valid day, even if that day is older than today. No product decision is required to retain this behavior; changing it to expire against today's date would require a separate decision.

Daily leaf eligibility is checked for the saved/corrected activity date, using that date's water and replayed health. Each child/date can earn at most one leaf. Existing earned leaves and stage unlocks remain permanent, including after date corrections. As in MVP1, edits do not revoke old leaf awards, and saving an earlier date does not automatically issue missing awards for every subsequent day. Broader historical award reconciliation is outside this foundation step.

## Verification

Regression coverage includes today/yesterday/older entries, invalid and future dates, UTC/local-midnight and daylight-saving boundaries, date-first ordering, CSV ordering, old MVP1 data, reload and backup restore, daily water/health/leaves/notes, week/month windows, stage-window boundaries, streak gap filling, date corrections with immutable creation timestamps, per-day limits, and the date picker's default and maximum.
