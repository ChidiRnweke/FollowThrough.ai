import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { ConnectorsOverview } from '$lib/models/connectors';
import { linearConnector, teamDocsConnector } from '$lib/testing/connectors/fixtures/views';
import ConnectorList from './connector-list.svelte';

const show = (overview: ConnectorsOverview) => {
	const browsed: true[] = [];
	const screen = render(ConnectorList, { overview, onbrowse: () => browsed.push(true) });
	return { screen, browsed };
};

describe('The connector list', () => {
	it('says connectors are off on a server without keys, and offers nothing to add', async () => {
		const { screen } = show({ kind: 'unconfigured' });
		await expect
			.element(screen.getByText('Connectors are not set up on this server.'))
			.toBeVisible();
		await expect
			.element(screen.getByRole('button', { name: 'Add connector' }))
			.not.toBeInTheDocument();
	});

	it('invites the first connection from its empty state', async () => {
		const { screen, browsed } = show({ kind: 'ready', connectors: [] });
		await screen.getByRole('button', { name: 'Add connector' }).click();
		expect(browsed).toEqual([true]);
	});

	it('lists each connector with its host and tools, and flags one that needs a sign-in', async () => {
		const { screen } = show({
			kind: 'ready',
			connectors: [
				{
					connector: linearConnector({
						kind: 'reauthorization_required',
						reason: 'Linear no longer accepts this sign-in.',
						since: linearConnector().createdAt
					}),
					tools: { total: 24, unusable: 1, asking: 9, off: 2 }
				},
				{ connector: teamDocsConnector(), tools: { total: 1, unusable: 0, asking: 0, off: 0 } }
			]
		});
		const linear = screen.getByRole('link', { name: /Linear/ });
		await expect
			.element(linear)
			.toHaveAttribute('href', `/settings?tab=connectors&connector=${linearConnector().id}`);
		await expect
			.element(linear.getByText('mcp.linear.app · 24 tools · 9 ask first · 2 off · 1 unusable'))
			.toBeVisible();
		await expect.element(linear.getByText('Sign in again')).toBeVisible();
		const docs = screen.getByRole('link', { name: /Team docs/ });
		await expect.element(docs.getByText('docs.acme.example · 1 tool')).toBeVisible();
		await expect.element(docs.getByText('Sign in again')).not.toBeInTheDocument();
	});
});
