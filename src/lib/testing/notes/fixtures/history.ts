import type { NoteHistoryReader, WorkspaceBindingState } from '$lib/models/browser-workspace';
import type { NoteRevision, NoteRevisionId, NoteRevisionSummary } from '$lib/models/notes';
import { NotePresentationService } from '$lib/services/notes/presentation';
import { NoteHistoryStore } from '$lib/stores/notes/history.svelte';
import { testNoteId, testNow } from '$lib/testing/workspace/fixtures/domain-builders';
import { NoteHistory, type NoteHistoryController } from '$lib/controllers/notes/history';
export const createHistory = (
	noteId: ReturnType<typeof testNoteId>,
	list: NoteHistoryReader['list'],
	read: NoteHistoryReader['read'],
	session: Pick<WorkspaceBindingState, 'accountId' | 'generation'> = {
		accountId: 'note-history-test',
		generation: 0
	}
): NoteHistoryController =>
	new NoteHistory(
		noteId,
		new NoteHistoryStore(),
		session,
		{ list, read },
		new NotePresentationService()
	);
export const revision = (value: number): NoteRevision => ({
	id: `70000000-0000-4000-8000-${String(value).padStart(12, '0')}` as NoteRevisionId,
	noteId: testNoteId(),
	revision: value,
	title: `Version ${value}`,
	document: { type: 'doc', content: [] },
	plainText: '',
	createdAt: testNow
});
export const summary = (value: number, isPublished = false): NoteRevisionSummary => ({
	id: revision(value).id,
	revision: value,
	title: `Version ${value}`,
	createdAt: testNow,
	isPublished
});
