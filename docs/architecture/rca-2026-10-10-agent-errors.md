# RCA: agent and observability errors, 2026-10-10

Status: investigation recorded; plan tasks 1–7 dispositioned (see Resolution log).

This record covers **2026-10-08 06:43:09 UTC through 2026-10-10 06:43:09 UTC**.
It preserves the evidence for the [remediation plan](../plans/agent-error-remediation-plan.md).
Keep this RCA after that temporary plan is deleted. Append verification and resolution evidence;
do not rewrite historical observations as though a later fix was already present.

## Summary and coverage

Phoenix returned 962 spans in 117 traces from `followthrough`: 933 OK spans and 29 ERROR spans.
The ERROR spans belong to eight traces, not 29 independent incidents. `followthrough-dev`
returned no spans. The scan included exceptions and error attributes on OK spans, not only red roots.
A second scan examined all 142 TOOL spans and found 30 structured failed results under OK spans.
Those failures must be counted separately from span status. A recovered failure is not necessarily
a failed user request.

Loki returned a count of 18,688 records for the FollowThrough services in the same window. Every
record counted was INFO from `followthrough-worker`. Severity and failure-text queries returned no
matches. No `followthrough` web-app records appeared. This is incomplete coverage, not proof that
the web app had no errors. Other applications on the same telemetry servers were excluded.

The investigator used read-only telemetry requests. No application fixes, live model reproductions,
deployment changes, or stored telemetry changes were made. No raw user prompts, note bodies,
authorization headers, or credentials are retained here.

## Inventory

| ID  | Finding                                                             |                     Count | Assessment                                                            |
| --- | ------------------------------------------------------------------- | ------------------------: | --------------------------------------------------------------------- |
| E1  | HTTP 400 from the model provider                                    | 6 traces / 24 ERROR spans | Confirmed provider rejection; upstream reason unresolved              |
| E2  | Malformed tool arguments terminate a turn, followed by abort errors |   1 trace / 4 ERROR spans | Confirmed observer-boundary defect                                    |
| E3  | User rejects `edit_note`; run continues successfully                |              1 ERROR span | Expected rejection; not a failed run                                  |
| E4  | `grep` receives strings for boolean fields                          |         15 failed results | Validation works; repeated ineffective correction needs investigation |
| E5  | Memory add receives an empty `memoryEntryId`                        |          7 failed results | Contract/argument mismatch; correction needs investigation            |
| E6  | `sed` receives a stringified range object                           |          2 failed results | Validation works; correction needs investigation                      |
| E7  | Note review becomes stale                                           |          3 failed results | Conflict protection; cause of repeated conflicts unresolved           |
| E8  | Note edit cannot match old text                                     |          3 failed results | Grounding or edit-preparation problem; exact cause unresolved         |
| O1  | Web-app logs absent from Loki                                       |  No web records in window | Emission/export/delivery gap unresolved                               |

### E1: provider rejection

All six failed generations used `openai/gpt-5.6-luna`. They occurred on October 8 between
12:51:36 and 12:52:45 UTC, before any tool execution in those traces. Each failure appears at
generation, agent, workflow, and turn levels. Recorded input shapes contained a system message
and a user message. Phoenix retained `400 Provider returned error`, but no upstream response
body or invocation parameters explaining the rejection.

Trace IDs:

- `87b58c0dc3edd51cec8101511058aa7e`
- `699477242bfc51bf8aec9d91521ae9e6`
- `4a6403dec81804e634c6016dd5501a53`
- `c13c96ee235239cf5982fb77c1289377`
- `9f6af330d5705e4b0590d49fd35cd007`
- `77ba80476e17f67cbb7f8d45ff490a54`

Do not infer an unsupported model, bad parameter, account issue, or automatic retry loop from
these traces alone. A matching Tempo request through Grafana returned HTTP 502 and did not
provide additional evidence.

### E2: recovery is overridden by observation

Trace `1cde38f9a1ab555861e273b91780f9af` used `deepseek/deepseek-v4-flash-0731`.
The turn started October 8 at 14:17:12.308 UTC. Its tool sequence included workspace context,
note and skill reads, two `sed` calls, and a `search` call.

