# Test doubles

Use this reference to decide whether a substitute is needed and what its observations mean.
The skill uses typed, hand-written doubles. The book also uses mocking frameworks; the tooling
choice is separate from the behavioral role. Citations refer to the [book](sources.md).

## Classify the role, not the name

| Double          | Role                                                        | What to assert                                                                    |
| --------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Dummy           | Supplies an irrelevant required argument                    | Nothing about its use                                                             |
| Stub            | Supplies controlled input to the SUT                        | The SUT's resulting behavior, not query calls                                     |
| Fake            | Implements a simplified working substitute, often in memory | Meaningful results or state; disclose its fidelity limits                         |
| Recorder or spy | Records outgoing effects for examination                    | Effects that are observable at a valid system boundary                            |
| Mock            | Emulates and verifies outgoing interactions                 | The same justified boundary effects; this skill uses hand-written implementations |

The book groups these into input-supplying stubs and outgoing-effect mocks. A handwritten spy
is a mock in purpose. A class produced by a library named `Mock` can function only as a stub.
Names and tools do not establish the role. One double may supply an input and record a distinct
outgoing effect. (Ch. 5, §§5.1.1–5.1.4, pp. 93–97.)

Command/query separation is a useful clue: queries supply input without changing state;
commands produce effects. Real APIs sometimes combine the two, such as removing and returning
an item. Classify each observed interaction by its purpose rather than imposing a return-type
rule on all APIs. (Ch. 5, §5.1.5, pp. 97–98.)

## Decide whether the effect is behavior

1. Identify the client and the goal the assertion protects.
2. Decide whether the interaction crosses a meaningful application boundary and is observable
   to an independent consumer.
3. If it only gathers input or coordinates internal components, assert the resulting output
   or state instead.
4. If it establishes an external contract, record the effect at an owned boundary with enough
   real application code in front of it to exercise translation and serialization.

(Ch. 5, §§5.2–5.4, pp. 99–116; ch. 9, §9.1.1, pp. 219–222.)

Do not assert how often a stub was queried. That call is a means to a result. Do not assert an
internal service sequence, a dispatcher call, or private database write count when equivalent
implementations preserve the client's behavior. A private database is managed state, even
though it is out of process. Use real database integration tests to verify persistence.
(Ch. 5, §5.1.3, p. 96, §5.4, pp. 114–116; ch. 8, §8.2, pp. 190–193.)

## Verify the externally observable contract

An outbound recorder should let the test check:

- Required effects occurred with the independently specified payload.
- Prohibited effects did not occur.
- Duplicate or additional effects were absent when the contract prohibits them.
- Order or timing met the contract only when the consumer depends on those properties.

Exact counts are valuable when omissions or duplicates change behavior. “Exactly once” is not
the correct expectation for every effect; use the scenario's actual cardinality. Several
recorders can be necessary for one behavior if it has several external consequences.
(Ch. 9, §§9.2.2–9.2.3, pp. 225–227.)

Prefer examining the complete relevant recorded effects over asserting that at least one
matching effect exists when that would miss duplicates or extras. Keep expected serialized
values independent of the production serializer. A domain-specific assertion helper can make
the comparison clearer if it does not reuse the implementation being tested.
(Ch. 9, §9.1.2, pp. 222–224.)

## A typed recorder

Original TypeScript example, independent of any repository:

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

Pass a fresh recorder through the owned outbound seam. After the workflow, compare `sent` to
an independently specified list. Equality with that complete list checks payload, duplicates,
and extras together. An ordered list also checks order, so use an order-insensitive comparison
when order is not part of the contract. Do not pass the recorder in place of an internal
translator whose behavior the test should exercise.

A function-typed dependency can use a typed recording closure instead of a class. Type the
closure against the dependency's signature and observe domain effects. There is no need for a
generic call-history framework. In languages with protocols, implement the consumed protocol;
in dynamically typed languages, preserve and verify the dependency contract explicitly.

Use normal typed construction. Do not cast a partial object into a complete dependency or add
silent success defaults for unsupported operations. These construction rules apply the
skill's explicit-double policy and production-fidelity principle; they are not claims about a
specific library from the book.

## Use owned adapters at the external edge

Keep the adapter to an unmanaged third-party dependency in the application's vocabulary.
Expose the needed capability rather than the entire SDK. Replace the last owned seam before
the external effect, allowing the higher-level wrapper and its serializer to execute normally.
Mocking a third-party interface directly can encode incorrect assumptions about its behavior
and spread library changes through the tests. (Ch. 9, §§9.1.1, 9.2.4, pp. 219–222, 227.)

This does not require wrapping every library. The book exempts private managed dependencies
and in-process utilities from adapters introduced solely for mocking. A project can still
justify an interface for a separate architectural reason. (Ch. 8, §8.4, pp. 197–200;
ch. 9, §9.2.4, p. 227.)

Support logging has a qualified edge exception. If people need the occurrence and domain facts
rather than an exact text layout, recording the domain logger can provide enough protection.
Machine-consumed messages often require exact serialized contract checks. Do not assert
developer diagnostics as if they were required external effects.
(Ch. 8, §8.6, pp. 205–213; ch. 9, §9.1.3, pp. 224–225.)

## Keep the substitute honest

Use a working fake when its simplified state is useful for a fast test, not to prove the
database's real semantics. Give each test fresh state. Make failures configurable through
normal typed inputs; do not mutate private methods or add a test switch to production logic.
Keep the states and outcomes valid for the contract being substituted. Report important
unmodeled behaviors instead of implying equivalent integration protection.
(Ch. 2, pp. 27–34; ch. 10, pp. 242–246; ch. 11, §11.4, pp. 266–268.)

Reuse small, clear doubles when they genuinely recur. A fake is not inherently tiny, correct,
or easy to maintain. A large graph of doubles can hide mixed responsibilities. Do not create
them before deciding whether real private collaborators would be simpler.
(Ch. 2, §2.3.2, p. 35; ch. 6, §6.2.3, pp. 125–127.)

## Avoid partial mocks and misleading labels

Overriding one method of a concrete class while preserving its remaining production behavior
often compensates for a class that mixes decisions with external I/O. Prefer separating the
calculation from the gateway when that design change is in scope. Do not add runtime
`isTest` switches or expose private methods for substitution.
(Ch. 11, §§11.4–11.5, pp. 266–271.)

The book's “mocks belong in integration tests” recommendation follows its separation of pure
business decisions from external orchestration. Use that reasoning to choose the boundary;
do not relabel an all-double workflow as real integration evidence to satisfy a naming rule.
(Ch. 9, §9.2.1, p. 225.)
