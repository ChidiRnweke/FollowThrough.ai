# Agent error remediation plan

**delete this when implemented**

This is a temporary implementation handoff. Keep the
[2026-10-10 RCA](../architecture/rca-2026-10-10-agent-errors.md) as the durable evidence record.
Delete this plan and remove links to it when all tasks below have verified dispositions.
Do not delete it merely because the tool recovery refactor has landed.

## Executor instructions

1. Read the RCA, this plan, current `AGENTS.md`, and
   [tool recovery invariants](../architecture/tool-recovery-invariants.md).
2. Start from current `origin/master` in your own linked worktree. PR #280 already supplies the
   shared boundary; inspect it before replacing anything. Do not work on the stale main checkout.
3. Address one coherent task per PR. Record observed validation and unresolved blockers. An
   investigation task is not complete merely because it has a plausible hypothesis.
4. Keep credentials, raw prompts, note bodies, and complete provider payloads out of commits.
   Use synthetic fixtures derived from argument shapes, not private content.
5. Update the RCA with findings and resolution evidence as work lands. Preserve historical facts.
   This plan authorizes no telemetry deletion or unrelated deployment changes.

## Intended simplification

The tool invocation boundary catches tool-local errors and returns useful feedback to the
model. Validation and execution share that policy. The model corrects the next call within
the existing runner. No additional retry loop, executor, failure envelope, or general error
framework is needed.

Use the existing `tool-call-boundary.ts` and `sdk-tool-adapter.ts`. Consolidate repeated catch
policy there; retain separate preparation and execution stages only because approval can pause
between them. The observer must not reclassify a recoverable call as a fatal provider error.
Preserve the existing `kind/code/message/recovery/details` envelope and current stored-event
formats where possible. Do not expand this work into a historical data migration or UI redesign.

Parsing stays at provider/read boundaries. Executable tool names and approved arguments remain
strict. Observed tool names may include an unknown name supplied by the model; displaying that
name must not grant execution rights. Cancellation, corrupt saved approvals, and post-write
journal failures remain outside ordinary tool recovery.

## Work checklist

- [x] **1. Close the recovery boundary and delete competing validation (E2).**
      In the existing tool adapters, centralize conversion of tool-local exceptions into the
      current failure envelope. In `server/repositories/agent/provider-events.ts`, represent
      unreadable arguments explicitly instead of throwing or replacing them with `{}`.
      Retain call identity and raw argument evidence. In `AgentToolEventMapper`, remove fatal
      catalog validation of observed names. Normalize failed protocol calls using their input
      state and actual SDK output, never English message prefixes. A malformed call must render
      failed, not successful, even though the SDK's JSON correction output bypasses application
      `errorFunction`. Invalid calls must neither execute nor request approval. Handle unreadable
      observation records visibly without throwing out of the stream; do not invent identities
      or attribute an ambiguous output to an arbitrary call. Keep executable identity checks at
      the execution/approval boundary. Preserve existing `AgentProviderFailure` instances in the
      outer reasoning catch instead of losing their code and retry classification.
      **Verify:** the real runner completes after malformed input and a corrected call, including
      a valid sibling call. Event persistence and replay preserve each outcome and identity.

- [x] **2. Remove the second diagram recovery implementation (E2).**
      Route diagram submission through the existing SDK adapter and current failure envelope.
      Remove its legacy `{ failure: ... }` formatter and duplicated schema conversion where the
      common adapter already provides it. Preserve the diagram submission/acceptance handshake.
      Share observation normalization and provide diagram-specific unknown-tool guidance; do
      not tell the diagram agent to call chat-only discovery tools. Wire shared adapters through
      an allowed dependency edge, not a service-to-factory import. Remove the diagram constructor
      exception from the tool-boundary audit once it uses the shared construction path.
      **Verify:** invalid JSON, schema-invalid input, and rejected content can be followed by a
      valid accepted submission. Cancellation still closes the session.

- [x] **3. Make failure observation safe (E2, E3).**
      Replace throwing output probes in `readToolFailure` with an explicit boundary result for
      success, reported failure, or unreadable output. Do not interpret arbitrary text beginning
      with `{` as proof that it must be a valid failure envelope. Preserve correction details
      through model feedback, stored events, and UI projection. Keep legacy wire event names
      if needed; simplify internal consumers rather than rewriting stored history. Label user
      rejection as an expected failed action with a continuing run, never as permission to retry
      the rejected write automatically.
      **Verify:** malformed result text and malformed reserved envelopes cannot crash observation
      or become silent success. Rejection is visible after reload and causes no rejected write.

