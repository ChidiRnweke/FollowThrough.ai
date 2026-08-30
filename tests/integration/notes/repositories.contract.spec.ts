import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import type { Note, NoteId, NoteRevisionId } from '$lib/models/notes';
import * as schema from '$lib/server/db/schema/registry';
import { NoteRecords } from '$lib/server/repositories/notes/postgres/notes';
import { ProjectRecords } from '$lib/server/repositories/projects/postgres/projects';
import { actor, context, now, seedNote } from '../database-harness';
import corpusDocuments from '../../corpus/note-documents.json' with { type: 'json' };
import { parseProseMirrorDocument } from '$lib/models/notes';

/**
 * A real document, not `{ type: 'doc', content: [] }`.
 *
 * Every fixture in this file used to be an empty doc, which has no nodes — so a
 * suite that maps real rows through `toNote` against a real Postgres was
 * structurally incapable of entering the node union, and watched the strict
 * ProseMirror schema ship and break `/today` without a word. The richest
 * document in the corpus exercises headings, tables, lists and marks on the way
 * through the column and back.
 */
const richDocument = parseProseMirrorDocument(
	corpusDocuments.reduce((largest, candidate) =>
		JSON.stringify(candidate).length > JSON.stringify(largest).length ? candidate : largest
	)
);

