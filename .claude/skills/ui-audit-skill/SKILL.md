---
name: ui-audit
version: 1.3.0
description: Human-first, browser-led UI audit with Playwright MCP and per-screen subagents. Uses directory listings only to identify candidate screens, reviews and screenshots each screen, freezes expected interactions, tests them, and only then inspects implementation code when needed. Produces an actionable UI_AUDIT.md ending with UI component-test recommendations.
---

# UI Audit

Audit the product as a person encounters it: first by looking, then by trying, and only later by examining how it was built. The repository may be used initially only as a directory map. Do not read route-file contents, component implementation, event handlers, CSS, design tokens, or tests until the browser review and expected-interaction contract are complete and frozen.

## Required outcome

Create:

- `artifacts/ui-audit/UI_AUDIT.md`
- `artifacts/ui-audit/screenshots/`
- `artifacts/ui-audit/route-inventory.json`
- `artifacts/ui-audit/expected-interactions.json`
- `artifacts/ui-audit/subagent-manifest.json`
- `artifacts/ui-audit/screens/<route-id>.md` for each audited screen

The Markdown report must be useful to a designer and an engineer without requiring them to replay the audit. Every important finding needs evidence, impact, a concrete recommendation, acceptance criteria, and—after implementation verification—relevant code locations.

## Non-negotiable evidence order

Follow these phases in order:

1. **Filesystem-only screen discovery using directory listings**
2. **Per-screen browser observation and screenshots by subagents**
3. **Expected interactions, written and frozen**
4. **Interaction testing in the browser**
5. **Visual findings consolidated against the rubric**
6. **Targeted implementation inspection, only when needed**
7. **Cross-screen synthesis and actionable report**
8. **UI component-test recommendations at the very end**

Never inspect file contents before phase 3 is frozen. Do not let existing code redefine what a reasonable user would expect. Once written, preserve the original expected-interaction list; append verification results rather than rewriting expectations to match the implementation.

---

## Phase 1 — Discover candidate screens with listings only

Start by examining the filesystem topology. Prefer `src/routes`; also list common alternatives only when needed:

- `src/routes/`
- `app/`
- `pages/`
- `src/pages/`
- directories that are obviously named for navigation or screens

### Strict listing-only rule

During this phase, only directory and filename discovery is allowed. Use commands equivalent to:

```bash
ls
ls -la src/routes
find src/routes -maxdepth 3 -type f
find app -maxdepth 4 -type f -name 'page.*'
tree -L 3 src/routes
```

Do **not** use `cat`, `sed`, `head`, `tail`, `less`, `grep`, `rg`, editor previews, AST tools, language-server symbol inspection, import resolution, or any command that reveals file contents. Do not open a route file even when the route declaration and page implementation are colocated.

The purpose is only to create a provisional screen list from filenames and folders, for example:

```json
{
  "candidateId": "account-settings",
  "sourcePath": "src/routes/account-settings.tsx",
  "routeGuess": "/account-settings",
  "nameGuess": "Account settings",
  "confidence": "medium",
  "confirmedInBrowser": false,
  "assignedSubagent": "screen-account-settings"
}
```

A filename is evidence of a candidate screen, not proof of a reachable route. Confirm screens through the running product, visible navigation, and browser behavior. When a central router hides all route paths, record the topology as opaque and continue from the product's visible navigation. Opening the router is allowed only after the interaction freeze, and only if needed to close a coverage gap.

Exclude only files that are clearly non-screen artifacts from their names, such as tests, styles, loaders, API handlers, or generated files. Record uncertain items rather than silently excluding them.

### Subagent manifest

Create `subagent-manifest.json` before browser review. Assign every candidate screen to a screen-review subagent. Each assignment contains:

- candidate screen and probable route
- browser entry point
- required viewports
- fixture/account information
- safety constraints
- output path under `artifacts/ui-audit/screens/`
- the explicit prohibition on reading source contents before the freeze gate

Use one independent review context per screen. Parallel execution is preferred. When the host cannot run subagents concurrently, run them sequentially but preserve separate context and output packets so one screen's implementation or assumptions do not bias another.

