import { expect, it } from 'vitest';
import { readArchiveImportResponse } from './import-response';
import { testNoteId } from '$lib/testing/workspace/fixtures/domain-builders';

it('reports a truncated successful response as an unreadable completed import', async () => {
	const result = await readArchiveImportResponse(
		new Response('{"importedNoteIds":', { status: 200 })
	);
	expect(result).toEqual({
		kind: 'failure',
		message: 'The import finished, but its report could not be read. Reload to see what landed.'
	});
});
it('preserves a partial import report with both created identities and failed bodies', async () => {
	const report = {
		importedNoteIds: [testNoteId()],
		createdFolderIds: [],
		skipped: [],
		failed: [{ path: 'broken.md', message: 'Body could not be saved' }],
		unmappedFrontmatterKeys: [],
		unresolvedLinks: []
	};
	expect(await readArchiveImportResponse(Response.json(report))).toEqual({
		kind: 'report',
		report
	});
});
it('preserves a readable server rejection', async () => {
	expect(
		await readArchiveImportResponse(
			Response.json({ message: 'Unsafe archive path' }, { status: 400 })
		)
	).toEqual({ kind: 'failure', message: 'Unsafe archive path' });
});
it('does not describe an unreadable server error as an unsent request', async () => {
	expect(
		await readArchiveImportResponse(new Response('<html>Gateway error</html>', { status: 502 }))
	).toEqual({
		kind: 'failure',
		message: 'The import returned an unreadable error. Check the project before trying again.'
	});
});
it('does not replace a malformed successful report with an empty import', async () => {
	expect(await readArchiveImportResponse(Response.json({ importedNoteIds: [] }))).toEqual({
		kind: 'failure',
		message: 'The import finished, but its report could not be read. Reload to see what landed.'
	});
});
