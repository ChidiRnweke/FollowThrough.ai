import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import FileOutput from './file-output.svelte';

const renderOutput = (lines: readonly { readonly text: string; readonly lineNumber?: number }[]) =>
	render(FileOutput, { lines });

describe('What a look inside the files came back with', () => {
	it('shows returned lines with their known numbers and no invented number', async () => {
		const screen = await renderOutput([{ text: 'alpha', lineNumber: 3 }, { text: 'beta' }]);
		const rows = Array.from(screen.getByRole('list').element().querySelectorAll('li'));
		expect(
			rows.map((row) => Array.from(row.children, (child) => child.textContent?.trim() ?? ''))
		).toEqual([
			['3', 'alpha'],
			['beta']
		]);
		await expect.element(screen.getByText('alpha')).toBeVisible();
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
