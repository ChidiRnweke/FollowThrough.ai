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
	it('names every returned entity and makes only linkable items controls', async () => {
		const screen = await renderList([todo('Draft the RFC', TODO_ID), todo('Book the review')]);
		const list = screen.getByRole('list').element();
		expect({ text: list.textContent, buttons: list.querySelectorAll('button').length }).toEqual({
			text: expect.stringMatching(/Draft the RFC[\s\S]*Book the review/),
			buttons: 1
		});
	});

	it('counts the rows it did not show rather than listing them', async () => {
		const screen = await renderList([todo('One'), todo('Two')], 9);
		await expect.element(screen.getByText('2 of 9 returned')).toBeVisible();
	});

	it('says so plainly when a read found nothing, which is an answer and not an error', async () => {
		const screen = await renderList([]);
		await expect.element(screen.getByText('Nothing came back.')).toBeVisible();
	});
});
