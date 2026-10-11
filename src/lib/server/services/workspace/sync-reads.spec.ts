import { expect, it } from 'vitest';
import { syncCursorSchema, syncEtag } from '$lib/models/sync';
import { InMemoryNoteContent } from '$lib/testing/notes/fakes/in-memory-content';
import { InMemoryWorkspaceJournal } from '$lib/testing/sync/fakes/in-memory-workspace-journal';
import { InMemoryWorkspaceNoteReads } from '$lib/testing/sync/fakes/in-memory-workspace-writes';
import { noteBuilder, testActor } from '$lib/testing/workspace/fixtures/domain-builders';
import { WorkspaceSyncReads } from './sync-reads';

const reads = (journal: InMemoryWorkspaceJournal, content = new InMemoryNoteContent(testActor())) =>
	new WorkspaceSyncReads(journal, new InMemoryWorkspaceNoteReads(testActor(), content));

it('rejects a cursor just beyond the account head without rounding', async () => {
	const journal = new InMemoryWorkspaceJournal(testActor());
	journal.createAccount(9007199254740992n);
	await expect(
		reads(journal).selectPage(syncCursorSchema.parse('9007199254740993'))
	).rejects.toThrow('The client cursor is ahead of this account');
});

it('does not turn a missing account head into an empty successful page', async () => {
	await expect(
		reads(new InMemoryWorkspaceJournal(testActor())).selectPage(syncCursorSchema.parse('1'))
	).rejects.toThrow('The account has no synchronization head');
});

it('does not substitute another account’s body for an exact version', async () => {
	const content = new InMemoryNoteContent(testActor());
	const note = noteBuilder({ userId: testActor(2).userId, currentRevision: 4 });
	content.notes.push(note);
	await expect(
		reads(new InMemoryWorkspaceJournal(testActor()), content).readVersion(
			{ type: 'notes', id: [note.id] },
			syncEtag(4n)
		)
	).rejects.toThrow('The synchronization journal does not match its resource');
});
