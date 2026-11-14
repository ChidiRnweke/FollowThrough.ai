import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { CONNECTOR_CATALOG, type CatalogEntryView, type ConnectorId } from '$lib/models/connectors';
import ConnectorCatalog from './connector-catalog.svelte';

const view = (id: string, connectorId?: string): CatalogEntryView => {
	const entry = CONNECTOR_CATALOG.find((candidate) => candidate.id === id);
	if (!entry) throw new Error(`The catalog has no ${id}`);
	return {
		entry,
		availability: connectorId
			? { kind: 'connected', connectorId: connectorId as ConnectorId }
			: { kind: 'available' }
	};
};

const show = (catalog: readonly CatalogEntryView[]) => {
	const connected: string[] = [];
	const screen = render(ConnectorCatalog, {
		catalog,
		connecting: undefined,
		onconnect: (chosen) => connected.push(chosen.entry.id),
		onopen: () => {}
	});
	return { screen, connected };
};

describe('The connector catalog', () => {
	it('groups services by what they are for, in the catalog order', async () => {
		const { screen } = show([view('stripe'), view('linear'), view('gitlab')]);
		const headings = screen
			.getByRole('heading')
			.elements()
			.map((heading) => heading.textContent);
		expect(headings).toEqual(['Work and projects', 'Engineering', 'Payments']);
	});

	it('narrows to the services a search names, and connects the one chosen', async () => {
		const { screen, connected } = show([view('stripe'), view('linear'), view('gitlab')]);
		await screen.getByRole('textbox', { name: 'Find a service' }).fill('payments');
		const shown = screen.getByRole('button', { name: /^Connect / }).elements().length;
		await screen.getByRole('button', { name: 'Connect Stripe' }).click();
		expect({ shown, connected }).toEqual({ shown: 1, connected: ['stripe'] });
	});

	it('says when nothing matches, and links a connected service to its page', async () => {
		const { screen } = show([view('linear', '7d1c5c1e-9f0a-4b8e-8f43-2a6c1d9e5b10')]);
		await expect
			.element(screen.getByRole('link', { name: /Linear/ }))
			.toHaveAttribute(
				'href',
				'/settings?tab=connectors&connector=7d1c5c1e-9f0a-4b8e-8f43-2a6c1d9e5b10'
			);
		await screen.getByRole('textbox', { name: 'Find a service' }).fill('kubernetes');
		await expect
			.element(screen.getByText(/No service in the catalog matches “kubernetes”/))
			.toBeVisible();
	});
});
