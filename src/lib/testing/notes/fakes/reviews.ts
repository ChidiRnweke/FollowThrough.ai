import type { NoteReviewRemote } from '$lib/models/browser-workspace';
import type {
	AcceptSuggestionOutput,
	DiagramSuggestion,
	Suggestion,
	SuggestionArtifact
} from '$lib/models/suggestions';
import type { DrawioDiagram } from '$lib/models/diagrams';
import {
	diagramBuilder,
	testActor,
	testSuggestionId,
	testProvenanceId,
	testNow,
	testNoteId
} from '$lib/testing/workspace/fixtures/domain-builders';
import { VALID_DRAWIO_XML } from '$lib/testing/diagrams/fixtures/drawio';

export class InMemoryNoteReviews implements NoteReviewRemote {
	readonly acceptedInputs: Parameters<NoteReviewRemote['accept']>[0][] = [];
	readonly rejectedInputs: Parameters<NoteReviewRemote['reject']>[0][] = [];
	readonly diagram: DrawioDiagram & { readonly renderedSvg: string } = {
		...diagramBuilder(),
		kind: 'drawio',
		source: VALID_DRAWIO_XML,
		currentRevision: 1,
		publishedRevision: 0,
		renderedSvg: '<svg xmlns="http://www.w3.org/2000/svg"></svg>'
	};
	artifact: SuggestionArtifact = this.diagram;
	readonly suggestion = {
		id: testSuggestionId(),
		userId: testActor().userId,
		noteId: testNoteId(),
		provenanceId: testProvenanceId(),
		isAutoAccepted: false,
		createdAt: testNow,
		updatedAt: testNow,
		status: 'proposed',
		kind: 'diagram',
		payload: { noteId: testNoteId(), kind: 'drawio', source: VALID_DRAWIO_XML }
	} satisfies DiagramSuggestion;
	failure: Error | null = null;
	private gate: { started(): void; ready: Promise<void> } | null = null;
	pause() {
		const started = Promise.withResolvers<void>();
		const ready = Promise.withResolvers<void>();
		this.gate = { started: started.resolve, ready: ready.promise };
		return { started: started.promise, release: ready.resolve };
	}
	private async settle() {
		const gate = this.gate;
		const failure = this.failure;
		this.gate = null;
		if (gate) {
			gate.started();
			await gate.ready;
		}
		if (failure) throw failure;
	}
	async accept(
		input: Parameters<NoteReviewRemote['accept']>[0]
	): Promise<AcceptSuggestionOutput<SuggestionArtifact>> {
		this.acceptedInputs.push(input);
		await this.settle();
		return {
			suggestion: {
				...this.suggestion,
				id: input.suggestionId,
				status: 'accepted',
				decidedAt: testNow,
				appliedArtifactId: this.diagram.id
			},
			artifact: this.artifact
		};
	}
	async reject(input: Parameters<NoteReviewRemote['reject']>[0]): Promise<Suggestion> {
		this.rejectedInputs.push(input);
		await this.settle();
		return { ...this.suggestion, id: input.suggestionId, status: 'rejected', decidedAt: testNow };
	}
}
