import { describe, expect, it } from 'vitest';
import type { ExternalReference, ReferenceId, Url } from '$lib/models';
import { ReferenceLibrary } from './library';
import { InMemoryReferenceRepository } from '$lib/testing/fakes/in-memory-artifact-repositories';
import {
	InMemoryAnchorRepository,
	InMemoryNoteRepository
} from '$lib/testing/fakes/in-memory-note-repositories';
import { InMemoryProvenanceRepository } from '$lib/testing/fakes/in-memory-provenance-repository';
import {
	anchorBuilder,
	noteBuilder,
	testActor,
	testAnchorId,
	testNoteId,
	testNow,
	testProvenanceId
} from '$lib/testing/fixtures/domain-builders';

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
		const views = await service.assemble(testActor(), references.references);
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
		const views = await service.assemble(testActor(), [reference]);
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

	it('deduplicates reference candidates by URL', async () => {
		const { service } = setup();
		const ranked = await service.rank(
			testActor(),
			{ noteId: testNoteId(), text: 'architecture', from: 0, to: 12, revision: 1 },
			[
				{
					url: 'https://example.com' as Url,
					title: 'A',
					tier: 'community',
					relevanceNote: '',
					confidence: 90
				},
				{
					url: 'https://example.com' as Url,
					title: 'B',
					tier: 'official',
					relevanceNote: '',
					confidence: 100
				}
			]
		);
		expect(ranked).toHaveLength(1);
	});

	it('ranks official sources before community sources', async () => {
		const { service } = setup();
		const ranked = await service.rank(
			testActor(),
			{ noteId: testNoteId(), text: 'architecture', from: 0, to: 12, revision: 1 },
			[
				{
					url: 'https://community.test' as Url,
					title: 'Community',
					tier: 'community',
					relevanceNote: '',
					confidence: 100
				},
				{
					url: 'https://official.test' as Url,
					title: 'Official',
					tier: 'official',
					relevanceNote: '',
					confidence: 50
				}
			]
		);
		expect(ranked[0]?.tier).toBe('official');
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
