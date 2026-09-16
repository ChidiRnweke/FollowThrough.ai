import { expect, it } from 'vitest';
import { GlobalSearchStore } from './global-search.svelte';
import type { NoteId } from '$lib/models/notes';
import { replacementWorkspace } from '$lib/testing/notes/fixtures/replacement-workspace';

it('saves every reactive note when all local writes succeed', async () => {
	const fixture = await replacementWorkspace();
	try {
		fixture.outbox.appendFailures.clear();
		const search = new GlobalSearchStore(() => fixture.resources);
		search.query = 'ship';
		search.replacement = 'deploy';
		await search.search();
		await search.replaceAll();
		expect(fixture.resources.views.notes.map((note) => note.plainText)).toEqual([
			'deploy release',
			'deploy release',
			'deploy release'
		]);
	} finally {
		fixture.stop();
	}
});

it('reports the confirmed local save when the next durable queue write fails', async () => {
	const fixture = await replacementWorkspace();
	try {
		const search = new GlobalSearchStore(() => fixture.resources);
		search.query = 'ship';
		search.replacement = 'deploy';
		await search.search();
		await search.replaceAll();
		expect(search.searchError).toBe(
			'Saved replacements on this device in 1 note (Note 1). Save not confirmed for "Note 2": Device storage is full. 1 remaining note was not attempted. Review the saved changes before searching again.'
		);
	} finally {
		fixture.stop();
	}
});

it('keeps only the first replacement in the durable queue after a later failure', async () => {
	const fixture = await replacementWorkspace();
	try {
		const search = new GlobalSearchStore(() => fixture.resources);
		search.query = 'ship';
		search.replacement = 'deploy';
		await search.search();
		await search.replaceAll();
		expect(
			(await fixture.outbox.list(fixture.account)).map((entry) => entry.intent.command)
		).toMatchObject([{ kind: 'saveNote', plainText: 'deploy release' }]);
	} finally {
		fixture.stop();
	}
});

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
