# Feedback submission

This closes the assessment of W25.01. The review follows the sidebar entry, FeedbackDialog,
remote command, authenticated controller and FeedbackRecords insert. Feedback is stored for internal
triage; this action does not send mail or open an external issue.

## Ownership and behavior

The dialog owns the editable draft and busy state. It trims the body, rejects blank submissions,
captures the current app context and relative URL, and disables editing while the request is pending.
The remote boundary validates the report and obtains the request actor. The controller awaits the
repository write with that actor's account ID. It neither invents a success fallback nor catches a
storage failure. The dialog closes and shows success only after the command resolves. Failure keeps
the draft and offers retry through an error toast.

The report is one request value: body, URL and captured context are all required. There are no paired
optional fields to repair. The controller is a small persistence boundary and needs no additional
domain object. Opening the dialog resets its draft; no offline queue or durable draft is promised.
The context snapshot is supplied by the shared app context store. Its broader selection and capture
rules remain W02.07, rather than becoming a second feedback-specific context policy.

## Reproduced defect and repair

The server already rejects bodies longer than 10,000 characters, but the dialog accepted 10,001.
A long report therefore reached a generic submission error even though retry could not fix it.
Expose the existing limit as a shared constant, use it as the textarea's native maximum length, and
show the current count next to the field. This does not impose a new server limit.

A Playwright fixture mounts the actual dialog with application styles at 1280 by 900. Before the
repair, filling 10,001 characters leaves 10,001 in the field with no maxlength. After the repair,
the same input leaves 10,000 with maxlength 10000. Matched captures use a short synthetic report;
the result shows its count and the limit. No report was submitted and no live data was changed.

## Test dispositions and limits

Retain the three controller tests: account and context persistence, storage failure propagation,
and retry after a failed write. They test outcomes against InMemoryFeedbackReports. No test is
added that merely duplicates the native maxlength implementation. Local and CI results are recorded
in the PR. The browser check verifies the actual dialog and input, not a database-backed submission.

A lost response after a successful write can still leave the client unsure whether feedback was
stored. There is no idempotency key or cross-device draft recovery. These are existing boundaries,
not guarantees inferred from the retry test. Nothing in this assessment claims external delivery
or triage completion.
