import type {
	DiagramGenerationEvent as GenerationEvent,
	DiagramGenerationRequest,
	DiagramSubmission,
	DiagramSubmissionDecision
} from '$lib/models/diagrams/generation';
import type { ProviderStreamEvent } from '$lib/models/agent';
import type {
	DiagramGenerationStore,
	DiagramCompletion
} from '$lib/server/stores/diagrams/generation';
export type DiagramGenerationEvent = GenerationEvent<ProviderStreamEvent>;
export interface DiagramGenerationSession {
	readonly events: AsyncIterable<DiagramGenerationEvent>;
	respond(id: string, decision: DiagramSubmissionDecision): void;
	result(): Promise<DiagramSubmission>;
	close(): Promise<void>;
}
export interface DiagramGenerator {
	open(request: DiagramGenerationRequest, signal?: AbortSignal): DiagramGenerationSession;
}
export interface DiagramProviderEvents {
	provider(event: ProviderStreamEvent): void;
	submit(draft: DiagramSubmission): Promise<DiagramSubmissionDecision>;
}
export interface DiagramProvider {
	run(
		request: DiagramGenerationRequest,
		signal: AbortSignal,
		events: DiagramProviderEvents
	): Promise<DiagramSubmission>;
	close(): Promise<void>;
}
export interface DiagramProviderFactory {
	create(): DiagramProvider;
}
export interface DiagramSessionExecution extends DiagramGenerationSession {
	start(request: DiagramGenerationRequest, signal?: AbortSignal): void;
}
export interface DiagramSessionFactory {
	create(provider: DiagramProvider): DiagramSessionExecution;
}

export class DiagramGeneration implements DiagramGenerator {
	constructor(
		private readonly providers: DiagramProviderFactory,
		private readonly sessions: DiagramSessionFactory
	) {}
	open(request: DiagramGenerationRequest, signal?: AbortSignal): DiagramGenerationSession {
		const session = this.sessions.create(this.providers.create());
		session.start(request, signal);
		return session;
	}
}
/** Coordinates the provider protocol and validation decisions for one execution. */
export class DiagramSessions implements DiagramSessionExecution {
	constructor(
		private readonly provider: DiagramProvider,
		private readonly state: DiagramGenerationStore
	) {}
	start(request: DiagramGenerationRequest, signal?: AbortSignal): void {
		if (this.state.completion) throw new Error('Diagram generation session has already started.');
		const combined = signal
			? AbortSignal.any([signal, this.state.abort.signal])
			: this.state.abort.signal;
		const completion = this.produce(request, combined)
			.then(
				(draft): DiagramCompletion => ({ kind: 'completed', draft }),
				(error): DiagramCompletion => {
					return {
						kind: 'failure',
						error: error instanceof Error ? error : new Error(String(error))
					};
				}
			)
			.then((completion) => {
				this.state.finish(completion);
				this.state.takeWake()?.();
				return completion;
			});
		this.state.start(completion, this.readEvents());
	}
	get events(): AsyncIterable<DiagramGenerationEvent> {
		const events = this.state.events;
		if (!events) throw new Error('Diagram generation session has not started.');
		return events;
	}
	respond(id: string, decision: DiagramSubmissionDecision): void {
		const pending = this.state.takeDecision(id);
		if (!pending) throw new Error('Diagram submission is no longer awaiting a decision.');
		pending.resolve(decision);
	}
	async result(): Promise<DiagramSubmission> {
		const completion = await this.completion();
		if (completion.kind === 'failure') throw completion.error;
		return completion.draft;
	}
	async close(): Promise<void> {
		this.state.abort.abort(new Error('Diagram generation session closed.'));
		await this.completion();
	}
	private completion(): Promise<DiagramCompletion> {
		const completion = this.state.completion;
		if (!completion) throw new Error('Diagram generation session has not started.');
		return completion;
	}
	private emit(event: DiagramGenerationEvent): void {
		this.state.enqueue(event);
		this.state.takeWake()?.();
	}
	private async *readEvents(): AsyncGenerator<DiagramGenerationEvent> {
		while (true) {
			const event = this.state.shift();
			if (event) {
				yield event;
				continue;
			}
			const status = this.state.status;
			if (status.kind === 'failure') throw status.error;
			if (status.kind === 'completed') return;
			await new Promise<void>((resolve) => this.state.wait(resolve));
		}
	}
	private async produce(
		request: DiagramGenerationRequest,
		signal: AbortSignal
	): Promise<DiagramSubmission> {
		const cancel = () => {
			for (const pending of this.state.takeDecisions())
				pending.reject(new Error('Diagram generation was cancelled.'));
		};
		signal.addEventListener('abort', cancel, { once: true });
		try {
			signal.throwIfAborted();
			return await this.provider.run(request, signal, {
				provider: (event) => this.emit({ kind: 'provider', event }),
				submit: (draft) => {
					signal.throwIfAborted();
					const id = crypto.randomUUID();
					return new Promise<DiagramSubmissionDecision>((resolve, reject) => {
						this.state.addDecision(id, { resolve, reject });
						this.emit({ kind: 'submission', id, draft });
					});
				}
			});
		} finally {
			signal.removeEventListener('abort', cancel);
			cancel();
			await this.provider.close();
		}
	}
}