Do not give screen-review subagents implementation snippets, component names, CSS, or existing tests. The coordinator may share only the directory-derived screen candidate, application URL, credentials/fixtures, and audit rubric.

### Coverage states

For each candidate screen, identify browser-reachable states without implementation inspection:

- default/populated
- empty
- loading, when naturally observable
- error, when safely inducible
- permission denied
- dialog/drawer/menu open
- validation error
- success/confirmation
- selected/filtered/sorted
- long-content or dense-data state

Do not invent unavailable states. Mark them `not reached` and explain why.

---

## Phase 2 — Browser-first visual audit by screen subagents

Each included screen must be reviewed by its assigned screen subagent. The coordinator should not perform the first-pass critique itself unless subagents are unavailable; in that case it must simulate isolated per-screen passes and say so in the limitations.

### Human-like observation protocol

Approach the product in the order a person would:

1. Enter through the normal application shell or visible navigation when possible.
2. Look at the rendered page at normal zoom before querying the DOM.
3. Capture an initial screenshot and record a three-to-five-second first impression: where the eye lands first, page purpose, primary action, apparent reading order, and anything visually confusing.
4. Perform a hierarchy pass before inspecting details: identify the first, second, and third strongest visual anchors; note whether they match the task's intended order; and check whether major sections are separable by typography, spacing, alignment, surface, or subtle dividers.
5. Scan from page-level structure to sections, cards, controls, and supporting metadata.
6. Infer behavior from visible affordances and familiar patterns rather than from source code.
7. Try the obvious primary task, then secondary controls, then edge cases.
8. Use accessibility snapshots and DOM measurements to validate or explain observations, not to replace the visual pass.

Do not begin by running overflow scripts, reading the accessibility tree, or searching the DOM for hidden controls. A human sees the rendered interface first. Hidden implementation detail must not become an invented user expectation.

Use Playwright MCP to operate the running product. Use accessibility snapshots for reliable targeting and screenshots for visual judgment. Use the available equivalents of:

- navigation
- accessibility snapshot
- viewport resize
- viewport screenshot
- full-page screenshot
- hover
- click
- keyboard input
- drag
- console inspection
- network inspection
- browser evaluation for measurable layout checks

### Default viewport matrix

Audit at least:

| Profile | Viewport | Purpose |
|---|---:|---|
| Desktop | 1440 × 900 | hierarchy, density, use of available space |
| Laptop | 1024 × 768 | breakpoint pressure and medium-width layouts |
| Mobile | 390 × 844 | reflow, touch targets, overflow, mobile navigation |

Adjust the matrix when the product explicitly targets different sizes. Record any viewport that was skipped.

### Capture protocol per route/state

For every reachable screen state:

1. Navigate through the normal shell when practical, using a deterministic fixture or test account.
2. Wait for the page to settle; avoid capturing transient loading unless loading is the state being audited.
3. Take the initial viewport screenshot before DOM-oriented inspection.
4. Record the first-glance reading order, apparent page purpose, primary action, and immediate confusion points.
5. Take a full-page screenshot when the page scrolls or overall rhythm matters.
6. Take an accessibility snapshot for semantics and reliable targeting.
7. Record console errors and failed network requests.
8. Inspect the screen without reading implementation code.
9. Identify visible affordances and implied interactions.
10. Write the screen's expected interactions and freeze them.
11. Exercise the main interactions and capture materially different states.
12. Run measurable layout checks after the visual judgment has been recorded.

Use stable filenames:

```text
{route-id}--{state}--{viewport}--{step}.png
```

Example:

```text
account-settings--default--desktop--initial.png
account-settings--default--desktop--save-hover.png
account-settings--validation-error--desktop--after-submit.png
```

### Required screen-subagent packet

Each screen subagent writes `artifacts/ui-audit/screens/<route-id>.md` containing:

- screen identity and browser-confirmed route
- screenshots and states reached
- first-glance impression
- page purpose and primary user task
- observed attention order: the first three places the eye is drawn
- intended reading order for the task
- section-separation assessment: typography, spacing, alignment, surfaces, and dividers
- expected interaction contract for that screen
- browser results for each interaction
- visual findings with evidence
- unresolved questions and blocked states
- no implementation claims until after the freeze gate

