import { afterEach, expect, it } from 'vitest';
import { createGlobalSearch } from '$lib/factories/search/global-search';
import type { NoteId } from '$lib/models/notes';
import { syncCursorSchema, syncEtag } from '$lib/models/sync';
import type { WorkspaceRecord } from '$lib/models/workspace-records';
import { WorkspaceCommandRulesService } from '$lib/services/workspace/commands';
import type { WorkspaceController } from '$lib/controllers/workspace/workspace';
import { InMemorySyncScheduler } from '$lib/testing/sync/fakes/in-memory-scheduler';
import {
	noteBuilder,
	projectBuilder,
	testNoteId
} from '$lib/testing/workspace/fixtures/domain-builders';
import { workspaceFixture } from '$lib/testing/workspace/fixtures/workspace';

const { workspaceRecordIdentity, workspaceResourceKey } = new WorkspaceCommandRulesService();
const started: WorkspaceController[] = [];
afterEach(() => {
	for (const workspace of started.splice(0)) workspace.stop();
});

/** Three notes saying "ship release" in one project, on an offline device. */
const setup = async () => {
	const project = projectBuilder();
	const fixture = workspaceFixture({ accountId: project.userId });
	started.push(fixture.workspace);
	const records: WorkspaceRecord[] = [
		{ type: 'projects', value: project },
		...[1, 2, 3].map((id) => ({
			type: 'notes' as const,
			value: noteBuilder({
				id: testNoteId(id),
				projectId: project.id,
				title: `Note ${id}`,
				plainText: 'ship release',
				document: {
					type: 'doc',
					content: [{ type: 'paragraph', content: [{ type: 'text', text: 'ship release' }] }]
				}
			})
		}))
	];
	fixture.replica.seed(
		project.userId,
		records.map((value) => ({
			key: workspaceResourceKey(workspaceRecordIdentity(value)),
			entry: { kind: 'present' as const, snapshot: { etag: syncEtag(1n), value } }
		})),
		{ cursor: syncCursorSchema.parse('1'), inventoryComplete: true }
	);
	await fixture.start(false);
	const search = createGlobalSearch(new InMemorySyncScheduler());
	search.edit({ query: 'ship' });
	search.setReplacement('deploy');
	await search.search();
	/** What the search panel does: plan, store the plan on this device, report it. */
	const replace = async (noteId?: NoteId) => {
		const plan = search.plan(fixture.views.notes, noteId);
		const outcome = await fixture.workspace.editAll(
			plan.map(({ noteId, command }) => ({ identity: { type: 'notes', id: [noteId] }, command }))
		);
		return search.replaced(plan, outcome);
	};
	const queued = () =>
		fixture.replica.entries(project.userId).map((entry) => {
			const command = entry.intent.command;
			return command.kind === 'saveNote' ? command.plainText : command.kind;
		});
	return { ...fixture, search, replace, queued, project };
};

it('saves every matching note on this device', async () => {
	const { replace, views, search } = await setup();
	await replace();
	expect({
		texts: views.notes.map((note) => note.plainText),
		report: search.lastReplace
	}).toEqual({
		texts: ['deploy release', 'deploy release', 'deploy release'],
		report: { replacedNotes: 3, replacedMatches: 3 }
	});
});

it('replaces one note’s matches only', async () => {
	const { replace, queued } = await setup();
	await replace(testNoteId(2));
	expect(queued()).toEqual(['deploy release']);
});

it('reports the confirmed saves when a later write to this device fails', async () => {
	const { replace, replica, search, queued } = await setup();
	replica.transactionFailures.set(
		workspaceResourceKey({ type: 'notes', id: [testNoteId(2)] }),
		'Device storage is full'
	);
	await replace();
	expect({ error: search.searchError, queued: queued() }).toEqual({
		error:
			'Saved replacements on this device in 1 note (Note 1). Save not confirmed for "Note 2": Device storage is full. 1 remaining note was not attempted. Review the saved changes before searching again.',
		queued: ['deploy release']
	});
});

it('stops writing when the account stops during a replacement', async () => {
	const { replace, replica, workspace, queued } = await setup();
	const gate = replica.pauseTransaction();
	const replacing = replace();
	await gate.started;
	workspace.stop();
	gate.release();
	const result = await replacing;
	expect({ failed: result?.kind, queued: queued() }).toEqual({
		failed: 'failure',
		queued: ['deploy release']
	});
});

it('reports an invalid pattern instead of searching', async () => {
	const { search, views } = await setup();
	search.edit({ query: '[', regex: true });
	await search.search();
	expect({ error: search.searchError, hits: search.hits(views.notes) }).toEqual({
		error: 'The search pattern is not a valid regular expression',
		hits: []
	});
});
