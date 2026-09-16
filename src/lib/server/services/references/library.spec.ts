import { describe, expect, it } from 'vitest';
import type { ExternalReference, ReferenceId, Url } from '$lib/models/references';
import { ReferenceLibrary } from './library';
import { InMemoryReferenceRepository } from '$lib/testing/skills/fakes/in-memory-artifact-repositories';
import {
	InMemoryAnchorRepository,
	InMemoryNoteRepository
} from '$lib/testing/notes/fakes/in-memory-note-repositories';
import { InMemoryProvenanceRepository } from '$lib/testing/provenance/fakes/in-memory-provenance-repository';
import {
	anchorBuilder,
	noteBuilder,
	testActor,
	testAnchorId,
	testNoteId,
	testNow,
	testProvenanceId
} from '$lib/testing/workspace/fixtures/domain-builders';

const setup = () => {
	const references = new InMemoryReferenceRepository();
	const notes = new InMemoryNoteRepository();
	const anchors = new InMemoryAnchorRepository();
	const provenance = new InMemoryProvenanceRepository();
	notes.notes = [noteBuilder(), noteBuilder({ id: testNoteId(2) })];
	anchors.anchors = [anchorBuilder({ noteId: testNoteId(2) })];
	return {
		references,
		anchors,
		provenance,
		service: new ReferenceLibrary(references, notes, anchors, provenance)
	};
};

describe('Reference management invariants', () => {
	it('assembles the persisted source anchor for an accepted reference', async () => {
		const { service, references, anchors } = setup();
		anchors.anchors = [anchorBuilder()];
		const reference: ExternalReference = {
			id: crypto.randomUUID() as ReferenceId,
			userId: testActor().userId,
			noteId: testNoteId(),
			url: 'https://example.com' as Url,
			title: 'Example',
			tier: 'official',
			relevanceNote: 'Relevant',
			sourceAnchorId: testAnchorId(),
			createdAt: testNow
		};
		references.references = [reference];
		const views = await service.readContexts(testActor(), references.references);
		expect(views[0]?.anchor?.id).toBe(testAnchorId());
	});

	it('keeps an accepted reference visible when its anchor is unavailable', async () => {
		const { service } = setup();
		const reference: ExternalReference = {
			id: crypto.randomUUID() as ReferenceId,
			userId: testActor().userId,
			noteId: testNoteId(),
			url: 'https://example.com' as Url,
			title: 'Example',
			tier: 'official',
			relevanceNote: 'Relevant',
			sourceAnchorId: testAnchorId(2),
			createdAt: testNow
		};
		const views = await service.readContexts(testActor(), [reference]);
		expect(views[0]?.anchor).toBeUndefined();
	});

	it('rejects an anchor owned by another note', async () => {
		const { service } = setup();
		await expect(
			service.create(testActor(), {
				noteId: testNoteId(),
				sourceAnchorId: testAnchorId(),
				url: 'https://example.com' as Url,
				title: 'Example',
				tier: 'official',
				relevanceNote: 'Relevant'
			})
		).rejects.toMatchObject({ code: 'VALIDATION' });
	});

	it('retains the source anchor on a created reference', async () => {
		const { service, anchors, provenance } = setup();
		anchors.anchors = [anchorBuilder()];
		provenance.provenance = [
			{
				id: testProvenanceId(),
				userId: testActor().userId,
				producerKind: 'pipeline',
				producerName: 'Reference',
				pipeline: 'reference',
				sourceAnchorId: testAnchorId(),
				metadata: {},
				createdAt: testNow
			}
		];
		const reference = await service.create(testActor(), {
			noteId: testNoteId(),
			sourceAnchorId: testAnchorId(),
			provenanceId: testProvenanceId(),
			url: 'https://example.com' as Url,
			title: 'Example',
			tier: 'official',
			relevanceNote: 'Relevant'
		});
		expect(reference.sourceAnchorId).toBe(testAnchorId());
	});

	it('retains provenance on a created reference', async () => {
		const { service, anchors, provenance } = setup();
		anchors.anchors = [anchorBuilder()];
		provenance.provenance = [
			{
				id: testProvenanceId(),
				userId: testActor().userId,
				producerKind: 'pipeline',
				producerName: 'Reference',
				pipeline: 'reference',
				sourceAnchorId: testAnchorId(),
				metadata: {},
				createdAt: testNow
			}
		];
		const reference = await service.create(testActor(), {
			noteId: testNoteId(),
			sourceAnchorId: testAnchorId(),
			provenanceId: testProvenanceId(),
			url: 'https://example.com' as Url,
			title: 'Example',
			tier: 'official',
			relevanceNote: 'Relevant'
		});
		expect(reference.provenanceId).toBe(testProvenanceId());
	});
});
