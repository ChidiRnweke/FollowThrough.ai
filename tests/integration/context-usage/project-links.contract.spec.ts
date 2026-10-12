import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import type { Note, NoteId } from '$lib/models/notes';
import type { ProjectId } from '$lib/models/projects';
import * as schema from '$lib/server/db/schema/registry';
import { ProjectLinkRecords } from '$lib/server/repositories/context-usage/postgres/project-links';
import { NoteRecords } from '$lib/server/repositories/notes/postgres/notes';
import { context, now, seedNote } from '../database-harness';

/** A note beside `base` in its project; `over` sets what differs. */
const addNote = (base: Note, title: string, over: Partial<Note> = {}) =>
	new NoteRecords({ userId: base.userId }, context.db).insert({
		...base,
		id: crypto.randomUUID() as NoteId,
		title,
		...over
	});

/** A file on `note`, whose current version reached `status`. */
const attach = async (note: Note, path: string, status: string) => {
	const [attachment] = await context.db
		.insert(schema.attachments)
		.values({ userId: note.userId, projectId: note.projectId, noteId: note.id, path })
		.returning();
	const [version] = await context.db
		.insert(schema.attachmentVersions)
		.values({
			attachmentId: attachment!.id,
			objectKey: `objects/${attachment!.id}`,
			mediaType: 'text/plain',
			byteSize: 128,
			checksumSha256: 'a'.repeat(64),
			processingStatus: status
		})
		.returning();
	await context.db
		.update(schema.attachments)
		.set({ currentVersionId: version!.id })
		.where(eq(schema.attachments.id, attachment!.id));
	return attachment!;
};

const relate = (from: Note, to: Note, kind: 'elaborates' | 'mentions' | 'contradicts') =>
	context.db
		.insert(schema.noteRelationships)
		.values({ userId: from.userId, sourceNoteId: from.id, targetNoteId: to.id, kind });

describe('The project link records read what the actor linked inside one project', () => {
	it('reads relationships, skill usages and note files, and leaves out archived notes and unreadable files', async () => {
		const { owner, project, note: brief } = await seedNote('c5');
		const plan = await addNote(brief, 'Plan', { position: 1 });
		const old = await addNote(brief, 'Old plan', { position: 2, archivedAt: now });
		const skill = await addNote(brief, 'Contract review', { kind: 'skill', position: 3 });
		await context.db.insert(schema.skills).values({
			noteId: skill.id,
			name: 'contract-review',
			slug: 'contract-review',
			description: 'Reviews contracts.'
		});
		await relate(plan, brief, 'elaborates');
		await relate(old, brief, 'mentions');
		await context.db
			.insert(schema.skillUsages)
			.values({ skillNoteId: skill.id, contextNoteId: brief.id, createdAt: new Date(now) });
		const sketch = await attach(brief, 'drafts/sketch.png', 'ready');
		await attach(brief, 'scan.pdf', 'failed');
		await attach(old, 'old.txt', 'ready');

		const links = await new ProjectLinkRecords(owner, context.db).read(project.id);

		expect(links).toEqual([
			{
				kind: 'elaborates',
				from: { kind: 'note', id: plan.id, title: 'Plan' },
				to: { kind: 'note', id: brief.id, title: brief.title }
			},
			{
				kind: 'skill_used_in',
				from: { kind: 'skill', id: skill.id, title: 'Contract review' },
				to: { kind: 'note', id: brief.id, title: brief.title }
			},
			{
				kind: 'attached_to',
				from: { kind: 'attachment', id: sketch.id, title: 'sketch.png' },
				to: { kind: 'note', id: brief.id, title: brief.title }
			}
		]);
	});

	it("does not read another user's links, even given their project", async () => {
		const mine = await seedNote('c6');
		const theirs = await seedNote('c7');
		await relate(
			theirs.note,
			await addNote(theirs.note, 'Their plan', { position: 1 }),
			'contradicts'
		);

		const links = await new ProjectLinkRecords(mine.owner, context.db).read(
			theirs.project.id as ProjectId
		);

		expect(links).toEqual([]);
	});
});
