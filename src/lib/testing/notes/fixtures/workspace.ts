import { NoteActionRunStore } from '$lib/stores/notes/note-action-runs.svelte';
import {
	InMemoryNoteActionRunTransport,
	InMemoryNoteActionRunStorage,
	InMemoryNoteActionReview
} from '$lib/testing/notes/fakes/in-memory-note-action-runs';
import { CatalogWidgetCandidateReader } from '$lib/adapters/widgets/candidate-reader';
import { TiptapDocumentCopy } from '$lib/client/notes/editor-document';
import { BrowserWorkspaceEditingEnvironment } from '$lib/client/workspace/editing-environment.svelte';
import type { NoteWorkspaceEditor } from '$lib/models/browser-workspace';
import { NoteWorkspace, type NoteWorkspaceDependencies } from '$lib/controllers/notes/workspace';
import { BrowserWorkspaceSynchronization } from '$lib/controllers/sync/browser-workspace';
import { MutationSubmission } from '$lib/controllers/sync/submission';
import { EditorSessions } from '$lib/controllers/workspace/editor-session';
import { workspaceDraftStates } from '$lib/factories/workspace/capabilities';
import { rebaseWorkspaceRecord } from '$lib/factories/workspace/rebase';
import type { NoteEditorPort } from '$lib/models/browser-workspace';
import type { Note } from '$lib/models/notes';
import { NoteDocumentPresentationService } from '$lib/services/notes/document-presentation';
import { NoteEditingService } from '$lib/services/notes/editing';
import { NoteSectionNumberingService } from '$lib/services/notes/section-numbering';
import { WriteAncestryService } from '$lib/services/sync/ancestry';
import { WorkspaceFieldReplayService } from '$lib/services/sync/rebase';
import { SyncSchedulingService } from '$lib/services/sync/scheduling';
import {
	CacheCommitService,
	OutboxDeliveryService,
	OutboxEditingService
} from '$lib/services/sync/state';
import { WidgetEditingService } from '$lib/services/widgets/edits';
import { WidgetPatchService } from '$lib/services/widgets/patches';
import { WorkspaceDraftService } from '$lib/services/workspace/draft';
import { NoteEditorOperationStore } from '$lib/stores/notes/editor-operations.svelte';
import { NoteWorkspaceStore } from '$lib/stores/notes/workspace.svelte';
import { ResourceCacheStore } from '$lib/stores/sync/cache';
import { SyncExecutionStore } from '$lib/stores/sync/execution';
import { MutationQueueStore } from '$lib/stores/sync/submission';
import { WorkspaceCapabilityStore } from '$lib/stores/workspace/capabilities';
import { EditorSessionStore } from '$lib/stores/workspace/editor-session.svelte';
import { WorkspaceProjectionStore } from '$lib/stores/workspace/projection.svelte';
import { WorkspaceResourceStore } from '$lib/stores/workspace/resources.svelte';
import { InMemorySyncScheduler } from '$lib/testing/sync/fakes/in-memory-scheduler';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { InMemoryWorkspaceBinding } from '../fakes/in-memory-workspace-binding';
import { InMemoryWorkspaceEditor } from '../fakes/in-memory-workspace-editor';
import { InMemoryWorkspaceFeedback } from '../fakes/in-memory-workspace-feedback';
import { InMemoryWorkspaceRevisions } from '../fakes/in-memory-workspace-revisions';

import { type WorkspaceCommand } from '$lib/models/workspace-mutations';
import type { WorkspaceRecord } from '$lib/models/workspace-records';
import { noteHasUnpublishedChanges } from '$lib/services/workspace/commands';

