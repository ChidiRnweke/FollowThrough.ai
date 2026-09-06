import { describe, expect, it } from 'vitest';
import { syncEtag, type ResourceState } from '$lib/models/sync';
import { appendWrite, localResource, visibleResources, type WriteDraft } from './index';

const draft: WriteDraft<string, string> = {
	operationId: 'a0000000-0000-4000-8000-000000000001',
	key: 'note:1',
	command: 'edit',
	base: null,
	basedOn: null,
	local: 'Offline note',
	coalesce: null,
	references: []
};
const records = new Map<string, ResourceState<string>>([
	[
		'note:1',
		{
			kind: 'present',
			cache: {
				kind: 'updating',
				previous: { etag: syncEtag(1n), value: 'Saved' },
				target: syncEtag(2n),
				transfer: { kind: 'fetching' }
			}
		}
	]
]);

describe('local resource visibility', () => {
	it('keeps a retained body available to list projections during refresh', () => {
		expect([...visibleResources(records, [])]).toEqual([['note:1', 'Saved']]);
	});
	it('shows a newly created object without requiring a server representation', () => {
		expect([...visibleResources(new Map(), appendWrite([], draft, 1))]).toEqual([
			['note:1', 'Offline note']
		]);
	});
	it('hides a locally deleted object while preserving its server base', () => {
		expect([...visibleResources(records, appendWrite([], { ...draft, local: null }, 1))]).toEqual(
			[]
		);
	});
	it('lets the latest local edit remain usable while its base refreshes', () => {
		expect(localResource(appendWrite([], draft, 1), 'note:1')).toEqual({
			kind: 'ready',
			value: 'Offline note'
		});
	});
	it('leaves ordinary foreground reads to the shared cache when there is no local edit', () => {
		expect(localResource([], 'note:1')).toBeNull();
	});
});
