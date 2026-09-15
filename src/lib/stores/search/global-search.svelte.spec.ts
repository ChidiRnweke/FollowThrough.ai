import { expect, it } from 'vitest';
import { GlobalSearchStore } from './global-search.svelte';
import type { NoteId } from '$lib/models/notes';

it.each(['all', 'note'] as const)(
	'reports an unavailable workspace during %s replacement as an explicit outcome',
	async (scope) => {
		const search = new GlobalSearchStore();
		search.query = 'ship';
		await search.search();
		const result =
			scope === 'all'
				? search.replaceAll()
				: search.replaceInNote('a0000000-0000-4000-8000-000000000001' as NoteId);
		await expect(result).resolves.toEqual({
			kind: 'failure',
			message: 'Open the workspace before replacing text'
		});
	}
);
