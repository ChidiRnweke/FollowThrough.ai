import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import NoteTitleInlineInput from './note-title-inline-input.svelte';

type Screen = Awaited<ReturnType<typeof render>>;

const titleField = (screen: Screen) =>
	screen.getByRole('textbox', { name: 'Note title' });

const pressKey = (screen: Screen, key: string): void => {
	titleField(screen).element().dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
};

describe('NoteTitleInlineInput', () => {
	it('submits the trimmed title on Enter and advances the caret', async () => {
		const submitted: string[] = [];
		let advanced = false;
		const screen = await render(NoteTitleInlineInput, {
			initialValue: '  Draft  ',
			onsubmit: (value) => submitted.push(value),
			oncancel: () => undefined,
			onadvance: () => {
				advanced = true;
			}
		});
		await titleField(screen).fill('  Draft  ');
		pressKey(screen, 'Enter');
		expect({ submitted, advanced }).toEqual({ submitted: ['Draft'], advanced: true });
	});

	it('abandons the edit on Escape without submitting', async () => {
		const submitted: string[] = [];
		let cancelled = 0;
		const screen = await render(NoteTitleInlineInput, {
			initialValue: 'Original',
			onsubmit: (value) => submitted.push(value),
			oncancel: () => {
				cancelled += 1;
			}
		});
		await titleField(screen).fill('Discarded title');
		pressKey(screen, 'Escape');
		expect({ submitted, cancelled }).toEqual({ submitted: [], cancelled: 1 });
	});

	it('submits on blur', async () => {
		const submitted: string[] = [];
		const screen = await render(NoteTitleInlineInput, {
			initialValue: 'Untitled',
			onsubmit: (value) => submitted.push(value),
			oncancel: () => undefined
		});
		await titleField(screen).fill('Named note');
		titleField(screen).element().dispatchEvent(new FocusEvent('blur'));
		expect(submitted).toEqual(['Named note']);
	});

	it('submits once even when Enter and blur race', async () => {
		const submitted: string[] = [];
		const screen = await render(NoteTitleInlineInput, {
			initialValue: 'Untitled',
			onsubmit: (value) => submitted.push(value),
			oncancel: () => undefined
		});
		await titleField(screen).fill('Final');
		pressKey(screen, 'Enter');
		titleField(screen).element().dispatchEvent(new FocusEvent('blur'));
		expect(submitted).toEqual(['Final']);
	});
});
