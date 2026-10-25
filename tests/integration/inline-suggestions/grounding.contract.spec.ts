import { expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import type { Note, NoteId } from '$lib/models/notes';
import * as schema from '$lib/server/db/schema/registry';
import { NoteRecords } from '$lib/server/repositories/notes/postgres/notes';
import { InlineGroundingRecords } from '$lib/server/repositories/inline-suggestions/postgres/grounding';
import { context, seedNote } from '../database-harness';

const snapshot = (knowledgeMarker: string, memoryMarker: string) => ({
	projectPassages: [
		{ sourceTitle: 'Runbook', sourceType: 'note' as const, content: 'Ana owns the cutover.' }
	],
	userMemory: ['Writes in British English.'],
	knowledgeMarker,
	memoryMarker
});

const section = (noteId: NoteId) => ({ noteId, sectionKey: 'Plan\u001fCutover' });

it('keeps one grounding per section and replaces it on the next put', async () => {
	const { owner, project, note } = await seedNote('51001');
	const records = new InlineGroundingRecords(owner, context.db);
	const before = await records.find(section(note.id), project.id);
	await records.put(section(note.id), snapshot('k1', 'm1'));
	await records.put(section(note.id), snapshot('k2', 'm2'));
	const after = await records.find(section(note.id), project.id);
	expect({ before: before.stored, after: after.stored }).toEqual({
		before: undefined,
		after: snapshot('k2', 'm2')
	});
});

it('moves the knowledge fingerprint for another note in the project, not for the note being written', async () => {
	const { owner, project, note } = await seedNote('51002');
	const records = new InlineGroundingRecords(owner, context.db);
	const sibling: Note = {
		...note,
		id: '40000000-0000-4000-8000-000000051003' as NoteId,
		title: 'Sibling note'
	};
	await new NoteRecords(owner, context.db).insert(sibling);
	const chunk = (noteId: NoteId, content: string) => ({
		userId: owner.userId,
		projectId: project.id,
		noteId,
		content,
		contentHash: content
	});
	const initial = (await records.find(section(note.id), project.id)).current.knowledge;
	await context.db.insert(schema.searchChunks).values(chunk(note.id, 'own chunk'));
	const afterOwnChunk = (await records.find(section(note.id), project.id)).current.knowledge;
	await context.db.insert(schema.searchChunks).values(chunk(sibling.id, 'sibling chunk'));
	const afterSiblingChunk = (await records.find(section(note.id), project.id)).current.knowledge;
	expect({
		ownChunkMoved: afterOwnChunk !== initial,
		siblingChunkMoved: afterSiblingChunk !== afterOwnChunk
	}).toEqual({ ownChunkMoved: false, siblingChunkMoved: true });
});

it('moves the memory fingerprint when a user memory is added or edited', async () => {
	const { owner, project, note } = await seedNote('51004');
	const records = new InlineGroundingRecords(owner, context.db);
	const markers: string[] = [(await records.find(section(note.id), project.id)).current.memory];
	const [entry] = await context.db
		.insert(schema.memoryEntries)
		.values({ userId: owner.userId, content: 'Writes in British English.' })
		.returning({ id: schema.memoryEntries.id });
	markers.push((await records.find(section(note.id), project.id)).current.memory);
	await context.db
		.update(schema.memoryEntries)
		.set({ content: 'Writes in British English, always.' })
		.where(eq(schema.memoryEntries.id, entry!.id));
	markers.push((await records.find(section(note.id), project.id)).current.memory);
	expect(new Set(markers).size).toBe(3);
});

it('drops the grounding together with its note', async () => {
	const { owner, note } = await seedNote('51005');
	const records = new InlineGroundingRecords(owner, context.db);
	await records.put(section(note.id), snapshot('k1', 'm1'));
	await context.db.delete(schema.notes).where(eq(schema.notes.id, note.id));
	const sibling = await seedNote('51006', owner);
	expect((await records.find(section(note.id), sibling.project.id)).stored).toBeUndefined();
});
