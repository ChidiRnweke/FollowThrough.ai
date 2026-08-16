# Additional Checks Beyond Structural Architecture Analysis

A set of checks that complement a structural/import-graph architecture checker
(such as chisel). A structural checker sees the dependency graph — who imports
whom. It cannot see *what the code inside the files is doing wrong*: mocking
frameworks in tests, skipped tests without reasons, bundle bloat, stale
documentation, dead test globs. These checks close that gap.

The rules below are written to be **general-purpose** — applicable to any
layered codebase with a test suite and a build. The `examples/` directory
contains verbatim copies of one real-world implementation from a TypeScript /
SvelteKit consumer repo. They are illustrations, not generic implementations:
they still contain that repo's specifics (domain names, vendor exemptions,
path conventions). Generalise the configuration, not the code.

Each check below states what it catches, why a structural checker can't see
it, and a configuration sketch. Every check should be configurable via data
(denylists, thresholds, baselines) rather than hardcoded values.

---

## 1. Test-quality checks

Structural analysis treats test files like any other module. But test suites
have their own failure modes that silently erode confidence.

### 1.1 No mocking frameworks

**What it catches:** `jest.mock`, `vi.mock`, `vi.fn`, `sinon.*`, `unittest.mock`,
and friends — any call into a mocking library.

**Rule:** test doubles must be hand-written fakes — plain classes implementing
the same interface as the real dependency.

**Why:** mocking libraries are a crutch for architectures that can't construct
their own objects. In a layered architecture with injected dependencies you can
always instantiate directly; a mock is a signal that something is wired wrong.
Fakes are explicit, readable, debuggable, and refactor with the interface —
mocks don't.

**Config sketch:** a list of banned call patterns (regex per ecosystem).

### 1.2 One assertion per test

**What it catches:** test bodies containing more than one assertion call
(`expect(...)`).

**Rule:** exactly one assertion per test case. The test name describes the
invariant; when it fails, the name alone says what broke.

**Why:** multi-assertion tests fail at the *first* wrong assertion and hide the
rest; you read through a chain to find the red one. Splitting is nearly free.

**Config sketch:** assertion-call recogniser per framework; exemption list for
test types where multi-assertion is idiomatic (e.g. end-to-end specs).

### 1.3 Skipped tests must carry a reason

**What it catches:** `it.skip(...)` / `test.skip(...)` / `@pytest.mark.skip`
without a non-empty reason argument.