The subagent must include:

```text
EXPECTED INTERACTIONS FROZEN — implementation inspection may begin.
```

Only after that line may the same subagent, or a dedicated implementation-verification subagent, inspect relevant source files.

### Browser measurement checks

Use DOM measurements as evidence, not as a replacement for visual review.

#### Horizontal overflow

```js
() => ({
  viewportWidth: document.documentElement.clientWidth,
  documentWidth: document.documentElement.scrollWidth,
  hasHorizontalOverflow:
    document.documentElement.scrollWidth > document.documentElement.clientWidth
})
```

#### Elements that overflow their own box

```js
() => [...document.querySelectorAll('body *')]
  .filter((el) => {
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    return el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1;
  })
  .slice(0, 100)
  .map((el) => ({
    tag: el.tagName,
    text: (el.textContent || '').trim().slice(0, 120),
    className: typeof el.className === 'string' ? el.className : '',
    clientWidth: el.clientWidth,
    scrollWidth: el.scrollWidth,
    clientHeight: el.clientHeight,
    scrollHeight: el.scrollHeight,
    overflowX: getComputedStyle(el).overflowX,
    overflowY: getComputedStyle(el).overflowY
  }))
```

Treat intentional clipping as acceptable only when the user can still understand or reveal the content—for example through wrapping, an ellipsis plus tooltip/detail view, expansion, or a sufficiently descriptive accessible name.

---

## Phase 3 — Write expected interactions before code inspection

Create `expected-interactions.json` by merging the frozen per-screen contracts before opening any route file, page component, styles, hooks, or tests. Expectations must be formed from the rendered product, not from what the code happens to support.

Infer expectations from:

- visible labels and control semantics
- conventional behavior of the pattern
- cursor and hover feedback
- information architecture
- accessibility snapshot roles and states
- product context visible in the UI

Use this structure:

```json
{
  "route": "/account-settings",
  "state": "default",
  "interaction": "Save edited profile information",
  "trigger": "Activate the visible Save control after changing a field",
  "expectation": "The submission communicates progress, success or failure, preserves valid input, and moves focus appropriately when validation fails.",
  "basis": "Editable form with a visible Save control",
  "importance": "must",
  "verification": "pending",
  "evidence": []
}
```

### Interaction inference checklist

List applicable expectations, including:

- hover and pressed states for clickable elements
- visible keyboard focus
- Enter/Space activation
- tab order
- form validation and submission feedback
- loading, disabled, success, and failure feedback
- menu, popover, dialog, tooltip, and drawer dismissal
- filter, sort, search, and tab persistence
- selection and bulk actions
- drag-and-drop, reorder, resize, or column movement when the visual pattern implies it
- scrolling and sticky behavior
- truncation reveal behavior
- destructive-action confirmation and undo when appropriate
- navigation, deep links, browser back/forward, and refresh persistence
- touch behavior at mobile widths

Do not assume a card is draggable merely because it is a card. Do expect dragging when the layout is clearly a board/reorder surface, the product language suggests movement, or drag affordances appear. State confidence and basis.

### Freeze gate

Before continuing, add this line to the audit work log:

```text
EXPECTED INTERACTIONS FROZEN — implementation inspection may begin.
```

---

## Phase 4 — Exercise the interactions

Test the interaction contract in the browser before source inspection wherever possible.

For each expected interaction, classify:

- **Pass** — works and communicates state clearly
- **Partial** — works but feedback/discoverability/accessibility is weak
- **Fail** — visible affordance or expected pattern does not work
- **Not testable** — blocked by data, permissions, environment, or destructive risk
- **Not applicable** — expectation disproved by user-facing context, not by code

Capture the before state and the meaningful after state. For hover, focus, drag, loading, validation, and error states, screenshots are part of the evidence.

Do not trigger irreversible production actions. Use seeded or disposable data.

---

## Phase 5 — Visual audit rubric

Evaluate every route and meaningful state against the criteria below.

### 1. Information architecture

Check:

- page purpose is apparent within a few seconds
- page title, scope, grouping, and navigation agree
- related information is grouped and unrelated information is separated
- group-level actions are visually attached to the group they affect
- filters and view switches are placed near the content they control
- labels use the user's language rather than implementation language
- empty states explain both context and next action

