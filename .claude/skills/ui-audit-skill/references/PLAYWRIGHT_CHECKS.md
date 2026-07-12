# Playwright MCP Audit Checks

Use the available Playwright MCP tool names in the host client. The intent matters more than an exact tool spelling.

## Repository discovery boundary

Before browser review, use only directory-listing commands such as `ls`, `find`, or `tree` to identify candidate screens. Do not open, search, preview, parse, or summarize source contents. File contents become available only after each screen's expected interactions are frozen.

## Human-first route sequence

1. Enter through the normal application shell or visible navigation when practical.
2. Let the screen settle.
3. Capture the initial viewport screenshot before DOM-oriented inspection.
4. Record the first-glance page purpose, primary action, reading order, and confusion points.
5. Capture a full-page screenshot when useful.
6. Capture an accessibility snapshot for semantics and targeting.
7. Infer expected interactions from visible affordances and conventional patterns.
8. Freeze those expectations.
9. Exercise hover, focus, keyboard, click, drag, filters, menus, dialogs, forms, and responsive behavior as applicable.
10. Record console and failed network requests.
11. Run overflow and geometry measurements after the visual judgment is recorded.
12. Only after the freeze gate, inspect implementation when needed.

## Screen-subagent sequence

Every included screen should have an isolated review context and its own evidence packet. The subagent receives only:

- candidate screen name/path inferred from directory listing,
- base URL and fixtures,
- viewport matrix,
- safety constraints,
- audit rubric.

It must not receive source snippets, existing component names, CSS, or tests before freezing expectations.

## Interaction probes

### Hover

Check that the interactive target—not merely a nested icon—shows a coherent hover state. Compare the screenshot before and after hover. Do not assume hover behavior from CSS; observe it first.

### Keyboard

- Tab through the visible controls.
- Record focus order and visible focus treatment.
- Activate buttons with Enter/Space.
- Escape dismisses menus/dialogs when expected.
- Focus returns to the invoker after closing overlays.

### Drag-and-drop

For board or reorder surfaces:

- attempt pointer drag from a realistic grab point,
- capture lift/drag preview,
- verify valid drop targets communicate readiness,
- verify invalid targets do not accept the item,
- verify persistence after navigation or refresh when expected,
- find and test a keyboard/menu alternative.

### Overflow

Check all three levels:

1. document overflow,
2. component overflow (`scrollWidth > clientWidth`),
3. visual collision with badges/icons/absolute-positioned controls.

A CSS ellipsis is not automatically a pass. The full essential value must remain available.

### Long-content fixture

Where safe, create or edit data to include:

- 80–120 character title,
- long person or organization name,
- several tags/statuses,
- an unbroken token,
- translated-length copy.

Restore or discard disposable test data after capture.

## Suggested deterministic regression tests

```ts
import { expect, test } from '@playwright/test';

test('todo cards do not collide with trailing status controls', async ({ page }) => {
  await page.goto('/todos');

  const cards = page.getByTestId('todo-card');
  await expect(cards.first()).toBeVisible();

  const collisions = await cards.evaluateAll((nodes) =>
    nodes.flatMap((card, index) => {
      const title = card.querySelector('[data-testid="todo-title"]');
      const status = card.querySelector('[data-testid="todo-status"]');
      if (!title || !status) return [];

      const a = title.getBoundingClientRect();
      const b = status.getBoundingClientRect();
      const overlaps = !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
      return overlaps ? [{ index, title: title.textContent }] : [];
    })
  );

  expect(collisions).toEqual([]);
});
```

```ts
import { expect, test } from '@playwright/test';

test('page has no unintended horizontal overflow', async ({ page }) => {
  await page.goto('/todos');
  const dimensions = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.client + 1);
});
```

Use screenshot baselines for stable, high-value states after the design is accepted. Keep qualitative LLM findings out of blocking CI until they are converted into deterministic assertions.

## Component-test recommendation rule

At the very end of the audit, map reusable findings to isolated UI component tests. Specify the component, fixture, state, interaction, widths, semantic assertions, visual assertions, and linked finding. Prefer component tests when a mocked callback and deterministic props reproduce the problem; reserve E2E tests for integration seams.
