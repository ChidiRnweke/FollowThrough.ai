import { describe, expect, it } from 'vitest';
import type {
	Diagram,
	DiagramId,
	DiagramRevision,
	DiagramRevisionId,
	DrawioDiagram
} from '$lib/models/diagrams';
import { DiagramRecords } from '$lib/server/repositories/diagrams/postgres/diagrams';
import { NoteRecords } from '$lib/server/repositories/notes/postgres/notes';
import { actor, context, now, seedNote } from '../database-harness';

const diagram = (suffix: string, overrides: Partial<Diagram> = {}): Diagram =>
	({
		id: `a0000000-0000-4000-8000-${suffix.padStart(12, '0')}` as DiagramId,
		kind: 'mermaid',
		source: 'flowchart LR\nA --> B',
		searchableText: 'A B',
		createdAt: now,
		updatedAt: now,
		...overrides
	}) as Diagram;

describe('Project-owned diagram persistence invariants', () => {
	it('rejects a draft write after publication moved without changing the working revision', async () => {
		const { owner, project } = await seedNote('480');
		const repository = new DiagramRecords(context.db);
		const draft: DrawioDiagram = {
			id: 'a0000000-0000-4000-8000-000000000480' as DiagramId,
			userId: owner.userId,
			projectId: project.id,
			kind: 'drawio',
			source: '<mxfile/>',
			searchableText: '',
			currentRevision: 2,
			publishedRevision: 1,
			createdAt: now,
			updatedAt: now
		};
		await repository.insert(owner, draft);
		await repository.updateIfRevision(
			owner,
			{ ...draft, publishedRevision: 2, publishedAt: now },
			2,
			1
		);
		expect(
			await repository.updateIfRevision(
				owner,
				{ ...draft, source: '<mxfile>draft</mxfile>', currentRevision: 3 },
				2,
				1
			)
		).toBeUndefined();
	});

	it('preserves the first immutable snapshot when publication is retried', async () => {
		const { owner, project } = await seedNote('481');
		const repository = new DiagramRecords(context.db);
		const draft: DrawioDiagram = {
			id: 'a0000000-0000-4000-8000-000000000481' as DiagramId,
			userId: owner.userId,
			projectId: project.id,
			kind: 'drawio',
			source: '<mxfile/>',
			searchableText: '',
			currentRevision: 1,
			publishedRevision: 1,
			publishedAt: now,
			createdAt: now,
			updatedAt: now
		};
		await repository.insert(owner, draft);
		const revision: DiagramRevision = {
			id: 'b0000000-0000-4000-8000-000000000481' as DiagramRevisionId,
			diagramId: draft.id,
			revision: 1,
			source: draft.source,
			renderedSvg: '<svg/>',
			searchableText: '',
			createdAt: now
		};
		const original = await repository.insertRevision(owner, revision);
		expect(
			await repository.insertRevision(owner, {
				...revision,
				id: 'b0000000-0000-4000-8000-000000000482' as DiagramRevisionId,
				renderedSvg: '<svg>regenerated</svg>'
			})
		).toEqual(original);
	});

	// The point of moving diagrams onto the project: a studio diagram is authored
	// in a conversation and never belongs to a note at all.
	it('persists a diagram that names no source note', async () => {
		const { owner, project } = await seedNote('420');
		const repository = new DiagramRecords(context.db);
		const stored = await repository.insert(
			owner,
			diagram('420', { userId: owner.userId, projectId: project.id })
		);
		expect(stored.sourceNoteId).toBeUndefined();
	});

	// Diagrams used to cascade with their note. They no longer do, because a note
	// is one place a diagram is shown rather than the thing that owns it.
	it('keeps a diagram when the note it came from is deleted', async () => {
		const { owner, project, note } = await seedNote('421');
		const repository = new DiagramRecords(context.db);
		const stored = await repository.insert(
			owner,
			diagram('421', { userId: owner.userId, projectId: project.id, sourceNoteId: note.id })
		);
		await new NoteRecords(context.db).delete(owner, note.id);
		expect(await repository.findById(owner, stored.id)).toBeDefined();
	});

	it('clears the source note of a diagram whose note is deleted', async () => {
		const { owner, project, note } = await seedNote('422');
		const repository = new DiagramRecords(context.db);
		const stored = await repository.insert(
			owner,
			diagram('422', { userId: owner.userId, projectId: project.id, sourceNoteId: note.id })
		);
		await new NoteRecords(context.db).delete(owner, note.id);
		expect((await repository.findById(owner, stored.id))?.sourceNoteId).toBeUndefined();
	});

	it('lists a note-less diagram under its project', async () => {
		const { owner, project } = await seedNote('423');
		const repository = new DiagramRecords(context.db);
		const stored = await repository.insert(
			owner,
			diagram('423', { userId: owner.userId, projectId: project.id })
		);
		expect(
			(await repository.listForProject(owner, project.id)).diagrams.map((item) => item.id)
		).toEqual([stored.id]);
	});

	it('rejects a diagram naming a note that belongs to another actor', async () => {
		const { project } = await seedNote('424');
		const { note: foreign } = await seedNote('425');
		const repository = new DiagramRecords(context.db);
		await expect(
			repository.insert(
				actor('424'),
				diagram('424', {
					userId: actor('424').userId,
					projectId: project.id,
					sourceNoteId: foreign.id
				})
			)
		).rejects.toMatchObject({ code: 'NOT_FOUND' });
	});

	// The delete confirmation says how many notes will lose their diagram. The
	// references live in note documents, so this is a jsonb scan, not a join.
	it('counts a note whose document renders the diagram', async () => {
		const { owner, project, note } = await seedNote('426');
		const repository = new DiagramRecords(context.db);
		const stored = await repository.insert(
			owner,
			diagram('426', {
				userId: owner.userId,
				projectId: project.id,
				kind: 'drawio',
				source: '<mxfile />'
			})
		);
		await new NoteRecords(context.db).update(owner, {
			...note,
			document: {
				type: 'doc',
				content: [{ type: 'drawio', attrs: { diagramId: stored.id } }]
			} as typeof note.document
		});
		expect(await repository.countReferencingNotes(owner, stored.id)).toBe(1);
	});

	it('does not count a note that renders a different diagram', async () => {
		const { owner, project, note } = await seedNote('427');
		const repository = new DiagramRecords(context.db);
		const stored = await repository.insert(
			owner,
			diagram('427', {
				userId: owner.userId,
				projectId: project.id,
				kind: 'drawio',
				source: '<mxfile />'
			})
		);
		await new NoteRecords(context.db).update(owner, {
			...note,
			document: {
				type: 'doc',
				content: [{ type: 'drawio', attrs: { diagramId: '00000000-0000-4000-8000-00000000dead' } }]
			} as typeof note.document
		});
		expect(await repository.countReferencingNotes(owner, stored.id)).toBe(0);
	});
});
