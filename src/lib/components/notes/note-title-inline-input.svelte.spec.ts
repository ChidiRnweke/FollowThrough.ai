import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import NoteTitleInlineInput from './note-title-inline-input.svelte';

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
		await screen.getByRole('textbox', { name: 'Note title' }).fill('  Draft  ');
		await screen.getByRole('textbox', { name: 'Note title' }).press('Enter');
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
		await screen.getByRole('textbox', { name: 'Note title' }).fill('Discarded title');
		await screen.getByRole('textbox', { name: 'Note title' }).press('Escape');
		expect({ submitted, cancelled }).toEqual({ submitted: [], cancelled: 1 });
	});

	it('submits on blur', async () => {
		const submitted: string[] = [];
		const screen = await render(NoteTitleInlineInput, {
			initialValue: 'Untitled',
			onsubmit: (value) => submitted.push(value),
			oncancel: () => undefined
		});
		await screen.getByRole('textbox', { name: 'Note title' }).fill('Named note');
		await screen.getByRole('textbox', { name: 'Note title' }).blur();
		expect(submitted).toEqual(['Named note']);
	});

	it('submits once even when Enter and blur race', async () => {
		const submitted: string[] = [];
		const screen = await render(NoteTitleInlineInput, {
			initialValue: 'Untitled',
			onsubmit: (value) => submitted.push(value),
			oncancel: () => undefined
		});
		const field = screen.getByRole('textbox', { name: 'Note title' });
		await field.fill('Final');
		await field.press('Enter');
		await field.blur();
		expect(submitted).toEqual(['Final']);
	});
});