Flag any group-level action when it is visually detached from the heading or region whose items it affects.

### 2. Visual hierarchy and attention direction

This is a mandatory, explicit audit criterion. Do not mark a screen as visually sound merely because it is clean, aligned, or low-noise. A screen fails hierarchy when a person cannot quickly tell where to look first, what belongs together, or what matters most.

Run a **three-second attention test** on the initial screenshot before reading individual labels. Record:

- the first three visual anchors the eye is drawn to
- whether those anchors match the screen's primary task
- whether the page title and primary action are discoverable without scanning every region
- whether major sections are visibly distinct from item-level content
- whether metadata, pills, icons, or decorative color compete with the primary content

Check whether the eye can distinguish, in order:

1. page purpose
2. primary task or next action
3. section/group
4. item title or primary content
5. supporting explanation
6. metadata/provenance
7. secondary actions

Flag the screen when:

- no clear focal point exists
- several regions have nearly equal visual weight
- headings, item titles, body copy, labels, and metadata are too similar in size or weight
- spacing between sections is not meaningfully larger than spacing within sections
- adjacent regions rely only on proximity and would benefit from a subtle divider, surface change, or stronger heading treatment
- large blank areas separate related content while dense clusters compress unrelated content
- badges, colored dots, dates, or other secondary details attract more attention than titles and actions
- users must read most of the page before understanding its structure

For each screen, create a small hierarchy map:

```text
Observed attention order: 1. <region> 2. <region> 3. <region>
Required task order:      1. <region> 2. <region> 3. <region>
Mismatch: <what competes, disappears, or appears out of sequence>
```

A strong finding explains the current attention order, the task-required order, and the specific levers that should change: font-size steps, weight, line-height, section spacing, grouping, alignment, surface contrast, or subtle dividers. Avoid the vague recommendation “improve hierarchy.”

### 3. Typography and content hierarchy

Check:

- font-size steps are deliberate and visibly distinct rather than nominal one-pixel differences
- the page has enough typographic levels for title, section heading, item title, body, and metadata without making every level unique
- weight is not carrying the entire hierarchy alone
- heading size, weight, and spacing work together
- muted text remains readable
- line length supports scanning
- labels, metadata, and body copy are visually distinct
- line-height is appropriate for density
- capitalization and terminology are consistent

When hierarchy is weak, recommend a relationship, not arbitrary pixel values—for example: enlarge and strengthen the page title, make section headings clearly distinct from card titles, reduce metadata prominence, and add more space before a new section than between rows inside that section.

### 4. Spacing, alignment, and rhythm

Check:

- spacing follows a small, repeatable scale
- internal card spacing communicates grouping
- section spacing is clearly larger than item spacing
- whitespace creates readable chunks rather than an undifferentiated field
- subtle dividers or surface changes are used where proximity alone does not make section boundaries clear
- dividers are quiet enough not to become visual noise
- baselines and edges align
- action rows are not arbitrarily detached from content
- dense and sparse regions are intentional
- available space is used to reduce avoidable truncation

Flag layouts that preserve large unused page space while forcing critical content into narrow boxes. Also flag pages that look clean but lack enough section spacing or separation to make the reading order obvious.

### 5. Decorative edge and accent discipline

This is an explicit audit criterion.

Flag card borders, left rails, color strips, gradients, shadows, or corner accents when they:

- do not encode a meaningful state, category, selection, or severity
- repeat on every item and therefore add noise rather than information
- pull attention away from the item title or primary action
- make the card feel visually unbalanced
- create an inconsistent edge compared with the rest of the design system
- resemble selection/error/status styling without carrying that meaning

A repeated colored edge on every item should be reported when it is decorative rather than semantic. Recommend removing it or tying it to a clear status/category with consistent system behavior.

### 6. Text overflow and content resilience

Check with realistic and adversarial content:

- long titles
- long names
- translated strings
- dates and large numbers
- tags and status pills
- missing values
- multiple badges
- code or unbroken tokens

Flag:

