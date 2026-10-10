import type { DiagramSuggestion } from '$lib/models/suggestions';
import {
	Suggestions,
	type SuggestionsDependencies
} from '$lib/server/controllers/suggestions/controller';
import {
	DrawioLabelReader,
	DrawioSvgSanitizer,
	DrawioXmlValidator
} from '$lib/server/services/diagrams/drawio';
import { DiagramLabelPresentationService } from '$lib/services/diagrams/labels';
import { ProvenancePresentationService } from '$lib/services/provenance/presentation';
import { SuggestionPresentationService } from '$lib/services/suggestions/presentation';
import { TodoEditingRulesService } from '$lib/services/todos/edits';
import { agentToolResultsFixture } from '$lib/testing/agent/fixtures/tool-results';
import { InMemoryDiagrams } from '$lib/testing/diagrams/fakes/in-memory-diagram-skills';
import { VALID_DRAWIO_XML } from '$lib/testing/diagrams/fixtures/drawio';
import { InMemoryNoteContent } from '$lib/testing/notes/fakes/in-memory-content';
import { InMemorySuggestions } from '$lib/testing/suggestions/fakes/in-memory-automation';
import { InMemorySuggestionEffects } from '$lib/testing/suggestions/fakes/in-memory-suggestion-effects';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { InMemoryTransactionRunner } from '$lib/testing/workspace/fakes/in-memory-transaction';
import {
	noteBuilder,
	testActor,
	testNoteId,
	testNow,
	testProvenanceId,
	testSuggestionId
} from '$lib/testing/workspace/fixtures/domain-builders';

export const diagramSuggestionFixture = (source = VALID_DRAWIO_XML) => {
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
		new ProvenancePresentationService(),
		capabilityDependencies<SuggestionsDependencies>({
			...agentToolResultsFixture(),
			todoCreationRules: new TodoEditingRulesService(),
			suggestionPresentation: new SuggestionPresentationService(),
			suggestionFinder: suggestions,
			suggestionAccepter: suggestions,
			suggestionEffects: effects,
			diagramWriter: diagrams,
			diagramIndexer: diagrams,
			sourceNotes: notes,
			drawioXmlValidator: new DrawioXmlValidator(),
			drawioSvgSanitizer: new DrawioSvgSanitizer(),
			diagramLabelPresentation: new DiagramLabelPresentationService(),
			drawioLabels: new DrawioLabelReader(),
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
