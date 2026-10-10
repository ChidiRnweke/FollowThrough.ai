import { syncEtag } from '$lib/models/sync';
import { noteBuilder } from '$lib/testing/workspace/fixtures/domain-builders';
import { expect, it } from 'vitest';
import { WorkspaceDraftService } from './draft';

it('keeps an unacknowledged operation uncertain after it disappears from the queue', () => {
	expect(new WorkspaceDraftService().uncertain([], null, 'operation')).toBe(true);
});
it('uses the exact acknowledged revision as the next observed base', () => {
	const note = noteBuilder();
	expect(
		new WorkspaceDraftService().observedVersion(
			{
				base: { etag: syncEtag(1n), value: { type: 'notes', value: note } },
				basedOn: 'operation',
				local: { type: 'notes', value: note }
			},
			{
				operationId: 'operation',
				resource: {
					kind: 'found',
					snapshot: { etag: syncEtag(2n), value: { type: 'notes', value: note } }
				}
			}
		)
	).toBe(syncEtag(2n));
});
it('reports uncertain persistence before displaying a clean draft', () => {
	expect(new WorkspaceDraftService().status(null, true, true, 0, [])).toBe('error');
});
