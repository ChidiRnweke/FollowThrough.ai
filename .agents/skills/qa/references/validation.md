# Validation

Use this reference to review test quality, assess requirement coverage, or check architecture
compliance. Load the test-type references needed for the task. Citations refer to the
[book](sources.md).

## Evaluate four attributes

| Attribute                      | Review question                                                               | Typical weakness                                                                |
| ------------------------------ | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Protection against regressions | Which important defect would this test detect?                                | Trivial code, omitted outcomes, or assertions that also pass for a wrong result |
| Resistance to refactoring      | Would an equivalent implementation still pass?                                | Internal calls, private structure, generated SQL, or a copied algorithm         |
| Fast feedback                  | Is the feedback timely enough for the intended development cycle?             | Unnecessary broad scope or uncontrolled external dependencies                   |
| Maintainability                | Can readers understand the scenario, and can the environment be kept running? | Hidden fixtures, large double graphs, operational burden, or duplicate tests    |

The book presents these as a qualitative frame, not measurable scores. Its multiplicative
analogy warns that a near-zero attribute can erase the usefulness of a test. Do not generate a
numeric quality rating or claim that speed, coverage, and resilience can all be maximized.
Prefer strong refactoring resistance, then balance protection and feedback cost.
(Ch. 4, §§4.1–4.4, pp. 68–86.)

## Separate missed bugs from false alarms

A false negative is a defect the test misses. A false positive is a failure even though behavior
still meets the contract. Both reduce confidence. Repeated false alarms make developers ignore
real failures and avoid refactoring; this grows costly as the application matures. A green but
trivial test provides little signal merely because it rarely fails.
(Ch. 4, §§4.1.2, 4.2, pp. 69–71, 76–79.)

An intended contract change should change the test; that failure is useful. A harmless internal
rewrite should not require updating behavioral expectations. Signature changes may cause
straightforward compile errors rather than ambiguous assertion failures. Do not conflate
those with repeated runtime false alarms. (Ch. 4, §4.1.4, p. 76.)

For a questionable test, identify a concrete defect it catches and an equivalent implementation
it should permit. If it catches no meaningful defect or rejects the equivalent implementation,
rewrite or remove it when that work is authorized. Do not disable it merely to quiet a failure.

## Review the actual assertions

- Can the reader identify the client, scenario, action, and expected fact?
- Is the oracle independent of the production algorithm, serializer, or current ambient time?
- Would the assertion reject missing, empty, duplicated, or incorrectly mapped results relevant
  to the scenario?
- Are assertions about related outcomes of one behavior, rather than unrelated actions?
- Are interaction assertions limited to meaningful external effects? Are input-stub calls and
  internal collaboration left unasserted?
- Does a fresh independent read prove managed persistence, or does the test inspect its input
  object or cache?
- Is the test independent of execution order, previous runs, and hidden shared mutable state?
- Does the fixture represent a valid production scenario and expose the facts that matter?

(Ch. 1, §1.3.3, pp. 12–15; ch. 3, pp. 42–54; ch. 5, pp. 93–116;
ch. 9, pp. 222–227; ch. 10, pp. 242–249; ch. 11, pp. 264–273.)

Several assertions or several recorders do not automatically make a test unfocused. Conversely,
one compound assertion can hide unrelated claims. Review semantics, not just syntax.
(Ch. 3, §3.1.5, p. 47; ch. 9, §9.2.2, pp. 225–226.)

## Coverage is a question-finding tool

Line coverage tracks executed code and can change with formatting. Branch coverage better
describes executed alternatives, but neither measures whether outcomes were asserted or paths
inside external libraries were protected. High coverage can coexist with meaningless tests;
low coverage can expose real omissions. Do not impose the book's example percentage as a
threshold or aim for a universal coverage number. (Ch. 1, §1.3, pp. 8–15.)

Use white-box analysis to find unexercised paths, then write black-box assertions from the
meaningful behavior. Specifications and requirements are the primary oracle. Algorithmic
utility code can require implementation-aware investigation, but should still have independently
specified results. The book favors black-box test writing and names highly complex utility
code as a contextual exception. (Ch. 4, §4.5.2, pp. 89–90.)

