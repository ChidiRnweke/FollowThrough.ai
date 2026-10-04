# Frontend tests

**What:** Results of typing/clicking, loading indicators, errors, and usable controls.
**When:** A screen interaction or displayed result changes.
**Type:** Component for individual screens/controls; end-to-end for routing, auth, or saved data.

## Saving must use the edited title and report its progress

While a save is pending, show “Saving…” and disable Save. After acceptance, show “Saved”
and submit the edited title. After failure, show “Could not save” and allow another attempt.
Click the real control and check those results, not just whether an element exists.

### Bad — checks presence after clicking

```typescript
// file: TitleEditor.bad.test.ts
import { expect, test } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import TitleEditor from './TitleEditor.svelte';

test('saving the edited title works', async () => {
	const save = async (_title: string): Promise<void> => {};
	render(TitleEditor, { save });
	await page.getByRole('textbox', { name: 'Title' }).fill('Quarterly review');
	await page.getByRole('button', { name: 'Save' }).click();
	await expect.element(page.getByRole('status')).toBeInTheDocument();
});

test('failed save works', async () => {
	const save = async (_title: string): Promise<void> => {
		throw new Error('Offline');
	};
	render(TitleEditor, { save });
	await page.getByRole('textbox', { name: 'Title' }).fill('Quarterly review');
	await page.getByRole('button', { name: 'Save' }).click();
	await expect.element(page.getByRole('button', { name: 'Save' })).toBeInTheDocument();
});
```

The status element still exists if the component submits the wrong title or shows no progress.
The button still exists if a failed save is incorrectly shown as successful or stays disabled.

### Solution — check submitted data, visible status, and button availability

```typescript
// file: TitleEditor.good.test.ts
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

The pending promise keeps saving unfinished until the test accepts it. The assertions catch
wrong titles, missing progress, and hidden failures. A fake save does not prove server persistence.

## A Save control must be reachable at a narrow viewport

At 320 pixels wide, this page's Save button must fit fully inside the viewport and work when
clicked. Check its geometry and the result of clicking. Presence alone cannot detect an offscreen button.

### Bad — checks attachment to the page

```python
# file: test_frontend_bad.py
from playwright.sync_api import Page, expect
from editor_fixture import editor

def test_save_is_reachable(editor: Page) -> None:
    expect(editor.get_by_role("button", name="Save")).to_be_attached()
```

Moving the button to a fixed position 500 pixels from the left leaves it attached, so this passes.

### Solution — check viewport reachability and click the control

```python
# file: test_frontend_good.py
from playwright.sync_api import Page, expect
from editor_fixture import editor

def test_save_is_reachable(editor: Page) -> None:
    save = editor.get_by_role("button", name="Save")
    expect(save).to_be_in_viewport(ratio=1)
    save.click()
    expect(editor.get_by_role("status")).to_have_text("Saved: ")
```

The viewport assertion fails for that misplaced button. Require full viewport visibility only
when the design requires it; scrollable controls have a different expectation.

## Runnable setup

Svelte: use Svelte 5, Vitest, `vitest-browser-svelte`, the Svelte Vite plugin, and the Playwright
browser provider. Run `vitest run --config vitest.frontend.config.ts`. Python: use pytest-playwright
with Chromium. Import the actual component/page in a project; these are standalone examples.

```svelte
<!-- file: TitleEditor.svelte -->
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

```typescript
// file: vitest.frontend.config.ts
import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { playwright } from '@vitest/browser-playwright';

export default defineConfig({
	plugins: [svelte()],
	test: {
		include: ['TitleEditor.*.test.ts'],
		expect: { poll: { timeout: 1000 } },
		browser: {
			enabled: true,
			headless: true,
			provider: playwright(),
			instances: [{ browser: 'chromium' }]
		}
	}
});
```

```python
# file: editor_fixture.py
import pytest
from playwright.sync_api import Page

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
```

Use retrying assertions, not sleeps. Keep requests pending to test loading; return explicit empty
results or errors to test those screens. Test layout in a real browser.
[Vitest browser setup](https://vitest.dev/guide/browser/),
[Playwright pytest](https://playwright.dev/python/docs/test-runners).
