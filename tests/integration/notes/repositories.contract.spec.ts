import { describe, expect, it } from 'vitest';
import type { Note, NoteId } from '$lib/models/notes';
import { NoteRecords } from '$lib/server/repositories/notes/postgres/notes';
import { ProjectRecords } from '$lib/server/repositories/projects/postgres/projects';
import { actor, context, now, seedNote } from '../database-harness';
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
			document: { type: 'doc', content: [] },
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
			document: { type: 'doc', content: [] },
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
			document: { type: 'doc', content: [] },
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
	it('allows exactly one concurrent note update from the same revision', async () => {
		const { owner, note } = await seedNote('183');
		const repository = new NoteRecords(context.db);
		const results = await Promise.all([
			repository.updateIfRevision(owner, { ...note, title: 'Browser A', currentRevision: 2 }, 1),
			repository.updateIfRevision(owner, { ...note, title: 'Browser B', currentRevision: 2 }, 1)
		]);
		expect(results.filter(Boolean)).toHaveLength(1);
	});
});
