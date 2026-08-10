import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { EntityRef } from '$lib/components/agent';
import EntityList from './entity-list.svelte';

const TODO_ID = '2b1f0c44-1d3e-4a90-9f21-77c6b0a1e5d3';

const todo = (title: string, id?: string): EntityRef => ({
	kind: 'todo',
	...(id ? { id } : {}),
	title,
	named: true
});

const renderList = (entities: readonly EntityRef[], total?: number) =>
	render(EntityList, {
		entities,
		...(total === undefined ? {} : { total }),
		empty: 'Nothing came back.'
	});

describe('What came back is shown as the things themselves', () => {
	it('names each one rather than counting them', async () => {
		const screen = await renderList([todo('Draft the RFC'), todo('Book the review')]);
		expect(await screen.getByText(/Draft the RFC|Book the review/).all()).toHaveLength(2);
	});

	it('makes a thing that has somewhere to go a control', async () => {
		const screen = await renderList([todo('Draft the RFC', TODO_ID)]);
		await expect.element(screen.getByRole('button', { name: /Draft the RFC/ })).toBeInTheDocument();
	});

	it('leaves a thing with nowhere to go looking like nothing that opens', async () => {
		const screen = await renderList([todo('Draft the RFC')]);
		expect(await screen.getByRole('button').all()).toHaveLength(0);
	});

	it('counts the rows it did not show rather than listing them', async () => {
		const screen = await renderList([todo('One'), todo('Two')], 9);
		await expect.element(screen.getByText('…and 7 more')).toBeVisible();
	});

	it('says so plainly when a read found nothing, which is an answer and not an error', async () => {
		const screen = await renderList([]);
		await expect.element(screen.getByText('Nothing came back.')).toBeVisible();
	});
});
