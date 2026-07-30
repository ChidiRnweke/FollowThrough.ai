import { describe, expect, it } from 'vitest';
import type { DiagramSuggestion } from '$lib/models';
import { SuggestionApplication } from './application';
import { InMemoryDiagrams } from '$lib/testing/fakes/in-memory-diagram-skills';
import {
	testActor,
	testNow,
	testNoteId,
	testProvenanceId,
	testSuggestionId
} from '$lib/testing/fixtures/domain-builders';
import { VALID_DRAWIO_XML } from '$lib/testing/fixtures/drawio';
import { DrawioLabelExtractor, DrawioXmlValidator } from '../diagrams/drawio';

const suggestion = (source: string): DiagramSuggestion => ({
	id: testSuggestionId(),
	userId: testActor().userId,
	noteId: testNoteId(),
	kind: 'diagram',
	status: 'proposed',
	payload: { noteId: testNoteId(), kind: 'drawio', title: 'Architecture', source },
	provenanceId: testProvenanceId(),
	isAutoAccepted: false,
	createdAt: testNow,
	updatedAt: testNow
});

const setup = () => {
	const diagrams = new InMemoryDiagrams();
	const unused = {} as never;
	const applier = new SuggestionApplication(
		unused,
		unused,
		unused,
		diagrams,
		unused,
		unused,
		unused,
		unused,
		unused,
		new DrawioXmlValidator(),
		new DrawioLabelExtractor()
	);
	return { applier, diagrams };
};

describe('Draw.io suggestion application invariants', () => {
	it('cannot apply invalid draw.io XML', async () => {
		const { applier } = setup();
		await expect(applier.apply(testActor(), suggestion('<mxfile />'))).rejects.toMatchObject({
			code: 'VALIDATION'
		});
	});

	it('persists validated draw.io XML through the ordinary artifact applier', async () => {
		const { applier } = setup();
		const artifact = await applier.apply(testActor(), suggestion(VALID_DRAWIO_XML));
		expect('kind' in artifact ? artifact.kind : undefined).toBe('drawio');
	});

	it('extracts labels while applying the accepted suggestion', async () => {
		const { applier } = setup();
		const artifact = await applier.apply(testActor(), suggestion(VALID_DRAWIO_XML));
		expect('searchableText' in artifact ? artifact.searchableText : undefined).toBe('API & worker');
	});
});
