import { expect, it } from 'vitest';
import { Diagrams, type DiagramsDependencies } from './controller';
import { ContentIndex } from '$lib/server/services/knowledge-search/indexing';
import {
	DrawioDiagramTextExtractor,
	DrawioSvgSanitizer,
	DrawioXmlValidator
} from '$lib/server/services/diagrams/drawio';
import {
	InMemoryEmbeddingClient,
	InMemorySearchRepository
} from '$lib/testing/knowledge-search/fakes/in-memory-search';
import {
	InMemoryDiagrams,
	drawioBuilder
} from '$lib/testing/diagrams/fakes/in-memory-diagram-skills';
import { InMemoryNoteContent } from '$lib/testing/notes/fakes/in-memory-content';
import { InMemoryTransactionRunner } from '$lib/testing/workspace/fakes/in-memory-transaction';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import {
	noteBuilder,
	testActor,
	testNoteId,
	testNow
} from '$lib/testing/workspace/fixtures/domain-builders';
import { VALID_DRAWIO_XML } from '$lib/testing/diagrams/fixtures/drawio';

const setup = () => {
	const diagrams = new InMemoryDiagrams();
	const original = drawioBuilder({ source: VALID_DRAWIO_XML });
	diagrams.diagrams = [original];
	const notes = new InMemoryNoteContent();
	notes.notes = [noteBuilder({ title: 'Deployment decisions' })];
	const search = new InMemorySearchRepository();
	const embeddings = new InMemoryEmbeddingClient();
	const index = new ContentIndex(search, embeddings.model);
	const controller = new Diagrams(
		capabilityDependencies<DiagramsDependencies>({
			diagramFinder: diagrams,
			diagramWriter: diagrams,
			diagramSourceNotes: notes,
			diagramIndexer: index.diagrams,
			indexEmbeddings: embeddings,
			indexWriter: index,
			drawioXmlValidator: new DrawioXmlValidator(),
			drawioSvgSanitizer: new DrawioSvgSanitizer(),
			drawioTextExtractor: new DrawioDiagramTextExtractor(),
			now: () => testNow,
			transactionRunner: new InMemoryTransactionRunner([diagrams, search])
		})
	);
	const input = {
		noteId: testNoteId(),
		diagramId: original.id,
		source: VALID_DRAWIO_XML.replace('API &amp; worker', 'New labels'),
		renderedSvg: '<svg xmlns="http://www.w3.org/2000/svg"><text>New labels</text></svg>'
	};
	return { controller, search, notes, diagrams, original, input };
};

it('uses the resolved source-note title in immediately searchable diagram chunks', async () => {
	const { controller, search, input } = setup();
	await controller.saveDrawio(testActor(), input);
	expect(
		(await search.searchByEmbedding(testActor(), [1, 0, 1], 10)).map(
			({ document }) => document.sourceTitle
		)
	).toEqual(['Diagram in Deployment decisions']);
});

it('rolls back the diagram edit when its source-note context is missing', async () => {
	const { controller, notes, diagrams, original, input } = setup();
	notes.notes = [];
	await controller.saveDrawio(testActor(), input).then(
		() => {
			throw new Error('Expected missing source note');
		},
		(error) => {
			if (!(error instanceof Error) || !error.message.includes('not found')) throw error;
		}
	);
	expect(diagrams.diagrams).toEqual([original]);
});