import { createResourceCache } from '$lib/factories/sync/cache';
import { assembleWorkspaceResources } from '$lib/factories/workspace/resources';
import { syncEtag } from '$lib/models/sync';
import { workspaceResourceKey } from '$lib/services/workspace/commands';
import { InMemoryNoteWrites } from '$lib/testing/sync/fakes/in-memory-note-writes';
import {
	InMemoryAccountWriterLock,
	InMemoryOutbox
} from '$lib/testing/sync/fakes/in-memory-outbox';
import { InMemorySyncCache } from '$lib/testing/sync/fakes/in-memory-sync';
import { noteBuilder } from '$lib/testing/workspace/fixtures/domain-builders';
export const noteWorkspaceFixture = async (
	overrides: Partial<Note> = {},
	options: {
		actionTransport?: InMemoryNoteActionRunTransport;
		actionStorage?: InMemoryNoteActionRunStorage;
	} = {}
) => {
	const actionTransport = options.actionTransport ?? new InMemoryNoteActionRunTransport();
	const actionStorage = options.actionStorage ?? new InMemoryNoteActionRunStorage();
	const actionState = new NoteActionRunStore();
	const actionReview = new InMemoryNoteActionReview();
	const actionEditor: {
		held: { runId: string; at: number }[];
		revisions: { previous: string; source: string }[];
		insertions: { at: number; source: string }[];
		revisionFailure: Error | null;
		insertionPoint: number | 'lost' | undefined;
		acceptsInsertion: boolean;
	} = {
		held: [],
		revisions: [],
		insertions: [],
		revisionFailure: null,
		insertionPoint: undefined,
		acceptsInsertion: true
	};

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

	const cacheState = new ResourceCacheStore<WorkspaceRecord>();
	const executionState = new SyncExecutionStore();
	const queueState = new MutationQueueStore<WorkspaceCommand, WorkspaceRecord>();
	const resourceState = new WorkspaceResourceStore();
	const projectionState = new WorkspaceProjectionStore(new Map());
	const account = {
		accountId: note.userId,
		repository: outbox,
		outbox,
		cacheStorage: repository,
		readTransport: transport,
		writeTransport: transport,
		writerLock: new InMemoryAccountWriterLock(),
		scheduler: new InMemorySyncScheduler(),
		resourceState,
		projectionState,
		cacheState,
		executionState,
		queueState,
		ancestry: new WriteAncestryService(),
		cacheMerge: new CacheCommitService(),
		editing: new OutboxEditingService(),
		delivery: new OutboxDeliveryService(),
		scheduling: new SyncSchedulingService(),
		fields: new WorkspaceFieldReplayService(),
		widgetPatches: new WidgetPatchService(),
		widgetEditing: new WidgetEditingService(),
		widgetReader: new CatalogWidgetCandidateReader()
	};
	const cache = createResourceCache(
		note.userId,
		{ repository: outbox.projectedCache, transport },
		cacheState
	);
	const background = new BrowserWorkspaceSynchronization(account);
	const writes = new MutationSubmission(
		note.userId,
		{ repository: outbox, transport, writerLock: account.writerLock },
		queueState,
		background,
		account.editing,
		account.delivery
	);
	const resources = assembleWorkspaceResources(
		note.userId,
		{ repository: outbox, cache, writes, execution: background },
		resourceState,
		projectionState
	);

	resources.setOnline(false);
	await cache.accept(key, snapshot);
	await resources.initialize();
	const store = resources.draft({ type: 'notes', id: [note.id] });
	store.capture();
	const state = new NoteWorkspaceStore();
	const sessionState = new EditorSessionStore();
	const session = new EditorSessions(() => store.active, sessionState);
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
	const binding = new InMemoryWorkspaceBinding(note.userId, executionState);
	const editorState = new NoteEditorOperationStore();
	editorState.initialize();
	const editorIdentity = { key: Symbol('note-editor') };
	const editors = new WorkspaceCapabilityStore<NoteWorkspaceEditor>();
	editors.set(editorIdentity, {
		port: capabilityDependencies<NoteEditorPort>({
			getDocument: () => editor.getDocument(),
			getPlainText: () => editor.getPlainText(),
			setDocument: (doc) => editor.replaceContent(doc),
			paste: (content) => editor.type(content.text),
			active: true,
			replaceMermaid: (previous, source) => {
				if (actionEditor.revisionFailure) throw actionEditor.revisionFailure;
				actionEditor.revisions.push({ previous, source });
				return true;
			},
			holdInsertionPoint: (runId, at) => {
				actionEditor.held.push({ runId, at });
			},
			consumeInsertionPoint: () => actionEditor.insertionPoint,
			insertMermaid: (at, source) => {
				if (!actionEditor.acceptsInsertion) return false;
				actionEditor.insertions.push({ at, source });
				editor.document = {
					type: 'doc',
					content: [
						...(editor.document.content ?? []),
						{ type: 'mermaid', content: [{ type: 'text', text: source }] }
					]
				};
				return true;
			}
		}),
		state: editorState,
		events: {
			shimmer: () => undefined
		}
	});
	const controller = new NoteWorkspace(
		capabilityDependencies<NoteWorkspaceDependencies>({
			state,
			actionState,
			actionTransport,
			actionStorage,
			actionReview,
			noteId: note.id,
			account,
			binding: {
				state: binding,
				environment: binding,
				generation: binding.generation,
				dispose: () => {
					binding.disposed = true;
				}
			},
			draftState: workspaceDraftStates.get(store),
			sessionState,
			environment: new BrowserWorkspaceEditingEnvironment(),
			draftRules: new WorkspaceDraftService(),
			noteEditing: new NoteEditingService(),
			sections: new NoteSectionNumberingService(),
			presentation: new NoteDocumentPresentationService(),
			documents: new TiptapDocumentCopy(),
			scheduler,
			editorIdentity: () => editorIdentity,
			editors,
			feedback,
			revisions,
			rules: { noteHasUnpublishedChanges },
			conflictChanged: () => undefined
		})
	);
	controller.open();
	return {
		actionState,
		actionTransport,
		actionStorage,
		actionReview,
		actionEditor,
		note,
		key,
		account,
		background,
		binding,
		editorState,
		editors,
		editorIdentity,
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
