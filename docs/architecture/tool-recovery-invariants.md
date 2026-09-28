# Tool recovery invariants

The chat and MCP adapters share application argument validation, prepared actions, and one failure
contract. This implements ADRs 0003, 0015, 0034, 0035, and 0037.

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
Malformed values claiming the reserved failure kind fail loudly.

This replaces earlier failure formats outright. There is no legacy reader, data conversion, or
history deletion. Consumers must use this contract; old persisted output is not reclassified.

## Ownership

`bindToolArguments` validates once and binds the typed arguments to an action. Chat preparation has
three outcomes: ready, approval required, or failure. MCP uses ready or failure because its host owns
approval. No controller adapter validates arguments after approval as its first validation step.

Chat has one SDK constructor, `createSdkTool`. It prepares by call identity before `needsApproval`
and retains that result for execution. Strict model schemas encode omitted optional fields as null;
the adapter normalizes these consistently at both stages and preserves explicitly nullable fields.
A reviewed note action binds its saved base and prepared result. A resumed approved call restores
that exact saved review; it never prepares a replacement against a newer note. Missing or corrupt
review checkpoints are terminal lifecycle errors.

Only preparation and action execution convert tool-local exceptions to failure values. Expected
domain errors retain their correction advice. Unexpected application errors use a safe message and
no-retry advice; the original exception is recorded on the active trace. Cancellation and lifecycle
invariants escape. The outer executor, checkpoint, event journal, provider transport, and MCP
transport remain outside this recovery boundary. A journal failure after a write must not invite a
second write.

Malformed protocol messages remain owned by the SDKs. In particular, the installed Agents SDK
parses malformed JSON before invoking any application callback and returns its own JSON correction
message. This is distinct from a JSON object that violates a tool schema, which always reaches the
shared boundary. No private SDK hooks or output-prefix readers are used.

## Verification

| Invariant                                                           | Enforcement                                            | Behavioral evidence                                                                                                                                         |
| ------------------------------------------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Invalid arguments cannot write or request approval.                 | Shared binder before chat approval and MCP action.     | `tool-lifecycle.spec.ts`: zero/six edits, concurrent calls, read, ordinary mutation and discovery; `mcp-tool-factory.spec.ts`: invalid and corrected calls. |
| Recovery reaches the next model generation.                         | Failure is a normal SDK tool output.                   | The real streaming runner uses a fake model that corrects only after seeing the failure.                                                                    |
| Approval applies the saved review, including after serialization.   | Reviewed action closure and saved-review restoration.  | Serialized resume, rejection, and stale revision tests in `tool-lifecycle.spec.ts`; note and skill review specs.                                            |
| Failure and success retain their call identities in stored history. | Event mapper and production run lifecycle.             | `controllers/agent/lifecycle.spec.ts`: a completed run stores the failed call and corrected success.                                                        |
| Internal tool faults reveal no implementation details.              | `toolCallFailure` and existing domain recovery policy. | Chat and MCP internal preparation fault tests.                                                                                                              |
| Cancellation and post-write persistence failure remain terminal.    | Recovery wraps only the action inside the executor.    | Runner cancellation and journal-failure tests; existing lifecycle cancellation tests.                                                                       |
| File recovery facts survive the wire projection.                    | Explicit file result projector.                        | MCP exact next-action test and domain virtual-file specs.                                                                                                   |
| Envelope parsing is structural and strict.                          | `toolFailureSchema`.                                   | `tool-failure.spec.ts`: reordered keys and corrupt reserved envelopes.                                                                                      |
| New SDK/MCP constructors cannot bypass the adapter.                 | AST `tool-boundary` audit.                             | `audit-source-rules.spec.ts`: aliases, namespace imports and re-exports.                                                                                    |

The dedicated diagram-generation submission protocol is an explicit constructor exception. It is
not the application tool catalog. Tests use real SDK runners and linked MCP transports with in-memory
domain repositories; they do not establish how reliably a live model chooses a useful correction.
