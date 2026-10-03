# Integration testing

Use this reference when the defect can occur between application parts or at a real dependency
boundary. Read [Database testing](database-testing.md) for persistence mechanics and
[Test doubles](test-doubles.md) for external effects. Citations refer to the [book](sources.md).

## Choose scope by the missing evidence

Integration tests establish that the application's parts work together. They commonly exercise
an application workflow with real domain logic and a managed external dependency. Testing
each part with substitutes cannot establish that their real combination works.
(Ch. 8, §8.1, pp. 185–187.)

The classical definition includes tests that fail any unit-test criterion: a single behavior,
fast execution, or isolation between tests. Other schools use different labels. State which
boundary and dependencies a test exercises; do not use its directory or class count as proof
of scope. A controller exercised entirely with doubles may remain a fast isolated test, but it
does not establish the integrations those doubles replace. (Ch. 2, §2.4, pp. 37–40;
ch. 8, §8.1.1, pp. 186–187.)

## Classify dependency surfaces by ownership

| Surface   | Meaning                                                                                 | Default evidence                                           |
| --------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Managed   | Controlled by the application; other systems do not directly depend on its interactions | Use the real dependency and check resulting state          |
| Unmanaged | Other systems or people can observe the interaction and depend on its contract          | Use an owned typed recorder to verify the emitted contract |

A private application database is normally managed. Outbound mail and published messages are
normally unmanaged. A database can contain both private tables and tables consumed directly
by other applications. Classify those surfaces separately. Being out of process alone does not
decide whether interaction assertions are appropriate. (Ch. 8, §8.2, pp. 190–192.)

Keep meaningful application code real up to the owned boundary that receives the externally
visible effect. For example, execute the event translation and serialization before recording
the outbound payload. Replacing an internal dispatcher loses evidence about that translation.
See [Test doubles](test-doubles.md). (Ch. 9, §9.1.1, pp. 219–222.)

A recorder can prove what the application attempted to send. It cannot prove that a real
provider accepted or delivered it. When provider compatibility is the missing evidence, use an
appropriate real test environment and report its scope separately. This distinction applies
the book's boundary and regression-protection criteria; it is not a claim that all providers
must be contacted in every integration test.

## Select scenarios by added protection

- Put most business-rule variations and boundary cases in fast unit tests.
- Start integration coverage with a successful workflow that exercises the relevant real
  dependencies. Prefer a path that covers all the participating boundaries. Add other paths
  when one cannot cover them or their distinct risks.
- Add failure scenarios that unit tests cannot protect, such as transaction consistency,
  mapping or constraint behavior, and failure consequences at the actual integration boundary.
- Assess overlap before adding another layer's test. A smaller suite with distinct protection
  is more useful than repeated checks of the same behavior through expensive setup.

(Ch. 8, §§8.1.2–8.1.3, 8.3.1, pp. 187–190, 194–195;
ch. 10, §§10.2, 10.5, pp. 234–243, 252–254.)

The book's “one happy path” recommendation is a starting point, not a quota. It also uses
“edge case” for a scenario ending in error; this reference includes successful boundary values
when they protect meaningful behavior. Do not turn a vocabulary choice into a coverage gap.

Fail Fast can make some extra integration tests low-value. Consider that only when the failure
is immediate, obvious on normal execution, already protected at a suitable level, and cannot
silently corrupt data. It does not justify omitting a recoverable failure, a delayed defect,
or a persistence-integrity scenario. Test domain preconditions where their meaning matters.
(Ch. 8, §8.1.3, pp. 188–190; ch. 7, §7.3.3, p. 169.)

## Verify results independently

After the workflow, read managed state independently of its input objects and write context.
Verify persisted facts rather than the number of repository calls. Inspect externally visible
effects at their contract boundary. Their presence, payload, absence when prohibited, and
cardinality can all belong to one behavior. (Ch. 8, §8.3.4, pp. 196–197;
ch. 9, §9.2.3, pp. 226–227; ch. 10, §10.2.2, pp. 242–243.)

Original language-neutral example:

```text
arrange: a confirmed account with old contact address in the real database
act: change its contact address through the application workflow
assert: an independent database read returns the new address
assert: the outbound recorder contains the specified address-change payload
assert: there are no duplicate or additional outbound effects
```

This scenario protects persistence and communication. It does not assert an internal service
sequence or count private database reads. Whether message order matters depends on the external
contract; assert it only when changing the order would change valid behavior.

## Missing infrastructure is a gap

If the managed dependency is unavailable, report that limitation. A fake-backed workflow may
still check useful behavior, but it is not equivalent integration evidence. Do not invent a
passing default or relabel the simulation as a database test. The book recommends concentrating
on domain unit tests rather than constructing elaborate private-database mocks when the real
database cannot be used. Retain any other genuine integration evidence that remains available.
(Ch. 8, §8.2.3, pp. 192–193.)

## Interfaces and architecture are conditional tools

An interface is useful when it represents a meaningful boundary or enables a justified test
substitute. An interface with one implementation does not automatically provide loose
coupling. Avoid speculative abstractions and interfaces introduced only to verify internal
domain calls. The book favors owned interfaces for unmanaged dependencies and concrete access
to managed ones. Follow the project's accepted architecture where it intentionally uses
repository contracts; review their purpose rather than mechanically removing them.
(Ch. 8, §8.4, pp. 197–200.)

Clear decision boundaries, limited indirection, and fewer runtime cycles improve test scope.
An interface can hide a compile-time cycle without removing the runtime cycle. Returning a
decision value can replace a callback. The book's suggested three-layer backend is an example,
not a requirement for every project. See [Testability](testability.md).
(Ch. 8, §§8.5.1–8.5.3, pp. 200–204.)

## Logging can be behavior

| Logging purpose                                                  | Test decision                                                             |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Developer diagnostics                                            | Treat as an implementation detail; avoid asserting wording or call counts |
| Required information for users, support staff, or administrators | Verify the required information and its occurrence                        |
| Machine-consumed external log contract                           | Verify the stable contract at the precision the consumer needs            |

For support obligations, a domain-language recorder can be sufficient. A meaningful domain
event can represent the fact, with orchestration translating it into a support log. Test the
decision and the external consequence at their respective boundaries. Exact rendering is
usually less important than content for human support logs; it may matter for machine
consumers. (Ch. 8, §8.6, pp. 205–213; ch. 9, §9.1.3, pp. 224–225.)

Keep dependencies explicit. Static logger lookup hides them. Structured fields separate facts
from rendering, but do not make every diagnostic record a tested requirement. The book favors
sparse diagnostics; treat that as logging-design advice rather than a universal ban on
operational instrumentation.
