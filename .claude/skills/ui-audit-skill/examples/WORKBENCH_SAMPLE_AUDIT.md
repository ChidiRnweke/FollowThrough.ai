# Workbench UI Audit — Screenshot Calibration Sample

> This is a sample of the expected report quality based only on the two supplied screenshots. In a live run, Suggestions and Todos would be assigned to separate screen-review subagents. Browser interaction and implementation verification were not performed, so those fields remain pending.

**Discovery method:** directory listing only; no source contents opened  
**Screen subagents:** `screen-suggestions`, `screen-todos`  

## Executive summary

The product has a clean shell and restrained palette, but the primary work surfaces underuse hierarchy and available width. The Suggestions cards use a repeated teal left rail that appears decorative rather than semantic, while the card typography gives several content layers nearly equal prominence. The Todos board forces common titles into narrow cards despite abundant unused horizontal space, causing clipping and collisions with status indicators. The first implementation pass should address shared card hierarchy and board sizing/overflow before smaller polish changes.

## Expected interaction contract — frozen before code inspection

| ID | Screen | Expected interaction | Basis | Importance | Browser result | Implementation result |
|---|---|---|---|---|---|---|
| INT-001 | Suggestions | Accept one suggestion and receive immediate success/removal feedback | Primary `Accept` button on every card | Must | Pending | Pending |
| INT-002 | Suggestions | Dismiss one suggestion with clear, reversible feedback where appropriate | Repeated `Dismiss` action | Must | Pending | Pending |
| INT-003 | Suggestions | Accept all suggestions in the named group, with scope and confirmation clear | Group-level `Accept all` action | Must | Pending | Pending |
| INT-004 | Suggestions | Buttons expose hover, focus, pressed, disabled, and in-progress states | Standard interactive controls | Must | Pending | Pending |
| INT-005 | Todos | Drag a todo between status columns with lift and drop-target feedback | Kanban-style status columns | Must | Pending | Pending |
| INT-006 | Todos | Move a todo without drag using keyboard or an explicit action menu | Accessible equivalent to board movement | Must | Pending | Pending |
| INT-007 | Todos | Reveal the full title when visual truncation is unavoidable | Clipped task titles contain essential information | Must | Pending | Pending |
| INT-008 | Todos | Switch Board/List and preserve the selected view appropriately | Visible segmented view control | Should | Pending | Pending |
| INT-009 | Todos | Filter All/Mine/Waiting on and communicate active state and result count | Visible filter group | Must | Pending | Pending |

`EXPECTED INTERACTIONS FROZEN — implementation inspection may begin.`

## Findings

### UI-001 — Decorative left rails add noise to every suggestion card

**Priority:** P2 — Moderate  
**Confidence:** High  
**Screen:** Suggestions  
**Criterion:** Decorative edge and accent discipline

**Observation**  
Every visible suggestion card has a teal left border/rail. The rail does not appear to distinguish type, status, priority, or selection because it is repeated identically across Todo, Backlink, Reference, and Diagram cards.

**User impact**  
The repeated accent pulls attention to the container edge rather than the suggestion title or action. It also resembles state/selection styling without conveying a state, which weakens the meaning of teal elsewhere.

**Recommendation**  
Remove the left rail from the default card. If color is needed to encode suggestion type or status, define a semantic mapping and pair color with a text/icon indicator rather than applying the same accent to all cards.

**Acceptance criteria**

- [ ] Default suggestion cards do not use a colored edge solely for decoration.
- [ ] Any remaining edge accent maps to a documented state or category.
- [ ] The item title and primary action are more visually prominent than the card boundary.

**Implementation verification:** Pending

---

### UI-002 — Suggestion-card content lacks a clear reading order

**Priority:** P1 — Major  
**Confidence:** High  
**Screen:** Suggestions  
**Criterion:** Visual hierarchy; typography; spacing

**Observation**  
Type labels, item titles, body copy, quoted source text, relationship/provenance, and timestamps use similar sizes, colors, and tight vertical spacing. The eye has to parse each line rather than scanning a stable hierarchy.

**User impact**  
Users comparing several AI proposals cannot quickly answer the core questions: what is being proposed, why, where it came from, and what action is required.

**Recommendation**  
Establish a repeatable card anatomy: compact type/status label, dominant proposal title, one supporting explanation block, a visually grouped source/provenance block, then a separated action row. Use size, weight, color, and spacing together rather than relying on subtle color differences.

**Acceptance criteria**

- [ ] In a five-second scan, the proposal title is the first text read inside each card.
- [ ] Explanation and source/provenance are visually distinct blocks.
- [ ] Metadata is less prominent than primary content but remains readable.
- [ ] Action spacing is consistent across all suggestion types.