- [ ] **4. Diagnose and correct repeated invalid arguments (E4–E6).**
      For each representative trace, compare the advertised schema, discovery response, emitted
      arguments, feedback, and next generation's input. Inspect `grep`'s boolean fields, `sed`'s
      range object, and the memory add/update/remove schemas at their tool factory/binder boundary.
      Determine why `memoryEntryId: ""` was supplied for add, rather than assuming an absent
      UUID should be invented. Check strict-schema null normalization and whether optional
      fields are described consistently. Preserve strict types; do not blindly coerce strings,
      insert IDs, or replay the same failed operation. Put exact field/type corrections in the
      existing failure details when feedback is inadequate. Fix advertised schemas only where
      they contradict the execution contract. Record provider/model behavior separately when
      both contracts and feedback are correct.
      **Verify:** synthetic cases use `"true"`, an empty add-operation ID, and a JSON-string
      range. The model fixture corrects only after receiving feedback; corrected calls succeed
      through the full stream path. An invalid mutation has no saved effect.

- [ ] **5. Explain note conflicts and unmatched edits (E7–E8).**
      Correlate preceding reads, prepared base revisions, approval decisions, writes, and recovery
      calls in the RCA's traces. Inspect reviewed note preparation and apply paths. Determine
      whether stale data came from a concurrent edit, stale model context, or an incorrect
      checkpoint. Preserve revision checks and exact approved content. For unmatched edits,
      verify whether the proposed old text existed in the revision the model read. Fix only a
      demonstrated contract or recovery defect; otherwise record a working safeguard and the
      observed user outcome.
      **Verify:** stale approval cannot overwrite a newer edit; a fresh reviewed correction can
      succeed. Unmatched text returns actionable details and never applies a partial edit as
      though the entire requested change succeeded.

- [ ] **6. Determine the provider rejection cause (E1).**
      Retrieve the original provider response details or correlated deployment/provider records
      for the six trace IDs. If retention prevents this, state that limit and add safe diagnostic
      capture at the provider HTTP boundary for future failures. Retain status, provider code,
      model and available request identifier; exclude authorization and user content. Preserve
      error classification through outer wrapping. Check the actual request parameters before
      changing model selection, reasoning options, or transport. Do not retry a permanent 400
      as a substitute for diagnosis.
      **Verify:** a synthetic HTTP 400 retains safe causal detail and settles the run honestly.
      Any proposed request fix must have a fixture based on the demonstrated rejection. An
      unrecoverable historical cause remains explicitly unresolved in the RCA.

- [ ] **7. Restore or explain web-log coverage (O1).**
      Obtain read-only access to the running web and collector configuration. Compare the web
      entrypoint/preload, service name, log level, and OTLP endpoint with the worker. Follow the
      record from console emission to collector receipt, Loki exporter, and ingestion. The
      supplied logs pipeline has no filter; do not remove trace filters to fix logs. Check the
      deployed revision before attributing runtime behavior to current source. Propose only the
      configuration or source change supported by evidence.
      **Verify:** an authorized controlled scenario produces a web record and correlated trace;
      worker delivery continues. Record the observation window and queries. A missing access
      path or absent historical data is a blocker, not a passing result.

- [ ] **8. Verify all dispositions, document the invariant, and retire this plan.**
      Update the recovery invariant document to include the protocol observer and diagram path.
      State explicitly that tool-local failure becomes feedback while cancellation and durability
      failure retain their own lifecycle. Add links from each invariant to behavioral evidence.
      Give every RCA inventory row a resolution, verified expected outcome, or explicit unresolved
      blocker. Delete this plan only after implementation and verification are complete; remove
      its incoming links and preserve the RCA and durable invariants.

## Regression and acceptance requirements

Use the real streaming Agents SDK with existing in-memory dependencies. Extend the existing
tool-calling model fake so correction depends on feedback actually appearing in the next model
request. Do not replace the provider event parser or mapper with a fake in the decisive test.
Use one assertion per test and verify outcomes, saved effects, or replayed state.

Required scenarios are malformed JSON plus a valid sibling, schema-invalid arguments, unknown
tool names, corrected calls, approval/resume/rejection, unreadable tool outputs, and diagram
submission correction. Include cancellation and post-write persistence failure so recovery
cannot accidentally repeat a committed mutation. Preserve specific provider failure codes.

Run focused tests first, then the repository's lint, type, architecture, unit, and contract gates.
Use the nvm Node directory on PATH. Visible UI changes require actual before/after evidence under
the repository PR rules. Do not use live model calls when deterministic fixtures prove the bug.
For telemetry delivery, use an explicitly authorized isolated smoke scenario and record actual
results; trace smoke/validation scripts emit telemetry and are not read-only inventory queries.

Acceptance is a simpler ownership model, not just fewer lines: one recovery policy, no competing
fatal observer checks for recoverable tool input, one shared tool adapter, and no separate diagram
failure format. The full-path tests must fail on the old defect and pass after the refactor.
Passing these tests does not establish that a live model always chooses a useful correction.

## Scope of the documentation PR

The PR registering this plan changes documentation only. It does not implement these tasks,
save a Grafana token to `.env`, change production configuration, or claim that the incident is
resolved. The RCA's observed counts are historical evidence; this checklist is future work.
