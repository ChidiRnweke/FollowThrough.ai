# End-to-end testing

Use this reference when the user-facing entry point, deployment, or full workflow adds evidence
that narrower tests cannot provide. Citations refer to the [book](sources.md).

## Be explicit about the boundary

End-to-end tests are a subset of integration tests. They normally exercise the application
from a user's or external client's perspective with all or most relevant real dependencies.
A browser is not required: an API application can have end-to-end tests through its public API.
Terms such as UI, functional, and integration testing overlap in practice, so describe the
entry point and actual dependency scope. (Ch. 2, §2.4.1, pp. 38–39;
ch. 4, §4.5.1, pp. 87–89.)

A substitute may be necessary when an external service lacks an automatable test environment
or is difficult to control. Disclose it. A passing workflow with a recorder proves the observed
application behavior, not delivery by the substituted provider.

## Choose a small set of valuable workflows

- Select critical user goals whose failure has significant consequences.
- Identify what the deployed or user-facing boundary adds beyond existing integration checks:
  application startup, public entry points, dependency composition, or a complete workflow.
- Keep most detailed business-rule variations in unit tests and real boundary variations in
  integration tests. Avoid repeating each variation through the slowest entry point.
- Add a deployment sanity check when it protects a real risk. The book's suggestion of one or
  two broad checks is contextual, not a universal maximum.

(Ch. 4, §§4.4.2, 4.5.1, pp. 81–82, 87–89; ch. 8, §8.3.3, pp. 195–196.)

The test pyramid is a cost/value guide, not a required ratio. A CRUD-heavy application may
benefit mainly from integration tests. For a small API with one out-of-process dependency,
end-to-end tests may have costs close to in-process integration tests. Choose the mix from
actual behavior, scope, feedback time, and operational burden. (Ch. 4, §4.5.1, pp. 87–89.)

## Assert through production-visible surfaces

Verify the user's result through the application. In an end-to-end test, use the application's
read path to observe managed persistence rather than reaching directly into private database
tables. Verify externally visible side effects where their contract can be observed. Database
inspection can be useful for diagnosing a failure, but changes the assertion boundary if it
becomes part of the test's evidence. (Ch. 8, §8.3.3, pp. 195–196.)

Expected outcomes must be independent of the production algorithm or serializer. Assertions
against internal implementation structure are brittle at any test level. Wider scope does not
by itself guarantee resistance to refactoring. See [Test design](test-design.md).
(Ch. 4, §§4.1.3–4.1.4, pp. 71–76; ch. 9, pp. 222–224.)

## Pay for reliability deliberately

Use controlled valid data and establish independence from other tests and previous runs.
Account for the dependency lifecycle, interruption, and failure diagnostics. A test must give
meaningful regression protection without a maintenance burden that removes its value.
(Ch. 2, pp. 37–39; ch. 4, §§4.3–4.4, pp. 79–86.)

Keep one behavior per test. Several acts can be justified when an exceptionally slow or
rate-limited dependency makes separate workflows materially expensive and the steps naturally
carry state forward. Document that cost; do not combine independent user goals merely to
share setup. (Ch. 3, §3.1.2, pp. 43–44; ch. 8, §8.5.4, pp. 204–205.)

Put expensive checks later in the feedback pipeline when faster checks detect the same defects
earlier. The book suggests running them after quicker tests, potentially on a build server.
Use the project's actual delivery workflow; do not create a universal schedule or assume that
every E2E suite belongs in every local change. (Ch. 2, §2.4.1, p. 39.)
