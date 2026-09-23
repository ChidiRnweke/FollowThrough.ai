# Resolved promise dates at the provider boundary

W09.14's structured extraction schema previously accepted any string as resolvedDueDate. Discovery
then cast that string to LocalDate. The schema accepted tomorrow, 2026-02-30 and 2026-02-29, so invalid
dates could reach proposals or fail later during task persistence. dueDateVerbatim already exists to
retain wording that cannot be resolved.

The provider schema now requires an ISO calendar date or null. PromiseClassification lives in the
repository adapter, alongside other provider parsing boundaries. Its SDK parse validates the schema
before the adapter brands a date. StructuredPromiseResult exposes LocalDate or null, and discovery
uses that value without casting. The duplicated client/result declarations are replaced by one
repository contract, re-exported through the existing service port. PromiseExtractor keeps its one
service contract.

Valid dates, leap days and unresolved null values retain their prior meaning. An invalid resolved
date fails extraction; no date is guessed and no candidate is silently discarded. Original deadline
wording stays separate. The prompt, frozen request time, selected model, observer, cancellation
signal and missing-credentials behavior remain unchanged. No database migration is required.

## Evidence and retained tests

A local HTTP fixture supplies structured completions to the real OpenAI SDK. Before the fix, all
three invalid-date refusal tests failed while the valid, leap-day and null cases passed. After the
fix, all six pass. These are provider-boundary contract tests; no live model call was made and they
do not establish model quality or provider availability.

Keep discovery's missing-output and client-error cases, deterministic deadline rules, selection
validation, controller orchestration, owner preservation, durable cancellation and PostgreSQL task
contracts. The SDK boundary establishes date validity; service tests establish domain mapping and
error outcomes. Tests do not assert the mechanics of the moved class.

The remaining Todo completion/status representation, source-anchor shape and workflow reconciliation
still require dispositions. This correction does not complete the task-family assessment.
