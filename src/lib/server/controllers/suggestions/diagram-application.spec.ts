import type { DiagramSuggestion } from '$lib/models/suggestions';
import { describe, expect, it } from 'vitest';
import { Suggestions, type SuggestionsDependencies } from './controller';
import { InMemoryDiagrams } from '$lib/testing/diagrams/fakes/in-memory-diagram-skills';
import { InMemorySuggestions } from '$lib/testing/suggestions/fakes/in-memory-automation';
import { InMemorySuggestionEffects } from '$lib/testing/suggestions/fakes/in-memory-suggestion-effects';
import { InMemoryNoteContent } from '$lib/testing/notes/fakes/in-memory-content';
import { InMemoryTransactionRunner } from '$lib/testing/workspace/fakes/in-memory-transaction';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import {
	testActor,
	testNow,
	testNoteId,
	testProvenanceId,
	testSuggestionId,
	noteBuilder
} from '$lib/testing/workspace/fixtures/domain-builders';
import { VALID_DRAWIO_XML } from '$lib/testing/diagrams/fixtures/drawio';
import {
	DrawioLabelExtractor,
	DrawioXmlValidator,
	DrawioSvgSanitizer,
	DrawioDiagramTextExtractor
} from '$lib/server/services/diagrams/drawio';

const setup = (source = VALID_DRAWIO_XML) => {
	const diagrams = new InMemoryDiagrams();
	const suggestions = new InMemorySuggestions();
	const effects = new InMemorySuggestionEffects();
	const notes = new InMemoryNoteContent();
	notes.notes = [noteBuilder()];
	const suggestion: DiagramSuggestion = {
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
	};
	suggestions.suggestions = [suggestion];
	const controller = new Suggestions(
		capabilityDependencies<SuggestionsDependencies>({
			suggestionFinder: suggestions,
			suggestionAccepter: suggestions,
			suggestionEffects: effects,
			diagramWriter: diagrams,
			diagramIndexer: diagrams,
			sourceNotes: notes,
			drawioXmlValidator: new DrawioXmlValidator(),
			drawioLabels: new DrawioLabelExtractor(),
			drawioSvgSanitizer: new DrawioSvgSanitizer(),
			drawioTextExtractor: new DrawioDiagramTextExtractor(),
			now: () => testNow,
			transactionRunner: new InMemoryTransactionRunner([diagrams, suggestions, effects])
		})
	);
	const input = {
		suggestionId: suggestion.id,
		drawioReview: {
			noteId: testNoteId(),
			source,
			renderedSvg: '<svg xmlns="http://www.w3.org/2000/svg"><text>API</text></svg>'
		}
	};
	return { controller, diagrams, suggestions, input };
};

describe('Diagram suggestion application', () => {
	it('refuses invalid draw.io source', async () => {
		const { controller, input } = setup('<mxfile />');
		await expect(controller.acceptReviewed(testActor(), input)).rejects.toMatchObject({
			code: 'VALIDATION'
		});
	});
	it('persists the accepted diagram with its searchable labels', async () => {
		const { controller, diagrams, input } = setup();
		await controller.acceptReviewed(testActor(), input);
		expect(diagrams.diagrams[0]).toMatchObject({
			kind: 'drawio',
			source: VALID_DRAWIO_XML,
			searchableText: 'API & worker'
		});
	});
	it('rolls back diagram creation when acceptance persistence fails', async () => {
		const { controller, diagrams, suggestions, input } = setup();
		suggestions.failAcceptance = true;
		await controller.acceptReviewed(testActor(), input).catch(() => undefined);
		expect(diagrams.diagrams).toEqual([]);
	});
	it('keeps the proposal pending when indexing fails', async () => {
		const { controller, diagrams, suggestions, input } = setup();
		diagrams.failIndex = true;
		await controller.acceptReviewed(testActor(), input).catch(() => undefined);
		expect(suggestions.suggestions[0].status).toBe('proposed');
	});
});
