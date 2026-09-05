import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import FileOutput from './file-output.svelte';

const renderOutput = (
	headline: string,
	lines: readonly { readonly text: string; readonly context?: string }[]
) => render(FileOutput, { headline, lines });

describe('What a look inside the files came back with', () => {
	it('states the answer on its own line', async () => {
		const screen = await renderOutput('2 matches', []);
		await expect.element(screen.getByText('2 matches')).toBeVisible();
	});

	it('shows each line that came back', async () => {
		const screen = await renderOutput('1 match', [
			{ text: 'element61 should own the rollout', context: 'Infrastructure' }
		]);
		await expect.element(screen.getByText('element61 should own the rollout')).toBeVisible();
	});

	it('says where a line sits, when that is known', async () => {
		const screen = await renderOutput('Lines 3–4', [
			{ text: 'alpha', context: '3' },
			{ text: 'beta', context: '4' }
		]);
		await expect.element(screen.getByText('3', { exact: true })).toBeVisible();
	});

	it('renders no list when the answer is the headline alone', async () => {
		const screen = await renderOutput('No matches', []);
		expect(await screen.getByRole('list').all()).toHaveLength(0);
	});
});
