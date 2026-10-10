import type { Note } from '$lib/models/notes';
import type { WorkspaceSession } from '$lib/controllers/workspace/session';
import { NoteWorkspace, type NoteWorkspaceDependencies } from '$lib/controllers/notes/workspace';
import { NoteWorkspaceStore } from '$lib/stores/notes/workspace.svelte';
import { createEditorSession } from '$lib/factories/workspace/editor-session';
import { NoteDraftEditing } from '$lib/controllers/notes/draft-editing';
import { NoteSectionNumberingService } from '$lib/services/notes/section-numbering';
import { InMemoryWorkspaceEditor } from '../fakes/in-memory-workspace-editor';
import { InMemoryWorkspaceFeedback } from '../fakes/in-memory-workspace-feedback';
import { InMemoryWorkspaceRevisions } from '../fakes/in-memory-workspace-revisions';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { rebaseWorkspaceRecord } from '$lib/controllers/workspace/rebase';
import { InMemorySyncScheduler } from '$lib/testing/sync/fakes/in-memory-scheduler';

import type { WorkspaceRecord } from '$lib/models/workspace-records';
import { noteHasUnpublishedChanges } from '$lib/services/workspace/commands';
import { type WorkspaceCommand } from '$lib/models/workspace-mutations';

import { workspaceResourceKey } from '$lib/services/workspace/commands';
import { syncEtag } from '$lib/models/sync';
import { noteBuilder } from '$lib/testing/workspace/fixtures/domain-builders';
import { InMemorySyncCache } from '$lib/testing/sync/fakes/in-memory-sync';
import {
	InMemoryOutbox,
	InMemoryAccountWriterLock
} from '$lib/testing/sync/fakes/in-memory-outbox';
import { InMemoryNoteWrites } from '$lib/testing/sync/fakes/in-memory-note-writes';
import { createResourceCache } from '$lib/factories/sync/cache';
import { createMutationQueue } from '$lib/factories/sync/submission';
import { assembleWorkspaceResources } from '$lib/factories/workspace/resources';
export const noteWorkspaceFixture = async (overrides: Partial<Note> = {}) => {
	const note = noteBuilder({
		title: 'Original',
		plainText: 'Original',
		document: {
			type: 'doc',
			content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Original' }] }]
		},
		...overrides
	});
	const key = workspaceResourceKey({ type: 'notes', id: [note.id] });
	const repository = new InMemorySyncCache<WorkspaceRecord>();
	const outbox = new InMemoryOutbox<WorkspaceCommand, WorkspaceRecord>(
		rebaseWorkspaceRecord,
		repository
	);
	const transport = new InMemoryNoteWrites();
	const snapshot = { etag: syncEtag(1n), value: { type: 'notes' as const, value: note } };
	transport.records.set(key, snapshot);
	const cache = createResourceCache(note.userId, { repository: outbox.projectedCache, transport });
	const { writes, execution } = createMutationQueue(note.userId, {
		repository: outbox,
		transport,
		scheduler: new InMemorySyncScheduler(),
		writerLock: new InMemoryAccountWriterLock(),
		pull: () => cache.refresh()
	});
	const resources = assembleWorkspaceResources(note.userId, {
		repository: outbox,
		cache,
		writes,
		execution
	});
	resources.setOnline(false);
	await cache.accept(key, snapshot);
	await resources.initialize();
	const store = resources.draft({ type: 'notes', id: [note.id] });
	store.capture();
	const state = new NoteWorkspaceStore();
	const session = createEditorSession(() => store.active);
	const scheduler = new InMemorySyncScheduler();
	const editor = new InMemoryWorkspaceEditor(note);
	const feedback = new InMemoryWorkspaceFeedback();
	let version = 10n;
	const acceptRemote = async (value: Note) => {
		const snapshot = { etag: syncEtag(version++), value: { type: 'notes' as const, value } };
		transport.records.set(key, snapshot);
		await cache.accept(key, snapshot);
	};
	const revisions = new InMemoryWorkspaceRevisions(async (revision) => {
		await acceptRemote({
			...note,
			title: revision.title,
			document: revision.document,
			plainText: revision.plainText,
			currentRevision: note.currentRevision + 1
		});
	}, note.publishedRevision);
	const controller = new NoteWorkspace(
		capabilityDependencies<NoteWorkspaceDependencies>({
			state,
			draft: store,
			session,
			scheduler,
			editor: () => editor,
			feedback,
			revisions,
			editing: new NoteDraftEditing(note.id, store, new NoteSectionNumberingService()),
			rules: { noteHasUnpublishedChanges },
			workspace: {
				current: capabilityDependencies<WorkspaceSession>({ resources }),
				synchronize: async () => {
					await resources.synchronize();
					return { kind: 'complete' };
				}
			},
			conflictChanged: () => undefined
		})
	);
	controller.open();
	return {
		note,
		key,
		cache,
		repository,
		outbox,
		transport,
		resources,
		draft: store,
		controller,
		session,
		scheduler,
		editor,
		feedback,
		revisions,
		acceptRemote,
		edit(text: string) {
			editor.type(text);
			controller.changed();
		},
		close() {
			controller.close();
			resources.stop();
		}
	};
};