- hard clipping without ellipsis or reveal path
- text colliding with icons, badges, or status dots
- ellipses where the full value is essential but cannot be revealed
- content escaping card or viewport bounds
- vertical clipping caused by fixed heights
- awkward one-word wraps created by unnecessarily narrow containers

Text clipped beneath or into a trailing icon, badge, or control is a functional readability defect, not merely polish.

### 7. Layout and responsive behavior

Check:

- no unintended horizontal page scrolling
- columns reflow, scroll intentionally, or change view at narrow widths
- fixed/sticky elements do not cover content
- dialogs fit the viewport
- touch targets remain usable
- content order remains logical after reflow
- sidebar behavior is appropriate at smaller widths

### 8. Affordance and interaction feedback

Check:

- clickable elements look clickable
- hover does not carry essential information alone
- selected, active, checked, disabled, loading, success, and error states are distinct
- draggable surfaces communicate drag capability and drop targets
- destructive actions are distinguishable
- immediate feedback follows actions

### 9. Consistency

Check repeated components for consistent:

- padding
- corner radius
- borders and accents
- typography
- icon placement
- button hierarchy
- metadata order
- truncation behavior
- hover/focus/disabled states

### 10. Accessibility and semantics

Check:

- one coherent primary heading
- logical heading levels
- landmarks
- accessible control names
- form labels and errors
- keyboard access and visible focus
- dialogs are named and trap/restore focus correctly
- color is not the sole state indicator
- content remains understandable at zoom and narrow widths

Automated checks do not replace manual keyboard and visual inspection.

---

## Phase 6 — Inspect implementation only after the freeze gate, and only as needed

After every screen packet contains the freeze line, implementation inspection may begin. It is optional and targeted: inspect code to verify whether expected behavior exists, identify a likely root cause, locate the responsible component, and suggest tests. Do not read unrelated implementation merely to become familiar with the codebase.

Now open only the route/component files needed for unresolved expectations or actionable findings.

Inspect only what is needed to explain or verify findings:

- page and layout components
- interactive components
- CSS, utility classes, design tokens, and responsive rules
- handlers and state transitions
- drag-and-drop implementation
- tooltip/overflow behavior
- tests and stories
- data fixtures affecting the audited state

For every expected interaction, record:

- implementation present: yes/no/partial
- browser result
- code location
- likely root cause
- missing test coverage

Use these distinctions:

- **Missing implementation** — no relevant behavior exists
- **Implemented but broken** — code exists, observed result fails
- **Implemented but undiscoverable** — behavior works but affordance/feedback is inadequate
- **Implemented but inaccessible** — pointer path exists without adequate keyboard/semantic path
- **Intentional but harmful** — code deliberately creates the observed problem
- **Environment blocked** — unable to verify reliably

Never dismiss a visible problem because the code was intentional.

### Code evidence format

```text
src/features/example/ItemCard.tsx:42–61
src/features/example/item-card.css:18–34
```

When line numbers are unstable, cite the nearest component, selector, function, or token.

---

## Phase 7 — Synthesize the screen packets into the actionable audit

After all screen subagents complete, the coordinator performs a cross-screen synthesis. Deduplicate symptoms into shared component or layout causes, compare repeated patterns for consistency, and preserve screen-specific evidence. Do not erase legitimate disagreement between subagents; resolve it with the screenshots and browser evidence or record uncertainty.

Use `templates/UI_AUDIT.md` as the report skeleton.

### Severity

| Priority | Meaning |
|---|---|
| P0 — Blocker | prevents task completion, loses data, or makes a core path unusable |
| P1 — Major | materially harms comprehension, interaction, accessibility, or a common workflow |
| P2 — Moderate | recurring friction or visual defect with a clear user impact |
| P3 — Minor | polish or consistency issue with limited task impact |
| Suggestion | optional improvement without a demonstrated defect |

### Finding requirements

Every finding must contain:

- stable ID
- priority and confidence
- route, state, and viewport
- criterion
- concise problem statement
- observed evidence
- user impact
- recommendation
- acceptance criteria
- screenshot references
- implementation verification and code locations
- suggested automated and/or manual regression test

Prefer root-cause findings over long lists of symptoms. If one narrow card width causes four text collisions, report the shared layout cause and list affected examples.

### Recommendation quality

