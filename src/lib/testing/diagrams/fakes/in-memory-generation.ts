import type { DiagramGenerationRequest, DiagramSubmission } from '$lib/models/diagrams/generation';
import {
	agentToolNameSchema,
	type AgentToolOutcome,
	type ProviderToolOutput
} from '$lib/models/agent';
import type { AgentToolName } from '$lib/models/agent/tool-catalog';
import type {
	DiagramGeneration,
	DiagramGenerationRun
} from '$lib/server/services/diagrams/generation';
import { readToolOutput } from '$lib/server/repositories/agent/tool-failure';
import { ValidationError } from '$lib/errors';
import { VALID_DRAWIO_XML } from '$lib/testing/diagrams/fixtures/drawio';

export class InMemoryDiagramGeneration implements DiagramGeneration {
	closed = false;
	source = VALID_DRAWIO_XML;
	mermaidSource = 'flowchart LR\nA --> B';
	submissions: DiagramSubmission[] | undefined;
	failure: Error | undefined;
	readonly started = Promise.withResolvers<void>();
	completion: Promise<void> | undefined;
	readonly mermaidByModel = new Map<string, string>();

	toolName(name: string): AgentToolName | undefined {
		return agentToolNameSchema.safeParse(name).data;
	}
	toolOutcome(output: ProviderToolOutput): AgentToolOutcome {
		if (output.kind !== 'value') return output;
		const reading = readToolOutput(output.value);
		if (reading.kind === 'success') return { kind: 'succeeded', value: output.value };
		if (reading.kind === 'corrupt') return { kind: 'unreadable_failure', message: reading.message };
		return { kind: 'reported_failure', value: output.value, failure: reading.failure.message };
	}
	/** Offers each candidate draft in turn until the caller accepts one. */
	async *generate(request: DiagramGenerationRequest, signal: AbortSignal): DiagramGenerationRun {
		try {
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
			for (const draft of candidates) {
				signal.throwIfAborted();
				const decision = yield { kind: 'submission', id: crypto.randomUUID(), draft };
				signal.throwIfAborted();
				if (decision?.kind === 'accepted') return decision.draft;
			}
			throw new ValidationError('The Diagram Agent did not submit a valid diagram.');
		} finally {
			this.closed = true;
		}
	}
}
