# Tool recovery invariants

Every tool — chat, MCP, and the Diagram Agent's submission — reports failures to the model through
one boundary. A tool does its work and throws a meaningful error; the boundary turns that error into
feedback, and the model corrects its next call within the same run. This implements ADRs 0003,
0015, 0034, 0035, and 0037.

## Failure contract

Application tool failures are values with exactly these fields:

```json
{
	"kind": "failure",
	"code": "VALIDATION",
	"message": "edits: Too small: expected array to have >=1 items",
	"recovery": "Read the failure, correct the arguments it names, and call the tool again.",
	"details": {}
}
```

Success payloads retain their domain shapes. File failures preserve exact suggested calls in
`details.nextActions`. Review failures preserve problems in `details.problems`. MCP marks these
results with `isError: true`. Chat records `tool_reported_failure` and passes the envelope to the
next model generation. Readers discriminate on `kind`, never serialized field order or text prefixes.
`readToolOutput` reads an output as success, failure, or corrupt; a value claiming the reserved
failure kind that does not match the envelope is corrupt, and is recorded as a failed call.

## One boundary

`withToolFeedback` (`src/lib/server/repositories/agent/sdk-tool.ts`) wraps a tool's own work. Any
error it raises becomes the failure envelope. A domain error keeps its code and correction advice;
any other error reports a safe message and no-retry advice, and the original is recorded on the
active trace. Only cancellation escapes.

There is no third category. States a tool could not act on are excluded where their data enters
(ADR 0037): a missing saved review fails where the approval checkpoint is restored, before any tool
runs. Repeated execution is answered by idempotent writes rather than by ending the run: ADR 0003
promises no exactly-once execution, and ADR 0010 makes a satisfied repeat return unchanged. A
failure to record a completed write is therefore feedback like any other, and the write is not
repeated by the boundary.

`sdkTool` is the only Agents SDK tool constructor. It publishes the strict object schema, wraps
every `execute` in `withToolFeedback`, and owns the SDK error handler, which turns only the SDK's
own rejection of the model's input into feedback. The `tool-boundary` audit allows the SDK's
`tool()` nowhere else, so the policy cannot be skipped. MCP handlers use the same wrapper.

`bindToolArguments` validates once and binds the typed arguments to an action. Chat preparation has
three outcomes: ready, approval required, or the failure envelope itself. It runs inside the
wrapper, by call identity, before `needsApproval`, and execution reuses that result, so invalid
arguments neither run nor ask for approval. Strict model schemas encode omitted optional fields as
null; the adapter normalizes these consistently and preserves explicitly nullable fields. A
reviewed note action binds its saved base and prepared result, and a resumed approved call uses that
exact saved review.

## Observation

The run loop records what the SDK did as chat events; it never decides again. Arguments are parsed
into a readable or corrupt value, never thrown on. The SDK answers malformed JSON and unknown tool
names itself and the run continues; both calls settle as `tool_failed` under the name the model
asked for, and are journalled. Running and approval rows name a catalog tool. The turn summary
reports a failure only when nothing put it right: a failure a later call corrected stays in the
history but is not news.

## Verification

| Invariant                                                           | Enforcement                                           | Behavioral evidence                                                                                                                                                                   |
| ------------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Invalid arguments cannot write or request approval.                 | Shared binder inside the wrapper, before approval.    | `tool-lifecycle.spec.ts`: zero/six edits, concurrent calls, read, ordinary mutation and discovery; `mcp-tool-factory.spec.ts`: invalid and corrected calls.                           |
| Recovery reaches the next model generation.                         | Failure is a normal SDK tool output.                  | The real streaming runner uses a fake model that corrects only after seeing the feedback.                                                                                             |
| A recovered protocol error never ends the turn.                     | The SDK owns recovery; observation records it.        | `controllers/agent/lifecycle.spec.ts` through the production runner: malformed JSON beside a valid call, an unknown tool, malformed JSON then corrected. These failed before the fix. |
| Approval applies the saved review, including after serialization.   | Reviewed action closure and saved-review restoration. | Serialized resume, rejection, and stale revision tests in `tool-lifecycle.spec.ts`; note and skill review specs.                                                                      |
| Failure and success retain their call identities in stored history. | Production run lifecycle and conversation journal.    | `controllers/agent/lifecycle.spec.ts` journalled rows; `chat-history.svelte.spec.ts`: a reopened conversation restores a failed unknown-tool call.                                    |
| Internal tool faults reveal no implementation details.              | `withToolFeedback` and domain recovery advice.        | Chat and MCP internal preparation fault tests.                                                                                                                                        |
| Only cancellation ends a run from inside a tool.                    | `withToolFeedback`.                                   | Runner cancellation test; a failure after a write reports feedback and writes once.                                                                                                   |
| The Diagram Agent recovers like any other tool.                     | `sdkTool`.                                            | `controllers/diagrams/generate-mermaid.spec.ts`: invalid JSON, schema-invalid and rejected drafts are journalled as failed and the corrected diagram is returned.                     |
| Envelope reading is structural and never throws.                    | `toolFailureSchema` via `readToolOutput`.             | `tool-failure.spec.ts`: reordered keys and corrupt reserved envelopes.                                                                                                                |
| A failed call is never named as done.                               | Turn summary labels.                                  | `turn-activity.svelte.spec.ts`: an unknown tool and a failed save render their reason and no past-tense label. Found by the screenshot repro, not by the earlier tests.               |
| New SDK/MCP constructors cannot bypass the boundary.                | AST `tool-boundary` audit.                            | `audit-source-rules.spec.ts`: aliases, namespace imports, re-exports, and the diagram service.                                                                                        |

Tests use real SDK runners and linked MCP transports with in-memory domain repositories; they do not
establish how reliably a live model chooses a useful correction.
