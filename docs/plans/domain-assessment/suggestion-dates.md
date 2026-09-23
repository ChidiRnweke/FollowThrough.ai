# Task suggestion date boundary

A task proposal's dueDate is a resolved local calendar date, not the original phrase used to describe
a deadline. dueDateVerbatim keeps that separate phrase when available. The provider boundary now
validates extracted dates, and saved tasks validate their own dates, but the stored suggestion payload
schema still branded arbitrary strings as LocalDate. Older stored proposals and browser records could
therefore carry impossible dates or phrases into presentation and acceptance.

Add calendar-date validation before the schema produces the branded value. The mapper accepts raw
stored JSON and produces a resolved proposal only after parsing. This schema is shared by
the database mapper and workspace resource boundary. Keep the existing read policy: a malformed list
entry becomes an explicit unreadable StoredSuggestion, SuggestionInbox reports and omits it, and
valid neighboring suggestions remain usable. Single-record reads used for acceptance fail loudly.
Do not invent a deadline, repair historical data silently, or parse again inside the controller.
A missing dueDate remains valid; a valid leap day stays unchanged. No public shape or migration changes.

Five mapper regressions failed before the fix: impossible calendar days, a non-leap-year February 29,
a natural-language date, a timestamp, and the strict single-record read. The valid leap-day and absent
date controls already passed. Add three PostgreSQL contracts for mixed readable/unreadable lists,
strict acceptance reads and valid persisted dates. They seed an older malformed payload through SQL,
which is outside the now-validated write path. The tests do not fabricate a narrow domain value with
an invalid date.

Retain suggestion lifecycle, inbox ownership/expiry, acceptance/effect rollback, returned-view parity
and cached suggestion projection tests. This correction covers the date boundary in W10.03/W10.04/W10.08;
it does not alone complete those workflow reviews or the suggestion namespace's full assessment.

Remaining review found a separate path to inspect: browser note projections consume cached proposed
status, while server suggestion expiry is invoked by legacy view controllers. Workspace change-page
reads currently do not invoke expiry, but current creation does not assign an expiration deadline
either. The inspected historical creators also omit it. This is not evidence of a user-visible expiry
bug. Resolve the product meaning and actual producer before inventing deadlines, changing expiry
policy or marking W10.05 reconciled.

Focused regressions passed ten files and 62 tests. The full local unit suite passed 445 files and
4,113 tests. Lint, final type checks, architecture audits and documentation checks passed. Local PostgreSQL was
unavailable. Required CI results, including the new PostgreSQL contracts, are tracked on
[PR #218](https://github.com/ChidiRnweke/FollowThrough.ai/pull/218).
