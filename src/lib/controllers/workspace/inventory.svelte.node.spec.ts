import { afterEach, expect, it } from 'vitest';
import type { WorkspaceRecord } from '$lib/models/workspace-records';
import { syncCursorSchema, syncEtag } from '$lib/models/sync';
import { type WorkspaceResourceIdentity } from '$lib/models/workspace-sync';
import { WorkspaceCommandRulesService } from '$lib/services/workspace/commands';
import type { WorkspaceController } from './workspace';
import {
	noteBuilder,
	testActor,
	testNoteId,
	testNow
} from '$lib/testing/workspace/fixtures/domain-builders';
import { workspaceFixture } from '$lib/testing/workspace/fixtures/workspace';

const { workspaceResourceKey } = new WorkspaceCommandRulesService();
const started: WorkspaceController[] = [];
afterEach(() => {
	for (const workspace of started.splice(0)) workspace.stop();
});

// SYNC-READINESS and SYNC-CONTINUITY: a partial inventory cannot discard an observed parent or draft.
it('retains the observed note when offline restoration needs unavailable parent facts', async () => {
	const accountId = testActor().userId;
	const note = noteBuilder({ parentId: testNoteId(2), archivedAt: testNow });
	const record: WorkspaceRecord = { type: 'notes', value: note };
	const identity = { type: 'notes', id: [note.id] } satisfies WorkspaceResourceIdentity;
	const fixture = workspaceFixture({ accountId });
	started.push(fixture.workspace);
	fixture.replica.seed(
		accountId,
		[
			{
				key: workspaceResourceKey(identity),
				entry: { kind: 'present', snapshot: { etag: syncEtag(1n), value: record } }
			}
		],
		{ cursor: syncCursorSchema.parse('1'), inventoryComplete: false }
	);
	const resources = await fixture.start(false);
	const draft = resources.draft(identity);
	await draft.read();
	const result = await draft.stage({ kind: 'restoreNote', noteId: note.id });
	expect({ result, retained: draft.value, pending: resources.pending.length }).toEqual({
		result: {
			kind: 'failure',
			message: 'Required workspace data is not available on this device. Reconnect and retry.'
		},
		retained: note,
		pending: 0
	});
});
