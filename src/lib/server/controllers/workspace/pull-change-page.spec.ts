import { expect, it } from 'vitest';
import { syncCursorSchema } from '$lib/models/sync';
import { Workspace, type WorkspaceDependencies } from './controller';
import { WorkspaceJournal } from '$lib/server/services/workspace/journal';
import { WorkspaceResourceVersions } from '$lib/server/services/workspace/resource-versions';
import { WorkspaceCommandRulesService } from '$lib/services/workspace/commands';
import { TodayPresentationService } from '$lib/services/workspace/today';
import { InMemoryWorkspaceJournal } from '$lib/testing/sync/fakes/in-memory-workspace-journal';
import { InMemoryWorkspaceNoteReads } from '$lib/testing/sync/fakes/in-memory-workspace-writes';
import { InMemoryNoteContent } from '$lib/testing/notes/fakes/in-memory-content';
import { InMemoryTransactionRunner } from '$lib/testing/workspace/fakes/in-memory-transaction';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import {
	noteBuilder,
	testActor,
	testNoteId
} from '$lib/testing/workspace/fixtures/domain-builders';

const setup = () => {
	const actor = testActor();
	const content = new InMemoryNoteContent();
	const journal = new InMemoryWorkspaceJournal();
	journal.createAccount(actor, 9007199254740992n);
	const workspace = new Workspace(
		new TodayPresentationService(),
		capabilityDependencies<WorkspaceDependencies>({
			transactionRunner: new InMemoryTransactionRunner([content]),
			syncChanges: new WorkspaceJournal(journal),
			resourceVersions: new WorkspaceResourceVersions(new InMemoryWorkspaceNoteReads(content)),
			resourceKeys: new WorkspaceCommandRulesService()
		})
	);
	return { actor, content, journal, workspace, since: syncCursorSchema.parse('9007199254740992') };
};

it('assembles ordered exact bodies and composite tombstones without rounding the checkpoint', async () => {
	const { actor, content, journal, workspace, since } = setup();
	const note = noteBuilder({ userId: actor.userId, currentRevision: 4 });
	content.notes.push(note);
	journal.publish(actor, {
		kind: 'upsert',
		identity: { type: 'notes', id: [note.id] },
		version: 4n
	});
	journal.publish(actor, {
		kind: 'delete',
		identity: { type: 'tool_preferences', id: [actor.userId, 'read_note'] },
		version: 9007199254740993n
	});
	expect(await workspace.pullChangePage(actor, since)).toEqual({
		cursor: '9007199254740994',
		hasMore: false,
		records: [
			{
				key: `["notes","${note.id}"]`,
				resource: {
					kind: 'found',
					snapshot: { etag: 'sync-v1-4', value: { type: 'notes', value: note } }
				}
			},
			{
				key: `["tool_preferences","${actor.userId}","read_note"]`,
				resource: { kind: 'deleted', etag: 'sync-v1-9007199254740993' }
			}
		]
	});
});

it('rejects the whole page when a selected body has a different version', async () => {
	const { actor, content, journal, workspace, since } = setup();
	const note = noteBuilder({ userId: actor.userId, currentRevision: 5 });
	content.notes.push(note);
	journal.publish(actor, {
		kind: 'upsert',
		identity: { type: 'notes', id: [note.id] },
		version: 4n
	});
	await expect(workspace.pullChangePage(actor, since)).rejects.toThrow(
		'The synchronization journal does not match its resource'
	);
});

it('rejects the whole page when a selected body is unavailable', async () => {
	const { actor, journal, workspace, since } = setup();
	journal.publish(actor, {
		kind: 'upsert',
		identity: { type: 'notes', id: [testNoteId()] },
		version: 4n
	});
	await expect(workspace.pullChangePage(actor, since)).rejects.toThrow(
		'The synchronization journal does not match its resource'
	);
});

it('returns an empty terminal page at the account head', async () => {
	const { actor, workspace, since } = setup();
	expect(await workspace.pullChangePage(actor, since)).toEqual({
		cursor: since,
		hasMore: false,
		records: []
	});
});

it('keeps every resource across the page checkpoint and terminal head', async () => {
	const { actor, journal, workspace, since } = setup();
	for (let i = 0; i < 129; i++)
		journal.publish(actor, {
			kind: 'delete',
			identity: { type: 'notes', id: [testNoteId(i)] },
			version: 2n
		});
	const first = await workspace.pullChangePage(actor, since);
	const last = await workspace.pullChangePage(actor, first.cursor);
	expect({ first, last }).toEqual({
		first: {
			cursor: '9007199254741120',
			hasMore: true,
			records: Array.from({ length: 128 }, (_, i) => ({
				key: `["notes","${testNoteId(i)}"]`,
				resource: { kind: 'deleted', etag: 'sync-v1-2' }
			}))
		},
		last: {
			cursor: '9007199254741121',
			hasMore: false,
			records: [
				{ key: `["notes","${testNoteId(128)}"]`, resource: { kind: 'deleted', etag: 'sync-v1-2' } }
			]
		}
	});
});