**Why:** a bare skip is invisible debt. A reason string ("blocked on upstream
X", "flakes under CI load — see issue N") makes the debt visible and
actionable.

### 1.4 Test doubles must implement a declared interface

**What it catches:** classes named `Fake*` / `Stub*` / `InMemory*` with no
`implements` clause (or the language equivalent — a Python class not
subscribing to its Protocol).

**Why:** an untyped fake drifts silently from the real interface. The type
checker should be the thing that tells you your fake is stale, not a failing
production path.

### 1.5 No unsafe casts to dependency types in tests

**What it catches:** patterns like `as unknown as FooDependencies` used to
shove a partial fake into a constructor.

**Why:** the cast exists precisely to silence the type error that would have
told you the fake doesn't match the interface. It defeats check 1.4.

**Config sketch:** banned cast regex, optionally scoped to layers (e.g. only
in service/controller tests, where dependency injection matters most).

### 1.6 No interaction assertions

**What it catches:** `toHaveBeenCalled*`, call-count assertions, argument
matching on doubles.

**Why:** interaction assertions test wiring, not behaviour. Refactor the
internals with identical behaviour and the tests still break. Assert on output
and state; the one legitimate exception (recording closures used as *fakes*)
should be explicit in the convention, not a loophole.

---

## 2. Topology and layering checks

These extend "who may import whom" with "what the tree is allowed to look
like".

### 2.1 Tombstones: removed paths may not reappear

**What it catches:** recreation of files or directories that were deliberately
deleted — usually generic buckets (`models/index.ts`, a catch-all `helpers/`,
a god-module that was split up).

**Why:** deletions of magnets-for-sprawl are architecture decisions. Without a
tombstone check, the bucket quietly regrows six months later.

**Config sketch:** a list of repo-relative paths that must not exist.

### 2.2 Generic-bucket directory bans

**What it catches:** directory names that attract unrelated code — `pages/`,
`panels/`, `misc/`, `common/`, `shared/` (where "shared" means "nobody owns
this").

**Config sketch:** a denylist of path segments. Legitimate uses (a real
`common/` with a defined contract) are whitelisted explicitly, not implicitly.

### 2.3 Barrel-file import bans

**What it catches:** imports from global `index.ts` barrels of a layer (all
models, all services, all repositories).

**Why:** barrels erase the domain boundary — a consumer imports "the models
layer" instead of a specific domain, and the graph degenerates to
everything-imports-everything through one hub.

### 2.4 Deep-import discipline

**What it catches:** cross-feature imports that reach past a feature's
declared entry point into its internals (`import … from '<feature>/internal/
detail'`).

**Why:** the entry point *is* the feature's public contract. Deep imports make
internal refactors breaking changes for the whole repo. Within a feature,
relative imports are fine; across features, only the entry point.

### 2.5 Composition-root rules

**What it catches:** the wiring file (the one place that assembles the object
graph) importing concrete implementations, constructing classes other than
blessed factories, or containing cyclic-placeholder tricks (`LateValue`,
`undefined as unknown as T`, self-assignments to break cycles).

**Why:** if the composition root can reach for concretes ad hoc, layering
rules become unenforceable — every rule gets an exception at the wiring layer.
Cycles in the wiring graph are always fixable by restructuring; placeholders
hide the design problem.

### 2.6 Dedicated wiring directory

**What it catches:** factory/wiring modules scattered flat in a layer's root —
e.g. fifteen `*-factory.ts` files sitting next to the composition root,
configuration, and miscellaneous helpers.

**Rule:** wiring artifacts for a layer live in a dedicated directory
(`server/factories/`), and the layer root carries an explicit allowlist of
what may sit there.

**Why:** a flat layer root with N factory files has no readable shape; the
directory listing stops communicating architecture. Grouping wiring into one
place also makes checks 2.5 trivially scoped. The example repo has since
adopted this — `server/factories/` with `capabilities/` and `agent/`
subfolders beneath it — and the directory listing immediately reads as
architecture again.

**Chisel change required:** chisel's built-in `structure:unknown-server-folder`
rule currently *forbids* this layout. Its `$lib/server/` allowlist is
hardcoded to `controllers/`, `db/`, `repositories/`, `services/`, plus
`config.ts` and a single factory file — so a repo that groups its wiring into
`factories/` fails the check and needs a permanent per-repo exception. The
rule must treat `factories/` (with arbitrary subfolders beneath it) as a
first-class allowed location; the recommendation above is otherwise
unadoptable without silencing chisel. The minimum change is *allowing* it —
chisel could later go further and *prefer* `factories/` once a repo grows
past a handful of factory modules, but that preference belongs behind
configuration, not in the default.

**Config sketch:** per-layer, a list of filename patterns that must live in a
named subdirectory, plus the root allowlist.

### 2.7 Shape conventions for convention-named modules

**What it catches:** modules that follow a naming convention (`*-factory.ts`)
but violate the convention's contract — e.g. a factory module exporting zero
or two creator functions instead of exactly one.

**Why:** conventions only pay off when they're total. A check that each
convention-named module satisfies its shape turns "we usually do X" into
"X is guaranteed".

**Config sketch:** pairs of (filename pattern, structural assertion) — expressed
as regexes over exports where possible.

---

## 3. Configuration coherence checks

### 3.1 Test-runner globs must match files

**What it catches:** every `include` glob in the test-runner configuration is
expanded; any glob matching zero files fails.

**Why:** this is the "ran zero tests and passed" failure mode. A renamed
directory or a typo'd glob silently removes part of the suite while CI stays
green. It is one of the highest-value, cheapest checks in this document.

**Generalises to:** `tsconfig` path aliases that resolve to nothing, lint
override blocks whose `files` match nothing, any config that names paths.

---

## 4. Documentation coherence checks

### 4.1 Markdown path references must resolve

**What it catches:** backtick-quoted, repo-relative paths in maintained
documentation that don't exist on disk.

**Why:** docs rot fastest at their most useful point — "see the implementation
in `<path>`". A broken reference in architecture documentation actively
misleads the reader (and any agent following the docs).

**Config sketch:** which documents are maintained (allowlist), which path
shapes count as references (regex), which documents are exempt (scratch
notes, gap lists).

---

## 5. Build-output checks

### 5.1 Application-owned bundle budget

**What it catches:** emitted client chunks over a size threshold that contain
application code. Vendor-only chunks are tolerated through an *explicit*
exemption mechanism.

**Why:** bundlers warn at a threshold but never fail; the warning becomes
wallpaper and the application bundle grows monotonically. The subtle part is
distinguishing "application code crept into a big chunk" (a regression —
fail) from "a large vendor dependency is statically imported" (a known,
accepted cost — tolerate with a recorded justification). In the example
implementation the heuristic is: does the chunk's source reference paths under
the application source tree, or only dependency paths?

**Config sketch:** threshold in bytes, exemption list where each entry names
the vendor and the reason.

---

## 6. The ratchet pattern (cross-cutting)

Adopting these checks on a codebase with existing violations should not
require a flag day. Every check supports a **numeric legacy baseline**:

- violations ≤ baseline → report, warn, pass;
- violations > baseline → fail.

The baseline is committed to the repo. Existing debt is tolerated exactly
where it stands, any *growth* fails immediately, and paying debt down lets
you lower the baseline — a ratchet that only turns one way. When a baseline
reaches zero, the check becomes absolute.

This pattern is what makes strict rules adoptable: the alternative
("fix all 400 violations first") means the rule never lands.

---

## 7. Keeping checks and agent skills in sync

If AI agents write code in the repo, the checks are only half the feedback
loop. An agent should be *told* the rule (skill instruction) before it is
*caught* by the rule (audit failure).

**Both directions must hold:**

- Every enforced check should have a corresponding skill instruction —
  otherwise agents generate code that fails CI on rules they never saw.
- Every skill instruction should ideally have a check — a rule with no
  enforcement is aspirational, and agents (like humans) will regress it.

**Signals that a skill needs updating:**

- A check fails on code that the skill explicitly told the agent to write —
  the skill and the checks disagree; one of them is stale.
- A skill's examples reference a different language or framework than the
  repo it serves — e.g. a QA skill whose file-structure section is built
  around `conftest.py` and `test_*.py` while the repo it guards is TypeScript
  with colocated `*.spec.ts`. The philosophy survives translation; the
  examples don't.

### Recommendation: update the skill with a per-language reference — do NOT create a new skill

For the concrete case this proposal was drawn from (a `qa` skill with
language-agnostic philosophy but Python-first examples, guarding a TypeScript
repo), the verdict is:

1. **Keep the single `qa` skill.** Its core rules — no mocking libraries, one
   assertion per test, behaviour over implementation, invariants as the test
   spec — are already language-agnostic. Duplicating them into a second skill
   creates two copies of the philosophy that will drift.
2. **Add a TypeScript reference file with examples** —
   `references/testing-patterns-typescript.md` — covering: `it()`/`describe`
   structure; `InMemory*` fakes declared with `implements`; colocated
   `*.spec.ts` layout; the dependency-wiring helper pattern
   (`capabilityDependencies<Deps>({ ... })`); one `expect` per `it`;
   skip-with-reason; recording closures as the sanctioned way to observe
   function-typed dependencies.
3. **Make the skill's file-structure section language-neutral**, delegating
   to per-language references (the existing Python reference stays; the new
   TypeScript reference is its peer).
4. **Split into a new skill only** when a language's test idioms genuinely
   contradict the core philosophy — not when they merely need different
   examples. TypeScript does not contradict anything; it needs a reference,
   not a fork.

---

## 8. Design principles for the check implementations themselves

The example implementations share properties worth keeping in any port:

- **Exit-code-only CLI.** Zero is pass, non-zero is fail, everything human-
  readable goes to stderr/stdout. No config format, no plugin system.
- **One file per audit.** Each check is a single self-contained script that
  can be read top to bottom in one sitting. Comprehensibility beats reuse —
  three similar lines are better than a premature shared framework.
- **Standard library plus the compiler you already have.** The test-quality
  example uses the TypeScript compiler API (already a dependency) for accurate
  AST analysis; the rest are filesystem walks and regexes.
- **Fast enough for a pre-push hook.** Whole-repo scans in low hundreds of
  milliseconds. A check developers route around is a check that doesn't exist.
- **Failures print `file:line`.** Every violation message is directly
  navigable in an editor. No "see report.json".
- **Ratchetable.** Every check carries its legacy baseline as data, per §6.

---

## Examples

Verbatim implementations from a real consumer repo (TypeScript, run with
`node --experimental-strip-types`):

- `examples/audit-tests.ts` — test-quality checks (§1) and the ratchet (§6).
- `examples/audit-topology.ts` — topology, config coherence, and docs
  coherence (§2, §3, §4).
- `examples/audit-build-output.ts` — the bundle budget with a vendor
  exemption (§5).

Read them as "one way this looked in practice", with repo-specific values
(mermaid chunk exemptions, feature-name lists, blessed class names) standing
in for your own configuration.