The generation ending at 14:20:10.114 contained two `search` argument records: one malformed
199-character JSON string and one valid 178-character JSON string. Local syntax inspection
identified a delimiter error at position 140 in the malformed string. The turn span ended at
14:20:10.149 with `The provider returned malformed JSON tool arguments`. A valid search
continued until 14:20:11.956. The following generation and SDK parent spans then reported
`Request was aborted` around 14:20:11.977.

The immediate cause is `providerArguments` in
[`provider-events.ts`](../../src/lib/server/repositories/agent/provider-events.ts): it throws
`AgentProviderFailure` while decoding a tool event for observation. The installed Agents SDK
0.13.2 already has a malformed-JSON recovery path before application callbacks. That path
returns correction feedback and continues. Our observer independently rejects the same call.
The timeline supports the subsequent aborts being consequences of the parser failure, rather
than independent user cancellations.

[PR #280](https://github.com/ChidiRnweke/FollowThrough.ai/pull/280) already introduced shared
tool preparation, execution recovery, and the current failure envelope. Its coverage did not
close this protocol-observation path. The initial local checkout was behind that PR's successors;
findings were checked again against `origin/master` at `6bcaf37f` and the documentation branch
base `f8f5c1fa`. The deployed build revision was not verified. Do not prescribe a second copy of
the recovery boundary that PR #280 already added.

Related defects confirmed by source inspection, but not separately reproduced in this window:

- `AgentToolEventMapper.namedTool` throws for unknown observed names, although the SDK's
  recoverable unknown-tool path emits call and output events.
- `readToolFailure` can throw while reading malformed JSON or a malformed failure envelope.
  Observation can therefore become another turn-fatal validation boundary.
- Diagram submission has its own legacy `{ failure: ... }` error formatter, outside the current
  `kind/code/message/recovery/details` contract. Current failure readers do not recognize it.
- The outer reasoning catch rewraps an existing `AgentProviderFailure` using only `code` or
  `status`; it loses the original `providerCode` and `transient` classification.

### E3: expected rejection

Trace `814af53e736b5e6d7c50b91c4b10d888` contains a rejected `edit_note` at October 9
10:15:40.333 UTC. The resumed turn ended OK at 10:15:44.096. Keep rejection visible while
distinguishing it from a failed run. Do not weaken approval requirements to remove a red span.

### E4–E6: model corrections did not resolve invalid argument shapes

| Finding | Actual invalid shape                                              | Representative traces                                                  |
| ------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------- |
| E4      | `fixed: "true"`, `ignoreCase: "true"`; schema requires booleans   | `337078e41a7245914f26cd9fbfd471d5`                                     |
| E5      | `operation: "add"`, `memoryEntryId: ""`; rejected as invalid UUID | `cfbc10d3cc033b04f4df87ee9d46e34b`, `cd4b98431e64ae4b9674768aee671ecc` |
| E6      | `range` is JSON text rather than an object                        | `1cde38f9a1ab555861e273b91780f9af`, `cd47445957edd6976fa0d7ea7ae8ce85` |

E4 occurred October 9 between 09:33:14 and 09:33:56 UTC. E5 occurred between 08:48:04 and
09:03:48 that day. E6 occurred October 8 around 14:18:03 and 14:20:32 UTC.
The current failure envelopes reached tool outputs with validation messages and general
correction advice. These observations establish repeated invalid arguments, not whether the
advertised schema, discovery output, replay, or model behavior caused the repetition. Inspect
all four before changing types or adding coercion.

### E7–E8: note protection and editing failures

Two stale reviews reported that the note changed after preparation; one reported a change
while the review was being saved. They occurred in `2b166ab409861f5cf11669a73ae4a184` and
`a2c9b418f5f3f9b11613e28239ab11b4` on October 9 between 10:34:36 and 10:40:13 UTC.
The failures advised reading the note and requesting a new review. The evidence does not yet
distinguish concurrent human edits, another tool write, or an incorrect saved review base.

Three `NOTE_REVIEW_FAILED` results in `6f49595f304ccab298988d8f387ca921` and
`559b11c07d9bd89ed92895e20f761b57` reported unmatched old text. They occurred October 9
at 08:32:01, 08:32:05, and 10:12:54 UTC. Outputs included correction details; private note
excerpts are deliberately omitted here. Verify the preceding read and revision before blaming
the matcher or removing conflict checks.

### O1: missing web logs and query limitations

The operator supplied a collector configuration whose logs pipeline is
`otlp -> batch -> otlphttp (http://loki:3100/otlp)`, with no log filter. Its trace router sends
OpenInference projects to Phoenix and Tempo, then filters non-OpenInference spans only on the
Phoenix branch. This supplied configuration does not explain missing web logs. Its active
deployment and the web process's effective settings were not independently inspected.

Production Compose configures both `followthrough` and `followthrough-worker`. The console
bridge emits INFO/WARN/ERROR, and controller instrumentation should emit web operation logs.
Check the running web entrypoint, preload, effective OTLP configuration, collector receipt,
exporter failures, and Loki ingestion. Preserve the distinction between no logs emitted and
logs emitted but not delivered. Phoenix parent spans missing because of its OpenInference
filter are not automatically broken application traces.

A 1,000-span Phoenix request returned HTTP 502; ten-span and then paginated 100-span requests
succeeded. A 5,000-record Loki fetch timed out; aggregate counts and focused queries succeeded.
These were investigation-time telemetry access failures, not additional application incidents.

## Repeatable evidence queries

Use existing environment credentials. Never place tokens in a command committed to the repo.
Phoenix is `https://phoenix.chidinweke.be`; Grafana is `https://grafana.chidinweke.be`.
The discovered Loki datasource UID was `fe4y2szj81qf4a`; Tempo was `de7c51lu93ojke`.

For Phoenix, use the installed client with the repository's `PHOENIX_BASE_URL` to
`PHOENIX_HOST` alias. Call `getSpans` with each project name, the exact `startTime` and
`endTime` above, `limit: 100`, and each returned `nextCursor` until it is null. The page size
is based on the observed gateway failure; it is not a cap on the investigation. Select ERROR
spans, exception events, and error attributes locally. Separately inspect all TOOL outputs,
including serialized JSON, for the current failure envelope. Fetch full representative traces
by `traceIds` to resolve ordering; do not print user payloads. `--days 2` in the existing query
script is relative and cannot reproduce this fixed window exactly.

Through Grafana's datasource proxy, call Loki `query` with the fixed end as `time`:

```logql
sum by(service_name,severity_text) (count_over_time({service_name=~"followthrough.*"}[48h]))
```

Call `query_range` with the fixed start and end for both filters:

```logql
{service_name=~"followthrough.*"} | severity_number >= 13 or detected_level =~ "(?i)error|fatal|critical|warn|warning" or exception_message != ""
```

```logql
{service_name=~"followthrough.*"} |~ "(?i)error|exception|fail|timeout|invalid|abort"
```

Both returned zero records in this investigation. If a future query reaches its page limit,
continue or split the interval; do not report the first page as complete. Retention and later
ingestion can change repeated query results. The counts above are observations from this
investigation, not immutable assertions about the telemetry services.

## Decision and resolution criteria

Use one tool-call recovery policy around validation, preparation, and execution. Tools provide
meaningful errors; the boundary converts them to model feedback. Observation consumes outcomes
and cannot veto recovery. Reuse the existing adapter rather than introduce a new executor,
retry engine, or parallel failure hierarchy. Approval creates two time-separated stages, but
does not require two different recovery policies.

Cancellation, broken lifecycle identity, provider transport failure, and failure to persist an
already-applied write are not ordinary tool corrections. Keep those boundaries explicit so
recovery cannot cause a duplicate mutation. Preserve actual failure details and user approvals.

This follows ADRs [0015](../src/content/docs/decisions/0015-report-a-failure-instead-of-silently-returning-a-weaker-result.md),
[0024](../src/content/docs/decisions/0024-trace-each-agent-run-from-the-user-action-to-the-saved-result.md),
[0029](../src/content/docs/decisions/0029-send-telemetry-through-opentelemetry-instead-of-coding-for-each-backend.md),
[0035](../src/content/docs/decisions/0035-expose-large-agent-readable-text-as-files-with-typed-recovery.md),
and [0037](../src/content/docs/decisions/0037-parse-external-data-at-the-boundary-and-keep-resolved-types-total.md).

Resolution requires evidence for every inventory row. A passing malformed-JSON regression
alone does not resolve provider rejection, repeated invalid calls, note conflicts, or missing
logs. Record expected outcomes as such; do not manufacture code fixes for successful safeguards.

## Resolution log

### Plan tasks 1–3 (E2, E3, related defects)

The observer no longer re-validates what the SDK decided. Provider arguments parse to a readable or
corrupt value; malformed JSON and unknown tool names settle as failed tool rows under the requested
name, and the run continues. `readToolOutput` replaces the throwing failure reader. The outer
reasoning catch keeps an existing `AgentProviderFailure`. Every tool, including the Diagram Agent's
submission, builds through `sdkTool`, whose `withToolFeedback` turns any tool error into feedback;
only cancellation escapes. The diagram tool lost its `{ failure }` format and its audit exemption.

Source inspection found one further defect: the diagram controller maps provider events through the
same mapper, and `submit_*_diagram` were not agent tool names, so the first real submission would
have thrown `UNKNOWN_TOOL_CALL`. Both names are now catalogued.

Evidence: through the public interfaces — the agent controller with the production runner,
the diagram controller with the production submission protocol, the reopened conversation, and the
rendered turn summary — tests for malformed JSON beside a valid call, an unknown tool name,
malformed JSON followed by a corrected call, and invalid, schema-invalid and rejected diagram
drafts failed on the documentation-branch base and pass after the change. E3 rejection remains an
expected failed action. No live model run reproduced E2; the evidence is deterministic.

A seeded screenshot of the reopened conversation found two problems the first round of
implementation-level tests had missed: a failed call was labelled in the past tense ("Save notes
completed", "Saved"), and the claim that the summary shows every attempt was false — by existing
design it reports a failure only when nothing put it right. The label is fixed and covered by
rendered tests; the claim is corrected. Those implementation-level tests were replaced.

### Plan task 4 (E4–E6)

E4: the advertised `grep` schema (`boolean` or null for `fixed` and `ignoreCase`) matches execution,
and the feedback names the field and the expected type. No contract defect was found; repeated
string values are recorded as model behavior.

E5: strict mode requires every field, so a model must fill `memoryEntryId` on an add. A blank
`projectId` or `memoryEntryId` is now treated as omitted, which is the existing convention for
blank optional model fields. A broken scope or operation rule, such as an id on an add, now returns
`VALIDATION` with the field, where it returned `INTERNAL_ERROR` with advice not to retry. Whether
the model also sent other values in the recorded traces is not established.

E6: the advertised `sed` schema wrote `range` as `oneOf`. OpenAI documents strict function calling
as accepting String, Number, Boolean, Integer, Object, Array, Enum and `anyOf`, and answers any
other schema with an error. Tool schemas are now converted with `anyOf`, which accepts the same
values because each branch has a distinct literal discriminator. Whether `oneOf` caused the
stringified range is not established.

E1 confirmed on 2026-10-10 by a controlled request to `openai/gpt-5.6-luna` with the old tool
schemas: OpenRouter returned HTTP 400, with OpenAI and then Azure answering "Invalid schema for
function 'sed': In context=('properties', 'range'), 'oneOf' is not permitted." The `anyOf` schema
is accepted. Because `sed` is sent on every generation, every request to a model that enforces the
strict subset failed before any tool ran, which matches all six rejections. The same probe found a
second rejected schema: `update_export_settings` keyed colours by any string (`'propertyNames' is
not permitted`), so any request after `search_tools` surfaced it would fail the same way. It now
names the palette keys, and the provider accepts all 81 agent tools.

Evidence: a test of every tool schema the agent sends found `sed: oneOf` before the change and none
after. Tests through the tool's public invocation show a blank memory id treated as omitted and a
broken memory rule returned as `VALIDATION`; both failed before the change.

### Plan task 5 (E7–E8)

No contract or recovery defect was found. The safeguards behave as ADR 0003 and ADR 0010 require.

- A stale review fails and does not overwrite the newer note.
- A fresh call is reviewed against the newer revision and, once approved, applies.
- An unmatched anchor applies nothing and reports every failing edit, with the nearest text.
- An edit whose old text is absent never asks for approval.

Unresolved: whether the stale reviews in `2b166ab4…` and `a2c9b418…` came from a concurrent human
edit, another tool write, or stale model context, and whether the unmatched old text in `6f49595f…`
and `559b11c0…` existed in the revision the model read. Answering this needs the traces' preceding
reads and revisions, which this code-side work did not query.

Evidence: a runner test approves a review, changes the note, and resumes. The stale review fails,
the model submits a fresh call, and the approved fresh review applies. With the revision check
disabled, this test and the existing stale-review test both fail. Existing tests in `patches.spec.ts`
and `agent-tool-factory.spec.ts` cover unmatched anchors and approval for absent text.

### Plan tasks 6–7 (E1, O1), code-side only

E1: a provider rejection now keeps who rejected which request. The failure message gains the
upstream provider OpenRouter routed to and the request id, for example `400 Provider returned
error (provider OpenAI, request req-1)`. The upstream body in `error.metadata.raw` is not read,
because it may echo the prompt. The classification survives the outer wrapping (tasks 1–3). A
failed background run is now logged once, because it runs outside the instrumented controller
boundary and nothing else logged it. The cause of the six rejections is the `oneOf` schema,
confirmed under task 4.

O1: unresolved. Source shows the web and worker processes start with the same preload, endpoint
default, log level default and console bridge, and the record builders do not throw on the
arguments the web boundary logs. Source alone therefore does not explain the missing web records.
Confirming emission, collector receipt, export and ingestion needs read access to the running web
process and the deployed collector, which this work did not have.

Evidence: a run against the real provider client with a scripted HTTP 400 transport settles as
failed with `400 Provider returned error (provider OpenAI, request req-e1)`, and the scripted raw
body does not appear. Before the change the message was `400 Provider returned error`.

### E7–E8 trace findings

Read-only Phoenix queries of project `followthrough`, 2026-10-09 10:25–10:45 UTC (124 spans, nine
traces), and of the four traces named under E7–E8. Only tool names, call order, note ids, anchor
lengths, revisions and failure codes were read; no note content is recorded here.

E7: every agent write to note `2eba27da…` in the window is accounted for. They produced revisions
99, 100, 101, 102, 107, 112 and 116. Revisions 103–106, 108–111 and 113–115 have no agent trace, so
three to four other writes landed between consecutive agent edits, and both stale reviews fall in
those gaps. The saved review base was correct; the note had changed underneath it. Phoenix cannot
tell whether the other writes were the user typing in the open note or the editor writing back
after receiving the agent's edit. Unresolved: the author of those revisions.

E8: `get_note` returns the body as a file reference (ADR 0035), so the anchors were not quoted from
what the model had just read. In `559b11c0…` each failed anchor differed from the applied anchor by
one missing space after a semicolon; after reading the exact text with `sed`, the model's corrected
call applied. `6f49595f…` shows the same recovery. The matcher does not treat a missing space as a
match, by design. Disposition: model quoting error; the safeguard worked and nothing applied
partially.

### O1 follow-up: Loki on 2026-10-10 at 13:40 UTC

Read-only Loki queries through Grafana. The collector configuration has one unfiltered logs
pipeline for every service, and every web span in Phoenix passed the collector's OpenInference
filter, so the web process reaches the collector.

- The web service `followthrough` now delivers logs: 24 to 44 records an hour, mostly `[workspace]`
  controller logs with trace ids. Its process started as PID 1 at 10:19:55 UTC.
- Loki holds no record before about 10:00 UTC for any service, including unrelated applications. At
  06:43 UTC the RCA counted 18,688 worker records over the preceding 48 hours, so that history
  existed and has since been lost.

Disposition: not reproducible. The web process started at 10:19 logs normally. The process that
ran during the RCA window, and its records, are gone, so the original gap cannot be explained.
New finding for the operator: Loki loses its history across a restart or keeps it only briefly,
which makes any future gap disappear before it can be investigated.
