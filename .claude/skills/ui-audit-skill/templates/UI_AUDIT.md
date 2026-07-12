# UI Audit — <Product>

**Audit date:** <YYYY-MM-DD>  
**Environment:** <URL / branch / commit>  
**Auditor:** <agent/model>  
**Viewports:** <list>  
**Implementation inspection began after:** `EXPECTED INTERACTIONS FROZEN`

## Executive summary

<3–7 sentences describing overall usability, the most important systemic issues, and the recommended order of work.>

### Priority counts

| Priority | Count |
|---|---:|
| P0 | 0 |
| P1 | 0 |
| P2 | 0 |
| P3 | 0 |
| Suggestion | 0 |

### Highest-leverage changes

1. <root-cause change>
2. <root-cause change>
3. <root-cause change>

## Scope and coverage

| Route | State(s) | Desktop | Laptop | Mobile | Interactions | Status |
|---|---|---:|---:|---:|---|---|
| `/example` | default, empty | ✓ | ✓ | ✓ | 4/5 | Partial |

### Excluded or blocked routes

| Route | Reason | Evidence |
|---|---|---|
| | | |

## Expected interaction contract

> This section was written before implementation inspection. Verification results were appended later.

| ID | Route/state | Expected interaction | Basis | Importance | Browser result | Implementation result |
|---|---|---|---|---|---|---|
| INT-001 | | | | Must | Pending | Pending |

## Findings

### UI-001 — <Concise problem statement>

**Priority:** P1 — Major  
**Confidence:** High  
**Route/state:** `/route` — `<state>`  
**Viewport:** `1024 × 768`  
**Criterion:** Text overflow and content resilience

**Observation**  
<What is visibly happening.>

**Evidence**

- Screenshot: `screenshots/<file>.png`
- Accessibility/DOM evidence: <brief result>
- Reproduction: <steps>

**User impact**  
<Why this affects comprehension, completion, confidence, accessibility, or speed.>

**Recommendation**  
<Specific relationship or behavior to change. Include a plausible implementation direction, not a prescriptive redesign unless necessary.>

**Acceptance criteria**

- [ ] <observable result>
- [ ] <observable result>
- [ ] <observable result>

**Implementation verification**

- Classification: Missing / Broken / Undiscoverable / Inaccessible / Intentional but harmful / Environment blocked
- Relevant code: `<path:line>`
- Root cause: <explanation>

**Regression coverage**

- Automated: <Playwright check, visual snapshot, component test, or accessibility assertion>
- Manual: <hover, keyboard, drag, responsive, or visual check>

---

## Route-by-route notes

### `/route` — <Screen name>

**Purpose:** <what the screen helps the user do>  
**Primary task:** <task>  
**Screenshots:** <files>

#### Information architecture

<notes>

#### Visual hierarchy and typography

<notes>

#### Spacing, alignment, and decorative accents

<notes>

#### Overflow and responsive behavior

<notes>

#### Interaction behavior

<notes>

#### Accessibility and semantics

<notes>

## Systemic patterns

| Pattern | Affected routes/components | Recommended owner-level fix |
|---|---|---|
| | | |

## Implementation plan

### Now

- <P0/P1 tasks>

### Next

- <P2 tasks and shared-component fixes>

### Later

- <P3 and optional enhancements>

## Regression-test backlog

| Test | Layer | Routes/components | Priority |
|---|---|---|---|
| No title/status collision at supported widths | Playwright layout assertion + screenshot | Todo cards | P1 |

## Limitations

- <Anything not reached or not verified>