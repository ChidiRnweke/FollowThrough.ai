import { afterEach, describe, expect, it } from 'vitest';
import { syncEtag } from '$lib/models/sync';
import type { WorkspaceController } from './workspace';
import {
	noteBuilder,
	projectBuilder,
	testNoteId,
	testNow
} from '$lib/testing/workspace/fixtures/domain-builders';
import { offlineWorkspace } from '$lib/testing/workspace/fixtures/workspace';

const started: WorkspaceController[] = [];
afterEach(() => {
	for (const workspace of started.splice(0)) workspace.stop();
});
const setup = async () => {
	const project = projectBuilder();
	const fixture = await offlineWorkspace(project.userId);
	started.push(fixture.workspace);
	await fixture.store({ type: 'projects', value: project });
	return { ...fixture, project };
};

describe('a change made directly on the server', () => {
	it('refreshes this device before the caller continues', async () => {
		const { workspace, transport, project, views, environment, resources } = await setup();
		environment.online = true;
		resources.setOnline(true);
		const renamed = { ...project, name: 'Renamed on the server' };
		const change = workspace.serverChange(
			Promise.resolve().then(() => {
				transport.reads.records.set(JSON.stringify(['projects', project.id]), {
					etag: syncEtag(2n),
					value: { type: 'projects', value: renamed }
				});
				return 'moved';
			})
		);
		const outcome = await change;
		expect({ outcome, shown: views.get('projects', project.id)?.name }).toEqual({
			outcome: { kind: 'saved', value: 'moved' },
			shown: 'Renamed on the server'
		});
	});
	it('reports the server’s refusal as a value', async () => {
		const { workspace } = await setup();
		expect(await workspace.serverChange(Promise.reject(new Error('The name is taken')))).toEqual({
			kind: 'failure',
			message: 'The name is taken'
		});
	});
	it('drops an answer that arrives after another account signed in', async () => {
		const { workspace, environment } = await setup();
		const answer = Promise.withResolvers<string>();
		const change = workspace.serverChange(answer.promise);
		environment.accountId = 'a0000000-0000-4000-8000-000000000009';
		answer.resolve('moved');
		expect(await change).toEqual({
			kind: 'failure',
			message: 'The workspace account changed during the action.'
		});
	});
});

describe('one complete local edit', () => {
	it('stores the edit on this device and returns the edited resource', async () => {
		const { workspace, project, resources } = await setup();
		const edited = await workspace.edit(
			{ type: 'projects', id: [project.id] },
			{ kind: 'renameProject', projectId: project.id, name: 'Offline name' }
		);
		expect({ edited, queued: resources.pending.length }).toEqual({
			edited: { kind: 'saved', value: expect.objectContaining({ name: 'Offline name' }) },
			queued: 1
		});
	});
	it('refuses an edit of a resource this device does not have', async () => {
		const { workspace } = await setup();
		const edited = await workspace.edit(
			{ type: 'notes', id: [testNoteId(9)] },
			{ kind: 'archiveNote', noteId: testNoteId(9) }
		);
		expect(edited.kind).toBe('failure');
	});
	it('restores a note into a folder this device holds', async () => {
		const { workspace, store, project } = await setup();
		const folder = noteBuilder({ id: testNoteId(1), projectId: project.id, kind: 'folder' });
		const note = noteBuilder({
			id: testNoteId(2),
			projectId: project.id,
			parentId: folder.id,
			archivedAt: testNow
		});
		await store({ type: 'notes', value: folder });
		await store({ type: 'notes', value: note });
		const restored = await workspace.edit(
			{ type: 'notes', id: [note.id] },
			{ kind: 'restoreNote', noteId: note.id }
		);
		expect(restored.kind === 'saved' && restored.value.archivedAt).toBeUndefined();
	});
});

it('creates a note in a project and shows it at once', async () => {
	const { workspace, project, views } = await setup();
	const created = await workspace.create({
		kind: 'createNote',
		id: testNoteId(3),
		projectId: project.id,
		title: 'Captured'
	});
	expect({ created: created.kind, shown: views.get('notes', testNoteId(3))?.title }).toEqual({
		created: 'saved',
		shown: 'Captured'
	});
});

describe('a per-account setting', () => {
	it('opens with its defaults and stores nothing until it is changed', async () => {
		const { workspace, project, resources } = await setup();
		const opened = await workspace.openOrCreate(
			{ type: 'export_settings', id: [project.userId, project.id] },
			{
				type: 'export_settings',
				value: {
					userId: project.userId,
					projectId: project.id,
					settings: { includeTitle: false },
					createdAt: testNow,
					updatedAt: testNow
				}
			}
		);
		expect({
			opened: opened.kind === 'ready' && opened.value.settings,
			queued: resources.pending.length
		}).toEqual({ opened: { includeTitle: false }, queued: 0 });
	});
});

describe('reading a resource', () => {
	it('names a deleted note as deleted', async () => {
		const { workspace, replica, project } = await setup();
		replica.seed(project.userId, [
			{
				key: JSON.stringify(['notes', testNoteId(5)]),
				entry: { kind: 'deleted', etag: syncEtag(2n) }
			}
		]);
		await replica.read(project.userId);
		expect(await workspace.read({ type: 'notes', id: [testNoteId(5)] }, 'note')).toEqual({
			kind: 'failure',
			message: 'This note was deleted.'
		});
	});
	it('reads a setting the account never saved as absent', async () => {
		const { workspace, project } = await setup();
		expect(
			await workspace.find(
				{ type: 'export_settings', id: [project.userId, project.id] },
				'export setting'
			)
		).toEqual({ kind: 'absent' });
	});
});