**Implementation verification:** Pending

---

### UI-003 — “Accept all” is visually detached from the group it controls

**Priority:** P2 — Moderate  
**Confidence:** Medium  
**Screen:** Suggestions  
**Criterion:** Information architecture

**Observation**  
The `Accept all` action sits at the far right of a wide content row while the group heading is on the left. The large gap makes its scope less obvious, especially when another group begins below.

**Recommendation**  
Place the group action in the same header container as the group title, align it consistently, and include the group name in the accessible label. Consider showing the affected item count.

**Acceptance criteria**

- [ ] The action is visibly attached to the correct group header at all supported widths.
- [ ] Its accessible name identifies the scope.
- [ ] The action does not appear to apply to the whole page when it applies to one group.

**Implementation verification:** Pending

---

### UI-004 — Todo titles clip and collide with trailing status indicators

**Priority:** P1 — Major  
**Confidence:** High  
**Screen:** Todos — Board  
**Criterion:** Text overflow and content resilience

**Observation**  
Several common task titles are cut off at the right edge. In the Open column, teal status dots overlap or visually collide with the final characters. The truncation treatment is inconsistent and does not show an obvious way to reveal the full title.

**User impact**  
Users cannot reliably distinguish tasks with similar prefixes, and the status indicator obscures essential content.

**Recommendation**  
Reserve explicit trailing space for status controls and allow the title region to wrap or use a deliberate ellipsis. Expose the full title on focus/hover and through the accessible name. Avoid placing an absolutely positioned indicator over the text box.

**Acceptance criteria**

- [ ] No title overlaps a status dot, checkbox, badge, or card edge.
- [ ] Titles remain fully readable when space permits.
- [ ] Truncated titles have a visible and keyboard-accessible reveal path.
- [ ] Long-content fixtures pass at 1024 × 768 and 1440 × 900.

**Implementation verification:** Pending

---

### UI-005 — The board wastes available width while forcing narrow cards

**Priority:** P1 — Major  
**Confidence:** High  
**Screen:** Todos — Board  
**Criterion:** Layout, spacing, and responsive behavior

**Observation**  
The four board columns occupy a relatively narrow fixed region while a large portion of the main canvas is blank. Important task names are clipped inside those narrow columns.

**User impact**  
The interface sacrifices readability without gaining useful density. The problem affects multiple cards, so it is a layout root cause rather than isolated bad content.

**Recommendation**  
Let the board consume the available content width up to a sensible maximum, allocate columns using responsive fractions/minmax sizing, and switch to intentional horizontal scrolling or another responsive mode only when the minimum readable card width cannot be maintained.

**Acceptance criteria**

- [ ] At desktop and laptop widths, the board uses available space before truncating common task titles.
- [ ] Every column maintains an agreed minimum readable width.
- [ ] Narrow screens use an explicit responsive strategy rather than accidental clipping.

**Implementation verification:** Pending

## Suggested implementation order

1. Fix board width allocation and title/status layout.
2. Redesign the shared suggestion-card content hierarchy.
3. Remove or semanticize the repeated card left rail.
4. Reattach group actions to their headers.
5. Add deterministic overflow and screenshot regression coverage.


## Suggested UI component tests

> This section intentionally appears last. Component names and paths would be confirmed only after the expected-interaction freeze and targeted code inspection.

| ID | Component | Linked finding/interaction | Fixture/state | Exercise | Assertions | Priority |
|---|---|---|---|---|---|---|
| CT-001 | `SuggestionCard` | UI-001, UI-002, INT-001–004 | Each suggestion type; long title/body; default, hover, focus-visible, accepting, error | Hover, keyboard focus, Accept, Dismiss | Title is dominant; metadata is secondary; action states are visible; no decorative left rail unless it maps to a semantic state | P1 |
| CT-002 | `TodoCard` | UI-004, INT-007 | 120-character title, trailing status dot, due badge, waiting-on badge at 240 px and 320 px | Hover and keyboard focus | No overlap; full accessible name; agreed wrap/ellipsis; full title reveal works for pointer and keyboard | P1 |
| CT-003 | `TodoBoard` / column | UI-005, INT-005–006 | Four columns with dense cards at desktop and laptop widths | Drag card between columns; invoke keyboard/menu alternative | Lift and drop feedback; persisted move callback; minimum readable column width; board uses available width | P1 |
| CT-004 | Group header action | UI-003, INT-003 | Group with 1 and multiple suggestions | Focus and activate Accept all | Action is visually grouped with heading; accessible name includes group scope and count; loading/confirmation state is clear | P2 |
