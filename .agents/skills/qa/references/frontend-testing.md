# Frontend testing

Test what the user can see and do. Keep pure presentation decisions in unit tests, interaction
and rendering in component tests, and application composition or browser behavior in public UI
workflows. Use the project's existing runner and supported browser setup.

## Choose a scenario

| Risk                                                      | Boundary                                        | Required observation                                                                                                  |
| --------------------------------------------------------- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Incorrect formatting or selection rule                    | Unit                                            | Independently known displayed value or decision                                                                       |
| A control does not perform its action                     | Rendered component                              | User interaction changes the visible result or emits the declared public event                                        |
| A form submits invalid data or hides errors               | Component; wider workflow for server validation | Invalid input shows the required error and causes no prohibited submission; valid input produces the expected outcome |
| Loading, empty, failure, or retry state is wrong          | Component with a controlled typed dependency    | The specified state appears, then changes correctly after the controlled result                                       |
| Routes, auth, wiring, or persistence break a goal         | Browser/application workflow                    | The goal succeeds through the public UI and the normal read path retains its result                                   |
| A control is clipped, obscured, or unusable at a viewport | Real browser                                    | It is visible, reachable, and usable in the required layout                                                           |

These are applications of behavior-based testing to UI work. DOM-only environments cannot
establish browser geometry or actual interaction reachability.

## Write an interaction test

1. Render the real component with minimal valid data. Keep the decisive label, value, and state
   visible in setup. Replace only needed I/O boundaries; keep rendering and event handling real.
2. Locate the control through its semantic role and accessible name, or another stable public
   identifier when semantic selection cannot express the target. Avoid CSS structure, framework
   internals, and private instance methods.
3. Perform the user action: type, select, submit, or activate the control through the runner's
   interaction API. A public component event can be the contract; an internal handler call is not.
4. Wait for the specified visible result with the runner's supported asynchronous assertions.
   Do not use fixed sleeps as evidence that rendering or a request finished.
5. Assert the complete relevant outcome: updated content, meaningful error, required event
   payload, or no prohibited effect. Do not snapshot the entire rendered tree for one rule.

## TypeScript: a real Svelte interaction and controlled async result

Use the following three files as a standalone example. Requires Svelte 5, Vite's Svelte plugin,
Vitest, `vitest-browser-svelte`, and `@vitest/browser-playwright`, with Chromium installed.
Run Vitest with `--config vitest.frontend.config.ts`. In an existing project, use its configured
browser runner and import the actual component; do not add a competing application setup.

`TitleEditor.svelte`:

```svelte
<script lang="ts">
	let { save }: { save: (title: string) => Promise<void> } = $props();
	let title = $state('');
	let saveState = $state<'idle' | 'saving' | 'saved' | 'error'>('idle');

	async function submit(): Promise<void> {
		saveState = 'saving';
		try {
			await save(title);
			saveState = 'saved';
		} catch {
			saveState = 'error';
		}
	}
</script>

<label>Title <input bind:value={title} /></label>
<button onclick={submit} disabled={saveState === 'saving'}>Save</button>
<p role="status">
	{saveState === 'saving'
		? 'Saving…'
		: saveState === 'saved'
			? 'Saved'
			: saveState === 'error'
				? 'Could not save'
				: ''}
</p>
```

`TitleEditor.test.ts`:

```typescript
import { expect, test } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import TitleEditor from './TitleEditor.svelte';

test('saving stays pending until the edited title is accepted', async () => {
	const submitted: string[] = [];
	let finish!: () => void;
	const completion = new Promise<void>((resolve) => {
		finish = resolve;
	});
	const save = async (title: string): Promise<void> => {
		submitted.push(title);
		await completion;
	};
	render(TitleEditor, { save });

	await page.getByRole('textbox', { name: 'Title' }).fill('Quarterly review');
	await page.getByRole('button', { name: 'Save' }).click();

	await expect.element(page.getByRole('status')).toHaveTextContent(/^Saving…$/);
	await expect.element(page.getByRole('button', { name: 'Save' })).toBeDisabled();
	finish();
	await expect.element(page.getByRole('status')).toHaveTextContent(/^Saved$/);
	expect(submitted).toEqual(['Quarterly review']);
});

test('a failed save displays an error and allows another attempt', async () => {
	const save = async (_title: string): Promise<void> => {
		throw new Error('Offline');
	};
	render(TitleEditor, { save });

	await page.getByRole('textbox', { name: 'Title' }).fill('Quarterly review');
	await page.getByRole('button', { name: 'Save' }).click();

	await expect.element(page.getByRole('status')).toHaveTextContent(/^Could not save$/);
	await expect.element(page.getByRole('button', { name: 'Save' })).toBeEnabled();
});
```

