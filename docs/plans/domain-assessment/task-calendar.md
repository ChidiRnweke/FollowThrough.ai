# Device calendar dates for tasks

W02.08 and W09.06 use a local calendar date to group today's tasks and mark overdue work. The
browser helper instead took the date from a UTC ISO timestamp. Near midnight, that can be the next
or previous day on the device. Separately, the shared date-only label formatter treated a LocalDate
as UTC midnight and displayed that instant in the device time zone. Western time zones therefore
displayed the previous date.

The browser calendar helper now reads local year, month and day from the supplied clock instant.
Date-only labels format their calendar date without converting it to another time zone. The shared
labels module keeps the existing formatDate and todayLocalDate exports. Actual timestamp formatting,
stored due dates, completion timestamps and export behavior are unchanged.

## Reproduction and evidence

The real TodoCard and application CSS were rendered in the existing component fixture server.
Playwright used America/Los_Angeles, a fixed instant of 2026-09-23T06:30:00Z, light mode, reduced
motion and a 1000 by 600 viewport. The captured region is 760 pixels wide. The synthetic tasks have
due dates 2026-09-22 and 2026-09-21. No today prop was supplied, so the card used the actual browser
helper. At that instant the device date is 22 September, 23:30.

- Before: both cards were overdue red and displayed 21 Sept and 20 Sept.
- After: the first card displays 22 Sept without overdue color; the second displays 21 Sept in red.

Images are committed under docs/pr-evidence/task-calendar. The temporary fixture and route changes
were removed. Local PostgreSQL was unavailable, so this verifies the actual component with seeded
props rather than authenticated whole-app navigation.

Four tests run the real Date and Intl implementations in separate Node processes with explicit
Los Angeles, Brussels, Kiritimati and UTC zones. They cover opposite sides of midnight, a year
boundary and stable due-date labels. Focused regressions passed five files and 25 tests, including
Today grouping and existing board export behavior. Overall task workflow reconciliation remains open.

The full local unit suite passed 443 files and 4,093 tests. Lint, type checks, architecture audits
and documentation checks passed. These results do not establish full repository assessment coverage.
