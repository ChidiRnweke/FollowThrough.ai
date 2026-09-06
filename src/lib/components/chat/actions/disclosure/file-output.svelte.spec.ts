import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import FileOutput from './file-output.svelte';

const renderOutput = (lines: readonly { readonly text: string; readonly lineNumber?: number }[]) =>
	render(FileOutput, { lines });

describe('What a look inside the files came back with', () => {
	it('shows each line that came back', async () => {
		const screen = await renderOutput([{ text: 'element61 should own the rollout' }]);
		await expect.element(screen.getByText('element61 should own the rollout')).toBeVisible();
	});

	it('says where a line sits, when that is known', async () => {
		const screen = await renderOutput([
			{ text: 'alpha', lineNumber: 3 },
			{ text: 'beta', lineNumber: 4 }
		]);
		await expect.element(screen.getByText('3', { exact: true })).toBeVisible();
	});

	/**
	 * The count and the thing it counts said the same fact twice. Nothing came back, so
	 * nothing renders — the row above says so in words, where an absence belongs.
	 */
	it('renders nothing at all when nothing came back', async () => {
		const screen = await renderOutput([]);
		expect(await screen.getByRole('list').all()).toHaveLength(0);
	});
});
