import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { createRawSnippet } from 'svelte';
import ErrorBoundary from './error-boundary.svelte';

/** Stands in for any component that throws while rendering. */
const throwing = createRawSnippet(() => ({
	render: () => {
		throw new Error('the renderer gave up');
	}
}));

const intact = createRawSnippet(() => ({ render: () => '<p>still here</p>' }));

describe('ErrorBoundary', () => {
	it('renders its children when nothing goes wrong', async () => {
		const screen = await render(ErrorBoundary, { children: intact });
		await expect.element(screen.getByText('still here')).toBeVisible();
	});

	it('contains a throwing child instead of propagating', async () => {
		const screen = await render(ErrorBoundary, { label: 'this diagram', children: throwing });
		await expect.element(screen.getByRole('alert')).toBeVisible();
	});

	it('names what failed so the notice is not generic', async () => {
		const screen = await render(ErrorBoundary, { label: 'this diagram', children: throwing });
		await expect.element(screen.getByText(/Couldn't display this diagram/)).toBeVisible();
	});

	it('keeps the raw source readable when the rendering fails', async () => {
		const screen = await render(ErrorBoundary, {
			label: 'this diagram',
			source: 'graph TD; A-->B',
			children: throwing
		});
		await expect.element(screen.getByText('graph TD; A-->B')).toBeVisible();
	});

	it('offers a way back rather than a dead end', async () => {
		const screen = await render(ErrorBoundary, { children: throwing });
		await expect.element(screen.getByRole('button', { name: 'Try again' })).toBeVisible();
	});

	it('renders the recovered child when the user retries', async () => {
		let ready = false;
		const child = createRawSnippet(() => ({
			render: () => {
				if (!ready) throw new Error('The content is not available yet');
				return '<p>Recovered content</p>';
			}
		}));
		const screen = await render(ErrorBoundary, { children: child });
		ready = true;
		await screen.getByRole('button', { name: 'Try again' }).click();
		await expect.element(screen.getByText('Recovered content')).toBeVisible();
	});

	it('keeps the fallback available when retry still fails', async () => {
		const screen = await render(ErrorBoundary, {
			source: 'Preserved document',
			children: throwing
		});
		await screen.getByRole('button', { name: 'Try again' }).click();
		await expect.element(screen.getByText('Preserved document')).toBeVisible();
	});
});
