import type {
	DiagramGenerationRequest,
	DiagramSubmission,
	DiagramSubmissionDecision
} from '$lib/models/diagrams/generation';
import type {
	DiagramGenerationEvent,
	DiagramGenerator,
	DiagramGenerationSession
} from '$lib/server/services/diagrams/generation';
import { ValidationError } from '$lib/errors';
import { VALID_DRAWIO_XML } from '$lib/testing/diagrams/fixtures/drawio';

export class InMemoryDiagramGeneration implements DiagramGenerator {
	source = VALID_DRAWIO_XML;
	mermaidSource = 'flowchart LR\nA --> B';
	submissions: DiagramSubmission[] | undefined;
	failure: Error | undefined;
	readonly started = Promise.withResolvers<void>();
	completion: Promise<void> | undefined;
	readonly mermaidByModel = new Map<string, string>();

	open(request: DiagramGenerationRequest, signal?: AbortSignal): DiagramGenerationSession {
		const candidates = this.submissions ?? [
			request.operation === 'convert'
				? { kind: 'drawio' as const, title: 'Converted architecture', source: this.source }
				: {
						kind: 'mermaid' as const,
						source: this.mermaidByModel.get(request.model) ?? this.mermaidSource
					}
		];
		let accepted: DiagramSubmission | undefined;
		let pending: string | undefined;
		const failure = this.failure;
		const started = this.started;
		const completion = this.completion;
		return {
			events: (async function* (): AsyncGenerator<DiagramGenerationEvent> {
				started.resolve();
				await completion;
				if (failure) throw failure;
				for (const draft of candidates) {
					signal?.throwIfAborted();
					pending = crypto.randomUUID();
					yield { kind: 'submission', id: pending, draft };
					if (pending) throw new Error('Submission requires a controller decision.');
					if (accepted) return;
				}
			})(),
			respond(id: string, decision: DiagramSubmissionDecision) {
				if (id !== pending) throw new Error('Unknown diagram submission.');
				pending = undefined;
				if (decision.kind === 'accepted') accepted = decision.draft;
			},
			async result() {
				signal?.throwIfAborted();
				if (!accepted)
					throw new ValidationError('The Diagram Agent did not submit a valid diagram.');
				return accepted;
			},
			async close() {}
		};
	}
}
