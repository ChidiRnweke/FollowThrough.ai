import type { ProviderStreamEvent } from '$lib/models/agent';
import type { DiagramGenerationRequest, DiagramSubmission } from '$lib/models/diagrams/generation';
import type {
	DiagramProvider,
	DiagramProviderFactory,
	DiagramProviderEvents
} from '$lib/server/controllers/diagrams/controller';
import { ValidationError } from '$lib/errors';
import { VALID_DRAWIO_XML } from '$lib/testing/diagrams/fixtures/drawio';

export class InMemoryDiagramGeneration implements DiagramProviderFactory {
	closed = false;
	events: ProviderStreamEvent[] = [];
	source = VALID_DRAWIO_XML;
	mermaidSource = 'flowchart LR\nA --> B';
	submissions: DiagramSubmission[] | undefined;
	failure: Error | undefined;
	readonly started = Promise.withResolvers<void>();
	completion: Promise<void> | undefined;
	readonly mermaidByModel = new Map<string, string>();

	create(): DiagramProvider {
		return {
			run: (request, signal, events) => this.run(request, signal, events),
			close: async () => {
				this.closed = true;
			}
		};
	}
	private async run(
		request: DiagramGenerationRequest,
		signal: AbortSignal,
		events: DiagramProviderEvents
	): Promise<DiagramSubmission> {
		const candidates = this.submissions ?? [
			request.operation === 'convert'
				? { kind: 'drawio' as const, title: 'Converted architecture', source: this.source }
				: {
						kind: 'mermaid' as const,
						source: this.mermaidByModel.get(request.model) ?? this.mermaidSource
					}
		];
		this.started.resolve();
		await this.completion;
		if (this.failure) throw this.failure;
		for (const event of this.events) {
			signal.throwIfAborted();
			events.provider(event);
		}
		for (const draft of candidates) {
			signal.throwIfAborted();
			const decision = await events.submit(draft);
			signal.throwIfAborted();
			if (decision.kind === 'accepted') return decision.draft;
		}
		throw new ValidationError('The Diagram Agent did not submit a valid diagram.');
	}
}
