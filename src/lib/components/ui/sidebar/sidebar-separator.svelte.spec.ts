import { expect, test } from 'vitest';
import { render } from 'vitest-browser-svelte';
import SidebarSeparator from './sidebar-separator.svelte';

test('renders when its forwarded ref starts unset', async () => {
	const screen = await render(SidebarSeparator);

	await expect.element(screen.getByRole('separator')).toBeInTheDocument();
});