Avoid vague recommendations such as “improve spacing” or “make hierarchy clearer.” State the intended relationship and a plausible implementation direction.

Weak:

```text
Improve the card hierarchy.
```

Strong:

```text
Make the item title the dominant line, group explanatory content as one secondary block, and reduce metadata emphasis. Remove decorative accents unless they encode a real state. Separate the action row with a consistent spacing step.
```

### Acceptance criteria quality

Acceptance criteria must be observable:

```text
- At supported desktop widths, every primary item label remains readable without colliding with trailing controls.
- When truncation is necessary, the component exposes the full value on focus and hover and retains the full accessible name.
- The layout uses available content width before truncating essential information.
```

---

## Anti-overfitting rule

Do not use screenshots, findings, component names, or interaction patterns from prior audits as calibration examples for a new product. Treat each product and each screen as a fresh observation task.

The rubric defines categories of evidence, not expected defects. A screen must not be flagged merely because a similar defect appeared elsewhere. Findings require direct evidence from the current rendered screen, its current interactions, and—only after the freeze gate—its relevant implementation.

Subagents receive the neutral rubric and route assignment only. Do not preload them with prior project findings, preferred redesigns, screenshots from another product, or a list of defects they are expected to discover.

---

## Phase 8 — End with suggested UI component tests

The final section of `UI_AUDIT.md` must be **Suggested UI component tests**. It comes after findings, implementation planning, regression backlog, and limitations. Do not generate this section before implementation inspection because component boundaries, names, and the existing test stack may not yet be known.

Recommend focused component-level tests for reusable UI behavior and visual states uncovered by the audit. Prefer component tests over end-to-end tests when the defect can be reproduced with isolated props, fixtures, or mocked callbacks.

For each proposed test include:

- component and source path, when known
- linked finding or interaction ID
- state/fixture to render
- user interaction to perform
- visual, semantic, and behavioral assertions
- viewport/content variants
- suggested layer: Playwright Component Testing, Storybook interaction test, Testing Library, or the project's existing equivalent
- priority

Examples:

```text
CT-001 — ItemCard long-content resilience
Render the reusable item card with a long primary label, trailing control, multiple metadata tokens, and constrained widths. Assert no overlap, the full accessible name, the agreed wrap/ellipsis behavior, and a keyboard-accessible reveal path.
```

```text
CT-002 — ActionCard hierarchy and action states
Render representative content variants with default, hover, focus-visible, pending, success, and error states. Capture visual snapshots; assert that any colored edge is tied to a documented semantic state rather than always present.
```

```text
CT-003 — Section visual separation
Render adjacent populated sections with representative rows, badges, metadata, and actions. Capture component screenshots at desktop and laptop widths. Assert the agreed heading level, that the section gap is larger than row gaps, and that divider or surface treatment appears only where it clarifies major grouping.
```

Avoid vague entries such as “test the card.” Every recommendation should be implementable as a test ticket.

---

## Completion checklist

Do not call the audit complete until:

- [ ] route candidates were discovered with listing commands only; no file contents were read early
- [ ] `subagent-manifest.json` assigns every included screen to an isolated review context
- [ ] every screen has a completed subagent packet
- [ ] route inventory exists and exclusions are explained
- [ ] each included route has at least one screenshot at each required viewport
- [ ] meaningful overlays and interaction states were captured
- [ ] expected interactions were frozen before code inspection
- [ ] expected interactions have browser results and implementation verification
- [ ] decorative card accents were evaluated explicitly
- [ ] typography and visual hierarchy were evaluated explicitly
- [ ] every screen records observed attention order versus task-required order
- [ ] section separation was checked using typography, spacing, alignment, surfaces, and subtle dividers
- [ ] overflow was checked visually and measurably
- [ ] console and network failures were reviewed
- [ ] findings include acceptance criteria and code references
- [ ] a prioritized implementation plan and regression-test backlog are included
- [ ] the report ends with concrete suggested UI component tests

## Stop conditions and honesty

State limitations rather than guessing. Common limitations include unavailable credentials, inaccessible seed states, destructive actions, unstable data, missing mobile navigation, or a route that crashes before audit. A blocked screen remains visible in coverage with its blocker and evidence.