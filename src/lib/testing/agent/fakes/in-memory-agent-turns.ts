import { AgentProviderFailure } from '$lib/errors';
import {
	agentToolNameSchema,
	type AgentExecutionUpdate,
	type AgentToolOutcome,
	type PersistedSessionItem,
	type ProviderStreamEvent,
	type ProviderToolOutput,
	type WebResearchSettings
} from '$lib/models/agent';
import type { AgentToolName } from '$lib/models/agent/tool-catalog';
import { readToolOutput } from '$lib/server/repositories/agent/tool-failure';
import type {
	AgentProviderTurn,
	AgentProviderTurnInput,
	AgentTurns
} from '$lib/server/services/agent/runs/turns';

/**
 * A model provider that streams the configured events, waits for `completion` (or for the
 * run's abort when `abortable`), then ends with the configured outcome.
 */
export class InMemoryAgentTurns implements AgentTurns {
	events: ProviderStreamEvent[] = [];
	/** Each turn takes the next transcript here before falling back to `events`. */
	readonly queuedEvents: (readonly ProviderStreamEvent[])[] = [];
	/** One entry per turn: whether its provider lease was released. */
	readonly closed: boolean[] = [];
	readonly started = Promise.withResolvers<void>();
	completion: Promise<void> = Promise.resolve();
	readonly signals: AbortSignal[] = [];
	readonly researchSettings: WebResearchSettings[] = [];
	readonly inputs: AgentProviderTurnInput[] = [];
	abortable = false;
	outcome: Extract<AgentExecutionUpdate, { type: 'completed' | 'approval_checkpoint' }> = {
		type: 'completed',
		sessionItems: []
	};

	calledTools(history: readonly PersistedSessionItem[]): readonly string[] {
		return history.flatMap((item) => (item.type === 'function_call' ? [item.name] : []));
	}

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

	async describeImages(): Promise<string[]> {
		return [];
	}

	failure(error: unknown): AgentProviderFailure {
		if (error instanceof AgentProviderFailure) return error;
		return new AgentProviderFailure(
			error instanceof Error ? error.message : String(error),
			'EXTERNAL_SERVICE',
			false,
			{ cause: error }
		);
	}

	async turn(input: AgentProviderTurnInput): Promise<AgentProviderTurn> {
		this.inputs.push(input);
		this.signals.push(input.signal);
		this.researchSettings.push(input.webSearch);
		this.started.resolve();
		const events = [...(this.queuedEvents.shift() ?? this.events)];
		const lease = this.closed.push(false) - 1;
		const wait = async () => {
			const aborted = Promise.withResolvers<void>();
			const onAbort = () => aborted.resolve();
			if (input.signal.aborted) onAbort();
			input.signal.addEventListener('abort', onAbort, { once: true });
			try {
				await (this.abortable ? Promise.race([this.completion, aborted.promise]) : this.completion);
			} finally {
				input.signal.removeEventListener('abort', onAbort);
			}
		};
		const outcome = this.outcome;
		return {
			close: async () => {
				this.closed[lease] = true;
			},
			events: (async function* () {
				yield* events;
				await wait();
			})(),
			outcome: async () =>
				outcome.type === 'completed'
					? { kind: 'completed', sessionItems: outcome.sessionItems }
					: {
							kind: 'approval',
							serialize: () => outcome.serializedState,
							pending: outcome.pendingDecisions,
							sessionItems: outcome.sessionItems
						}
		};
	}
}

type TurnOutcome = Awaited<ReturnType<AgentProviderTurn['outcome']>>;

/** A provider whose turn a test scripts: the events it streams and how the turn ends. */
export class ScriptedAgentTurns extends InMemoryAgentTurns {
	constructor(
		private readonly script: {
			readonly events: (input: AgentProviderTurnInput) => AsyncIterable<ProviderStreamEvent>;
			readonly outcome?: () => Promise<TurnOutcome>;
		}
	) {
		super();
	}

	override async turn(input: AgentProviderTurnInput): Promise<AgentProviderTurn> {
		this.inputs.push(input);
		this.signals.push(input.signal);
		this.started.resolve();
		const lease = this.closed.push(false) - 1;
		return {
			close: async () => {
				this.closed[lease] = true;
			},
			events: this.script.events(input),
			outcome: this.script.outcome ?? (async () => ({ kind: 'completed', sessionItems: [] }))
		};
	}
}