Assess suite balance by the application's risks. Do not mandate pyramid ratios, test counts,
or one test per method. More covered code can improve protection only when the assertions
detect meaningful wrong outcomes. Dependencies, domain importance, and complexity matter too.
(Ch. 1, pp. 16–17; ch. 4, §§4.1.1, 4.5.1, pp. 68–69, 87–89.)

## Trace requirements without inventing a specification

Use available requirements, invariants, acceptance criteria, accepted decisions, and confirmed
regressions. No particular document is mandatory. Identify the source before interpreting code
as intended behavior. Where intent is missing, label an inferred or characterized contract and
ask for confirmation only if that ambiguity affects the task.

The following report structure is this skill's workflow, derived from the book's
specification-based testing and outcome-verification principles:

| Status                          | Evidence needed                                                                           |
| ------------------------------- | ----------------------------------------------------------------------------------------- |
| Implemented and protected       | An implementation mechanism plus a test that independently checks the required fact       |
| Implemented, protection missing | Implementation evidence; no adequate test found within the inspected scope                |
| Tested, assertion inadequate    | A purported test whose oracle, fixture, or assertion cannot detect the relevant violation |
| Missing implementation          | Confirmed requirement with no enforcing mechanism found                                   |
| Other guarantee                 | A type, schema, constraint, or other mechanism; state what it proves and its limits       |
| Unresolved                      | Missing intent or evidence; do not label it covered or absent without grounds             |

A runtime test is not automatically valuable for a fact already enforced by construction.
Database constraints may still need real integration evidence; compile-time properties may be
better protected by type checks. Distinguish the guarantee from its tested scope. Conversely,
a passing fake-based test does not establish a real database guarantee.

Do not require every test to name a formal invariant. A valid regression or external
compatibility scenario can protect an independently specified requirement without an invariants
file. For a review, record what was inspected and avoid claiming whole-suite completeness from
a sample. (Ch. 4, §4.5.2, pp. 89–90; ch. 8, pp. 190–197.)

## Check architecture against the project

Read accepted architecture decisions, project instructions, and the actual dependency rules.
Use the available deterministic audits for mechanical constraints. Trace ownership and runtime
collaboration when assessing behavior that import checks cannot establish. An interface does
not erase a runtime cycle. (Ch. 8, §§8.4–8.5, pp. 197–204.)

Do not invent a universal model/service/controller diagram, ban all controller branches, or
move logic solely to match the book's examples. Report a testability concern with a concrete
cost and a possible boundary change; keep production refactors within the authorized task.
If local enforcement conflicts with testing guidance, name the rule and its practical effect.
Do not add suppressions or weaken the checker to make the conflict disappear.

## Report findings that can be acted on

For each finding, provide the affected test or behavior, the problem, the defect or false alarm
it permits, and a concrete remedy. Give file locations when reviewing actual code. Distinguish
an application defect, a test defect, an evidence gap, and a policy constraint.

Prioritize by consequence and confidence, not by how many style rules the test breaks. Identify
redundancy by overlap in protected behavior and marginal value; different boundaries can
legitimately protect different risks. Report observed validation results and any unavailable or
substituted integration. Do not call static inspection a passing test run.
(Ch. 1, §§1.2.1, 1.4, pp. 7–8, 15–17; ch. 4, pp. 68–86;
ch. 10, §10.5.2, pp. 253–254.)

## Calibrate review decisions

These synthetic cases check whether the guidance leads to the intended decisions. They are
examples, not a requirement to add an identical test suite to every project.

| Case                                                              | Expected review decision                                                 |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------ |
| One reservation action checks confirmation and remaining capacity | Keep both meaningful outcomes together                                   |
| A test verifies how often an input repository was queried         | Replace the internal interaction assertion with an outcome               |
| An outbound message list contains the right payload twice         | Detect the duplicate if the contract requires one effect                 |
| A database fake passes a persistence workflow                     | Describe simulated behavior; real persistence remains unverified         |
| Assert reads the tracked object from arrange                      | Require independent persisted-state observation                          |
| Act and assert read the current clock separately                  | Supply a fixed instant or explicit clock input                           |
| A getter test raises coverage but protects no important fact      | Question its marginal value                                              |
| A short pricing rule has substantial business consequences        | Retain focused protection despite low code complexity                    |
| A test checks a private ORM construction invariant                | Recognize the real production contract; apply the narrow exception       |
| A test asserts exact developer diagnostic text                    | Remove implementation coupling; support obligations are a different case |