`vitest.frontend.config.ts`:

```typescript
import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { playwright } from '@vitest/browser-playwright';

export default defineConfig({
	plugins: [svelte()],
	test: {
		include: ['TitleEditor.test.ts'],
		browser: {
			enabled: true,
			headless: true,
			provider: playwright(),
			instances: [{ browser: 'chromium' }]
		}
	}
});
```

**Catches:** passing the old/wrong title, premature success while saving is pending, duplicate
submission of this action, hidden failures, or leaving Save disabled after failure.
**Bad replacement:** checking only that Save exists, calling `submit()` directly, or sleeping
for an arbitrary duration before checking success.

**Adapt:** preserve the actual public component contract. Here `save(title)` is an explicit
outgoing capability; recording its payload checks that contract, not a private handler call.
The typed pending promise controls timing without patching methods or using `vi.fn`.
These tests establish rendered behavior and requested save data; they do not prove server
persistence. See [Vitest component testing](https://vitest.dev/guide/browser/component-testing)
and [browser configuration](https://vitest.dev/guide/browser/).

## Python: browser interaction and a narrow-viewport control

Save as `test_editor.py`. Requires `pytest-playwright` and its Chromium browser. Run
`python -m pytest test_editor.py`. This complete example renders a small real frontend into a
browser page; use `page.goto` for the actual application when testing routes or persistence.

```python
import pytest
from playwright.sync_api import Page, expect


@pytest.fixture
def editor(page: Page) -> Page:
    page.set_viewport_size({"width": 320, "height": 640})
    page.set_content("""
        <form style="width:260px;margin:16px">
          <label>Title <input name="title" style="width:180px"></label>
          <button type="submit">Save</button>
          <p role="status"></p>
        </form>
        <script>
          document.querySelector('form').addEventListener('submit', event => {
            event.preventDefault();
            const title = document.querySelector('input').value;
            document.querySelector('[role=status]').textContent = 'Saved: ' + title;
          });
        </script>
    """)
    return page


def test_save_uses_the_edited_title(editor: Page) -> None:
    editor.get_by_role("textbox", name="Title").fill("Quarterly review")

    editor.get_by_role("button", name="Save").click()

    expect(editor.get_by_role("status")).to_have_text("Saved: Quarterly review")


def test_save_is_reachable_in_a_narrow_viewport(editor: Page) -> None:
    save = editor.get_by_role("button", name="Save")
    expect(save).to_be_in_viewport(ratio=1)

    save.click()

    expect(editor.get_by_role("status")).to_have_text("Saved: ")
```

**Catches:** a disconnected action, stale title, and a control outside the required viewport or
obscured so it cannot be activated. **Bad replacement:** `expect(save).to_be_attached()` can pass
for a clipped or unreachable control. Viewport membership alone does not establish hit-target
reachability; the click and its result supply that evidence.

**Adapt:** set the actual affected viewport, theme, panel state, and valid data. Keep full-viewport
visibility only when the UX requires it; scrollable controls have a different contract. Use
Playwright's retrying assertions rather than fixed sleeps. The fixture and assertion APIs are
in [Playwright's pytest plugin](https://playwright.dev/python/docs/test-runners) and
[Python assertions](https://playwright.dev/python/docs/test-assertions).

## Test asynchronous states deliberately

- **Loading:** keep the dependency pending; assert the required progress state and interaction
  availability. Then resolve it and assert the final content.
- **Empty:** return a valid empty result; assert the intended empty state and available action.
- **Failure:** return the specified failure; assert the user-visible error rather than fallback
  success content. If retry is part of the contract, activate it and verify recovery.
- **Validation:** provide the invalid input, submit, and assert the meaningful error and absence
  of prohibited effects. Cover server rejection through the real boundary when that is the risk.
- **Stale result:** when concurrent requests matter, resolve them in controlled reverse order
  and assert that the result for the current selection remains displayed.

Give each scenario fresh state and restore test-owned resources. Component tests with a typed
fake do not prove server compatibility; keep that evidence in integration tests. Critical
frontend goals may need [end-to-end coverage](end-to-end-testing.md); do not duplicate every
component variant through a browser workflow.
