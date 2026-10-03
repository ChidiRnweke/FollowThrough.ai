# Test doubles

Use typed, hand-written substitutes only where the test needs control or isolation. Keep
useful private in-memory collaborators real. Do not use mocking libraries or patch internals.

## Choose the substitute

| Need                            | Use                                     | Assert                                                       |
| ------------------------------- | --------------------------------------- | ------------------------------------------------------------ |
| Fixed incoming value or failure | Stub implementing the consumed contract | The application's resulting behavior, not query calls        |
| Simplified working state        | Fresh fake, often in memory             | Meaningful outputs/state; disclose unmodeled semantics       |
| Required unused argument        | Dummy                                   | Nothing about its use                                        |
| Observable outgoing effect      | Recorder/spy at an owned boundary       | Independently specified effects, including prohibited extras |

A recorder is a mock in behavioral purpose. The distinction is incoming data versus outgoing
effect, not a library or class name. A dependency can play both roles; assess each separately.
Commands and queries provide clues, but an API can legitimately return a value while changing
state.

## Put the recorder at the external edge

1. Identify the consumer that depends on the effect: recipient, message consumer, or support
   operator. Internal coordination is not enough.
2. Keep application translation and serialization real.
3. Replace the last owned seam before the external effect with a typed recorder.
4. Compare the complete relevant effects to independent expected values. Assert counts, order,
   and exact text only when those properties are contractual.

Do not assert input-stub query counts, internal service sequences, private database write
counts, or dispatcher calls. A private database is managed state: verify it through a real
[database test](database-testing.md). A recorder proves an attempted effect, not provider
acceptance or delivery.

## A recorder and its assertion

```typescript
interface OutboundMessages {
	send(payload: string): Promise<void>;
}

class MessageRecorder implements OutboundMessages {
	readonly sent: string[] = [];

	async send(payload: string): Promise<void> {
		this.sent.push(payload);
	}
}
```

Pass a fresh recorder to the workflow's owned outbound seam. After the action:

```typescript
expect(recorder.sent).toEqual(['contact-changed:account-7:new@example.test']);
```

The literal payload is independently specified. This comparison rejects missing, wrong,
duplicated, and extra messages when the contract requires that single message. For multiple
unordered effects, compare a multiset or sorted copies so duplicates still count. Do not assert
list order unless the consumer relies on it.

A function dependency can use a recording closure typed against the consumed signature. Do not
build a generic call-history framework. Implement the complete required contract; do not cast a
partial object into it or silently succeed for unsupported operations. Configure failures with
normal typed constructor inputs rather than overwriting methods.

## Keep substitutes honest

- A fake models only the stated contract. It cannot establish query, constraint, transaction,
  or provider compatibility. Use real integration evidence for those risks.
- Reuse small doubles when needed; do not create a double for every real collaborator.
- Wrap third-party I/O in owned vocabulary where a stable capability boundary is useful. Do
  not introduce interfaces for every library or dismantle project-accepted contracts merely
  because they have one production implementation.
- For required human support logs, record the necessary domain facts and occurrence. Verify
  exact machine-consumed payloads when contractual. Leave developer diagnostics unasserted.
- Avoid concrete partial overrides and production `isTest` branches. If valuable decisions
  require those tricks, use the remedies in [Testability](testability.md).

Business decisions separated from effects often need no recorders in unit tests. Do not relabel
an all-double workflow as real integration coverage to satisfy a naming convention.
