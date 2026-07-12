# UI Audit Rubric — Quick Reference

Apply this rubric only after an initial human-like visual pass. The first judgment should come from the rendered screen at normal zoom, not from source code, DOM queries, or existing tests.


Score each category from 0 to 3 and explain every 0 or 1.

| Score | Meaning |
|---:|---|
| 0 | broken, misleading, inaccessible, or prevents the task |
| 1 | substantial friction or recurring visual/interaction defect |
| 2 | usable with localized issues |
| 3 | clear, resilient, consistent, and appropriate for the task |

## Categories

1. Information architecture
2. Visual hierarchy
3. Typography and content hierarchy
4. Spacing and alignment
5. Decorative edge/accent discipline
6. Text overflow and content resilience
7. Responsive layout
8. Affordance and feedback
9. Consistency
10. Accessibility and semantics

## Explicit failure heuristics

- Repeated card accent has no semantic meaning.
- Group action is visually detached from the group it affects.
- All card text uses nearly the same size/weight/spacing.
- Important text is clipped, collides with an icon, or cannot be revealed.
- Large unused space exists while important content is unnecessarily truncated.
- A familiar board pattern lacks drag/drop feedback or an accessible alternative.
- Interactive elements have no hover, focus, pressed, loading, success, or failure feedback where applicable.
- Mobile reflow changes reading order or obscures the primary action.

## Human-like review prompts

Before inspecting semantics or measurements, ask:

- What do I think this page is for after three to five seconds?
- Where does my eye go first, second, and third?
- What looks clickable, draggable, selected, or disabled?
- What would I naturally try next?
- What information do I need but cannot readily see?
- Does the page use its available space in a way that supports the task?

Expected interactions must be written from these observations before implementation is read.
