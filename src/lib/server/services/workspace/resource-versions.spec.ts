import { expect, it } from 'vitest';
import { syncEtag } from '$lib/models/sync';
import { InMemoryNoteContent } from '$lib/testing/notes/fakes/in-memory-content';
import { InMemoryWorkspaceNoteReads } from '$lib/testing/sync/fakes/in-memory-workspace-writes';
import { noteBuilder, testActor } from '$lib/testing/workspace/fixtures/domain-builders';
import { WorkspaceResourceVersions } from './resource-versions';

it('does not substitute another account’s body for an exact version', async () => {
	const content = new InMemoryNoteContent();
	const note = noteBuilder({ userId: testActor(2).userId, currentRevision: 4 });
	content.notes.push(note);
	const versions = new WorkspaceResourceVersions(new InMemoryWorkspaceNoteReads(content));
	await expect(
		versions.readVersion(testActor(1), { type: 'notes', id: [note.id] }, syncEtag(4n))
	).rejects.toThrow('The synchronization journal does not match its resource');
});