describe('Postgres note repository invariants', () => {
	it('maps an inserted note back to the domain model', async () => {
		const owner = actor('11');
		const project = await new ProjectRecords(context.db).insert(owner, {
			name: 'Note repository'
		});
		const timestamp = now;
		const note: Note = {
			id: '40000000-0000-4000-8000-000000000011' as NoteId,
			userId: owner.userId,
			projectId: project.id,
			kind: 'note',
			position: 0,
			title: 'Repository note',
			document: richDocument,
			plainText: 'content',
			currentRevision: 1,
			publishedRevision: 0,
			isPinned: false,
			createdAt: timestamp,
			updatedAt: timestamp
		};
		const repository = new NoteRecords(context.db);
		await repository.insert(owner, note);
		expect(await repository.findById(owner, note.id)).toEqual(note);
	});
	it('does not reveal a note to another actor', async () => {
		const owner = actor('12');
		const project = await new ProjectRecords(context.db).insert(owner, {
			name: 'Private note repository'
		});
		const note: Note = {
			id: '40000000-0000-4000-8000-000000000012' as NoteId,
			userId: owner.userId,
			projectId: project.id,
			kind: 'note',
			position: 0,
			title: 'Private note',
			document: richDocument,
			plainText: '',
			currentRevision: 1,
			publishedRevision: 0,
			isPinned: false,
			createdAt: now,
			updatedAt: now
		};
		const repository = new NoteRecords(context.db);
		await repository.insert(owner, note);
		expect(await repository.findById(actor('13'), note.id)).toBeUndefined();
	});
	it('hides a note when its project is archived', async () => {
		const { owner, project, note } = await seedNote('43');
		await new ProjectRecords(context.db).archive(owner, project.id);
		expect(await new NoteRecords(context.db).findById(owner, note.id)).toBeUndefined();
	});
	it('prevents duplicate built-in skill keys for one actor', async () => {
		const owner = actor('76');
		const project = await new ProjectRecords(context.db).insert(owner, {
			name: 'General'
		});
		const repository = new NoteRecords(context.db);
		const builtIn = (suffix: string): Note => ({
			id: `40000000-0000-4000-8000-${suffix.padStart(12, '0')}` as NoteId,
			userId: owner.userId,
			projectId: project.id,
			kind: 'skill',
			position: Number(suffix),
			title: `Built-in ${suffix}`,
			builtInKey: 'followthrough',
			document: richDocument,
			plainText: '',
			currentRevision: 1,
			publishedRevision: 0,
			isPinned: false,
			createdAt: now,
			updatedAt: now
		});
		await repository.insert(owner, builtIn('76'));
		await expect(repository.insert(owner, builtIn('77'))).rejects.toBeDefined();
	});
	it('applies a note update when the expected revision is current', async () => {
		const { owner, note } = await seedNote('181');
		const repository = new NoteRecords(context.db);
		const updated = await repository.updateIfRevision(
			owner,
			{ ...note, title: 'Accepted', currentRevision: 2 },
			1
		);
		expect(updated?.title).toBe('Accepted');
	});
	it('rejects a note update when the expected revision is stale', async () => {
		const { owner, note } = await seedNote('182');
		const repository = new NoteRecords(context.db);
		const updated = await repository.updateIfRevision(
			owner,
			{ ...note, title: 'Stale', currentRevision: 2 },
			2
		);
		expect(updated).toBeUndefined();
	});
	it('lists a trashed note in the trash', async () => {
		const { owner, note } = await seedNote('184');
		const repository = new NoteRecords(context.db);
		await repository.update(owner, { ...note, archivedAt: now });
		expect((await repository.listTrashed(owner)).map((entry) => entry.id)).toContain(note.id);
	});
	it('keeps active notes out of the trash', async () => {
		const { owner, note } = await seedNote('185');
		expect(
			(await new NoteRecords(context.db).listTrashed(owner)).map((entry) => entry.id)
		).not.toContain(note.id);
	});
	// The project itself is what was discarded; restoring one note into it would
	// strand the note somewhere the reader cannot navigate to.
	it('hides a trashed note whose project was archived', async () => {
		const { owner, project, note } = await seedNote('186');
		const repository = new NoteRecords(context.db);
		await repository.update(owner, { ...note, archivedAt: now });
		await new ProjectRecords(context.db).archive(owner, project.id);
		expect(await repository.listTrashed(owner)).toEqual([]);
	});
	it('does not reveal another actor’s trash', async () => {
		const { owner, note } = await seedNote('187');
		await new NoteRecords(context.db).update(owner, { ...note, archivedAt: now });
		expect(await new NoteRecords(context.db).listTrashed(actor('188'))).toEqual([]);
	});
	it('prunes a note’s history down to the newest snapshots', async () => {
		const { owner, note } = await seedNote('189');
		const repository = new NoteRecords(context.db);
		for (let revision = 1; revision <= 5; revision += 1)
			await repository.insertRevision(owner, {
				id: `50000000-0000-4000-8000-${String(revision).padStart(12, '0')}` as NoteRevisionId,
				noteId: note.id,
				revision,
				title: `Snapshot ${revision}`,
				document: richDocument,
				plainText: '',
				createdAt: now
			});
		await repository.pruneRevisions(owner, note.id, 2);
		expect((await repository.listRevisions(owner, note.id)).map((entry) => entry.revision)).toEqual(
			[4, 5]
		);
	});
	it('removes a hard-deleted note from the trash', async () => {
		const { owner, note } = await seedNote('190');
		const repository = new NoteRecords(context.db);
		await repository.update(owner, { ...note, archivedAt: now });
		await repository.delete(owner, note.id);
		expect(await repository.findById(owner, note.id)).toBeUndefined();
	});
	it('does not let one actor hard-delete another actor’s note', async () => {
		const { owner, note } = await seedNote('191');
		const repository = new NoteRecords(context.db);
		await repository.delete(actor('192'), note.id);
		expect(await repository.findById(owner, note.id)).toEqual(note);
	});
	it('takes the note’s revisions with it', async () => {
		const { owner, note } = await seedNote('193');
		const repository = new NoteRecords(context.db);
		await repository.insertRevision(owner, {
			id: '50000000-0000-4000-8000-000000000193' as NoteRevisionId,
			noteId: note.id,
			revision: 1,
			title: 'Snapshot',
			document: richDocument,
			plainText: '',
			createdAt: now
		});
		await repository.delete(owner, note.id);
		expect(await repository.listRevisions(owner, note.id)).toEqual([]);
	});
	// `note_revision_attachments.attachment_version_id` is `restrict`, so a note whose
	// history snapshots an attachment is the case where a naive cascade would fail.
	it('deletes a note whose history snapshots an attachment', async () => {
		const { owner, project, note } = await seedNote('194');
		const [attachment] = await context.db
			.insert(schema.attachments)
			.values({ userId: owner.userId, projectId: project.id, noteId: note.id, path: 'shot.png' })
			.returning();
		const [version] = await context.db
			.insert(schema.attachmentVersions)
			.values({
				attachmentId: attachment!.id,
				objectKey: 'attachments/194.png',
				mediaType: 'image/png',
				byteSize: 10,
				checksumSha256: 'checksum-194'
			})
			.returning();
		await context.db
			.update(schema.attachments)
			.set({ currentVersionId: version!.id })
			.where(eq(schema.attachments.id, attachment!.id));
		const repository = new NoteRecords(context.db);
		await repository.insertRevision(owner, {
			id: '50000000-0000-4000-8000-000000000194' as NoteRevisionId,
			noteId: note.id,
			revision: 1,
			title: 'Snapshot',
			document: richDocument,
			plainText: '',
			createdAt: now
		});
		await repository.delete(owner, note.id);
		expect(await repository.findById(owner, note.id)).toBeUndefined();
	});
	it('allows exactly one concurrent note update from the same revision', async () => {
		const { owner, note } = await seedNote('183');
		const repository = new NoteRecords(context.db);
		const results = await Promise.all([
			repository.updateIfRevision(owner, { ...note, title: 'Browser A', currentRevision: 2 }, 1),
			repository.updateIfRevision(owner, { ...note, title: 'Browser B', currentRevision: 2 }, 1)
		]);
		expect(results.filter(Boolean)).toHaveLength(1);
	});
	it('projects the searchable columns without the document body', async () => {
		const { owner, note } = await seedNote('195');
		const hits = await new NoteRecords(context.db).listSearchable(owner);
		expect(hits.find((entry) => entry.id === note.id)).toEqual({
			id: note.id,
			projectId: note.projectId,
			title: note.title,
			plainText: note.plainText
		});
	});
	it('keeps trashed notes out of the searchable projection', async () => {
		const { owner, note } = await seedNote('196');
		const repository = new NoteRecords(context.db);
		await repository.update(owner, { ...note, archivedAt: now });
		expect((await repository.listSearchable(owner)).map((entry) => entry.id)).not.toContain(
			note.id
		);
	});
	it('scopes the searchable projection to one project', async () => {
		const { owner } = await seedNote('197');
		const other = await seedNote('198', owner);
		const hits = await new NoteRecords(context.db).listSearchable(owner, other.project.id);
		expect(hits.map((entry) => entry.id)).toEqual([other.note.id]);
	});
	it('hides a searchable note when its project is archived', async () => {
		const { owner, project } = await seedNote('199');
		await new ProjectRecords(context.db).archive(owner, project.id);
		expect(await new NoteRecords(context.db).listSearchable(owner)).toEqual([]);
	});
});
