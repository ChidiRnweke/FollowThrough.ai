import { expect, it } from 'vitest';
import type { SyncEtag, SyncObjectRead } from '$lib/models/sync';
import type { WorkspaceRecord } from '$lib/models/workspace-records';
import type { WorkspaceResourceIdentity } from '$lib/models/workspace-sync';
import type { SyncObjectRepository } from '$lib/server/repositories/workspace/sync-objects';
import { testActor, testNoteId } from '$lib/testing/workspace/fixtures/domain-builders';
import { SyncObjectService } from './sync-objects';

it('answers the repository read for the acting user, resource and ETag', async () => {
	const reads: Parameters<SyncObjectRepository['read']>[] = [];
	const etag = 'etag-1' as SyncEtag;
	const unchanged: SyncObjectRead<WorkspaceRecord> = { kind: 'unchanged', etag };
	const service = new SyncObjectService({
		read: async (...args) => {
			reads.push(args);
			return unchanged;
		}
	});
	const identity: WorkspaceResourceIdentity = { type: 'notes', id: [testNoteId()] };
	const result = await service.read(identity, etag);
	expect({ result, reads }).toEqual({
		result: unchanged,
		reads: [[testActor(), identity, etag]]
	});
});
