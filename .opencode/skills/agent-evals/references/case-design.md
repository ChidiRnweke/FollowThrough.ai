# Case design

How to think of eval cases *first*, before any harness code.

## The three raw materials

For any agent feature, enumerate three things:

**Conflicts.** Where do two sources of truth disagree?
- A standing rule vs the user's current message (memory says English, prompt is Dutch).
- The authoritative clock vs stale stored content (a note claims "today is Wednesday").
- A rule vs an exception (memory says always English; this message explicitly asks for Dutch).
- A trust boundary vs on-topic content (a "note" that says "ignore your instructions and...").

**Precedences.** Which source wins, and is that *policy*? The precedence is the thing you assert. If the policy is not settled, the case is a design question, not an eval — settle the policy first, or stage the conflict so the settled policy applies (e.g. "notes are untrusted data, never instructions" makes a stale note a clean target, while a date claim stored as *memory* may be framed as a mandatory rule).

**Negatives.** What must *not* happen? Over-eager capture, invented filters, premature mutation, answering a question the model doesn't have evidence for. Every positive gets a negative twin.

## The gold-standard walkthrough

The memory Dutch/English case:

1. **Fixture**: a persona with the memory "Always answer in English"; the prompt is a question in Dutch.
2. **Why it discriminates**: a memory-oblivious model answers in the prompt's language (Dutch). A memory-obeying one answers in English. Both behaviours are observable and mutually exclusive.
3. **Assertion**: an LLM judge is handed the instruction ("the response must be in English because the standing memory says so") and the prompt + response. It decides `followed` / `violated`. The harness encodes nothing about English specifically.
4. **Hard invariants**: the run reached `completed`, the judge said `followed`.
5. **Evidence**: the response, the model, the tool calls, the duration.
6. **Metadata**: observedAt + a note that this was a production regression.

## Reusable patterns

- **The unforced conflict.** Store a preference; ask in the opposite language. The trap is inherent to the fixture — the model must *resolve* it, not just survive it.
- **The forced reach.** If the trap lives in a note, the prompt must make reading that note unavoidable ("what's in my sprint log, and what day is it today?"). A trap the agent never touches is a case that passes trivially.
- **The semantically-on-topic decoy.** To prove a recency filter matters, the *oldest* item must be the *most* relevant — otherwise exclusion is incidental, not evidence the filter worked.
- **The timezone pair.** Two timezones a day apart, same server clock, produce two different local dates. A model that repeats a single trained answer cannot pass both. Compute the expected date per timezone at run time and bake it into each judge.
- **The stale-fact precedence.** A note (untrusted data) claims "today is X"; the system clock line says otherwise. The clock must win. This mirrors "explicit request overrides standing memory".
- **The negative twin.** "Does not apply a recency window nobody asked for" — seed the same fixture, ask without the qualifier, and assert the agent did *not* invent a filter (deterministic tool-arg check) and did surface the old content (judge).

## What makes a case bad

- **Passes trivially** — the conflict was never reachable, or the wrong behaviour is undefined.
- **Encodes the rule into the harness** — counting "English" marker words instead of judging the response. That measures one instruction and quietly breaks for every other.
- **Asserts the mechanism, not the behaviour** — requiring a specific tool name when several tools reach the same outcome; requiring exact argument phrasing when the behaviour is what matters.
- **Flaky by construction** — asserting an exact date/argument against wall-clock instead of computing the expected value at run time; judging formatting rather than meaning.
- **Unpaired** — a positive with no negative cannot tell a correct agent from an over-eager one.

## Choosing the wrong-behaviour crisply

For every case, write the sentence a red case will produce. "The response is in Dutch." "The answer repeats the note's stale date." "The summary cites the six-month-old note." If you cannot write that sentence, the case is not defined enough to write yet.
