import type { AgentToolRegistry } from './tool-sessions';
import type { AgentStreamMappings } from '$lib/server/controllers/agent/stream-events';
import type { ConversationImageInput } from '$lib/models/agent';
import type { AgentPromptPreparation } from '$lib/server/services/agent/runs/instructions';
import type { AgentToolRecovery } from '$lib/server/services/agent/runs/tool-recovery';
import type { AgentRunner } from '$lib/server/services/agent/runs/contracts';
import type { OpenAIProvider, Session, Tool } from '@openai/agents';
import type { ActorContext } from '$lib/models/identity';
import {
	DEFAULT_AGENT_MAX_TURNS,
	type AgentExecutionUpdate,
	type AgentRun,
	type AgentRunImages,
	type AgentRunContext,
	type AgentRunDecisionRecord,
	type PendingAgentDecision,
	type ProviderStreamEvent,
	type RunAgentInput,
	type ToolClassification,
	type WebResearchSettings
} from '$lib/models/agent';
import { type ToolName } from '$lib/models/agent/tool-catalog';
import type { AgentPayload, AgentPayloadObject } from '$lib/models/agent/payload';
import { AgentProviderFailure } from '$lib/errors';
import type { ConversationId, PersistedSessionItem } from '$lib/models/agent';

export interface AgentToolExecutor {
	execute(
		input: {
			readonly callId?: string;
			readonly toolName: ToolName;
			readonly arguments: AgentPayloadObject;
			readonly classification: ToolClassification;
		},
		action: () => Promise<AgentPayload>
	): Promise<AgentPayload>;
}
export interface AgentExecutionSessions {
	create(actor: ActorContext, conversationId: ConversationId): BufferedSession;
}
interface BufferedSession extends Session {
	snapshot(): Promise<readonly PersistedSessionItem[]>;
}

interface AgentTurnContext {
	readonly input: string;
	readonly sessionId: string;
	readonly model: string;
	readonly userId?: string;
	readonly runId?: string;
	readonly parentTraceparent?: string;
	readonly onRoot?: (traceparent: string) => void;
}

type AgentTurnObserver = <T>(
	context: AgentTurnContext,
	operation: () => AsyncIterable<T>,
	output: () => string
) => AsyncIterable<T>;

const directTurnObserver: AgentTurnObserver = async function* (_context, operation) {
	yield* operation();
};

export interface AgentProviderTurn {
	readonly events: AsyncIterable<ProviderStreamEvent>;
	outcome(): Promise<
		| { readonly kind: 'completed' }
		| {
				readonly kind: 'approval';
				serialize(): string;
				readonly pending: readonly PendingAgentDecision[];
		  }
	>;
}
export interface AgentProviderTurnInput {
	readonly model: string;
	readonly instructions: string;
	// audit-allow: no-unknown-type — Tool's context parameter belongs to the agent SDK, which owns execution of this protocol value.
	readonly tools: Tool<unknown>[];
	readonly session: Session;
	readonly prompt: { readonly text: string; readonly images: readonly ConversationImageInput[] };
	readonly maxTurns: number;
	readonly signal: AbortSignal;
	readonly recovery: ReturnType<AgentToolRecovery['configuration']>;
	readonly decisions: readonly AgentRunDecisionRecord[];
	readonly serializedState: string | undefined;
}

export interface AgentExecutionInfrastructure {
	calledTools(session: Session): Promise<readonly string[]>;
	turn(
		provider: Pick<OpenAIProvider, 'getModel' | 'close'>,
		input: AgentProviderTurnInput
	): Promise<AgentProviderTurn>;
	create(settings: WebResearchSettings): Pick<OpenAIProvider, 'getModel' | 'close'>;
	describeImages(
		images: readonly ConversationImageInput[],
		model: string,
		signal: AbortSignal
	): Promise<string[]>;
	// audit-allow: no-unknown-type — Caught provider failures cross to the SDK error reader without controller parsing.
	failure(error: unknown): AgentProviderFailure;
}

export class AgentExecution implements AgentRunner {
	constructor(
		private readonly prompts: AgentPromptPreparation,
		private readonly recovery: AgentToolRecovery,
		private readonly createStream: () => AgentStreamMappings,
		private readonly tools: (input: {
			readonly actor: ActorContext;
			readonly request: RunAgentInput;
			readonly context: AgentRunContext;
			readonly run: AgentRun;
			readonly executor: AgentToolExecutor;
			readonly signal: AbortSignal;
		}) => Promise<AgentToolRegistry>,
		private readonly sessions: AgentExecutionSessions,
		private readonly available: boolean,
		private readonly providers: AgentExecutionInfrastructure,
		private readonly observeTurn: AgentTurnObserver = directTurnObserver
	) {}

	async *execute(input: {
		readonly actor: ActorContext;
		readonly run: AgentRun;
		readonly request: RunAgentInput;
		readonly imageInput: AgentRunImages;
		readonly webSearch: WebResearchSettings;
		readonly context: AgentRunContext;
		readonly decisions?: readonly AgentRunDecisionRecord[];
		readonly signal: AbortSignal;
		readonly toolExecutor: AgentToolExecutor;
	}): AsyncIterable<AgentExecutionUpdate> {
		const {
			actor,
			run,
			request,
			imageInput,
			webSearch,
			context,
			decisions = [],
			signal,
			toolExecutor
		} = input;
		signal.throwIfAborted();
		if (!this.available)
			throw new AgentProviderFailure(
				'Agent chat is disabled until OPENROUTER_API_KEY is configured',
				'CONFIGURATION',
				false
			);
		const provider = this.providers.create(webSearch);
		const preparation = new AbortController();
		const preparationSignal = AbortSignal.any([signal, preparation.signal]);
		try {
			const registry = await this.tools({
				actor,
				request,
				context,
				run,
				executor: toolExecutor,
				signal
			});
			signal.throwIfAborted();
			const session = this.sessions.create(actor, run.conversationId);
			let visionDescriptions: string[] | undefined;
			// The app's own images are described too when the chat model cannot see: a
			// render left out here would simply vanish on a text-only model.
			if (imageInput.kind === 'describe') {
				visionDescriptions = await this.providers.describeImages(
					imageInput.images,
					imageInput.model,
					preparationSignal
				);
			}
			const catalogNames = registry.catalog().map((tool) => tool.name);
			const promoted = this.recovery.promoted(
				await this.providers.calledTools(session),
				run.pendingDecisions.map((decision) => decision.toolName),
				catalogNames
			);
			const tools = registry.agentTools(promoted);
			// Only the tools the model can actually see this generation. The long tail
			// is registered but gated, so passing every registered name here would
			// report an undiscovered tool as already callable.
			const toolRecovery = this.recovery.configuration(
				registry.offeredToolNames(promoted),
				catalogNames
			);
			let outputText = '';
			// Captured by the turn observer before the first update is yielded, so the
			// checkpoint below can hand the next resume the trace this run belongs to.
			let traceparent = run.traceparent;
			const { skills: instructionSkills, ...instructionContext } = context;
			const instructions = this.prompts.instructions(instructionContext, instructionSkills);
			const providers = this.providers;
			const createStream = this.createStream;
			const preparedPrompt = this.prompts.message(
				context,
				request.prompt ?? '',
				imageInput,
				visionDescriptions ?? []
			);
			const runTurn = async function* (): AsyncGenerator<AgentExecutionUpdate> {
				const turn = await providers.turn(provider, {
					model: run.model,
					instructions,
					tools,
					session,
					prompt: preparedPrompt,
					maxTurns: request.maxTurns ?? DEFAULT_AGENT_MAX_TURNS,
					signal,
					recovery: toolRecovery,
					decisions,
					serializedState: run.serializedState
				});
				const { tools: mapper, reasoning: reasoningMapper } = createStream();
				// One parse, at the only place the provider's own events enter the app.
				// Everything below it reads a closed union rather than probing.
				for await (const event of turn.events) {
					const toolEvent = mapper.map(event);
					if (toolEvent) yield { type: 'event', event: toolEvent };
					const reasoningEvent = reasoningMapper.map(event);
					if (reasoningEvent) yield { type: 'event', event: reasoningEvent };
					if (event.type === 'text_delta') {
						outputText += event.text;
						yield { type: 'event', event: { type: 'text_delta', text: event.text } };
					}
				}
				const outcome = await turn.outcome();
				if (outcome.kind === 'approval') {
					const pending = outcome.pending.map((call) => registry.reviewDecision(call));
					yield {
						type: 'approval_checkpoint',
						serializedState: outcome.serialize(),
						...(traceparent ? { traceparent } : {}),
						pendingDecisions: pending,
						sessionItems: await session.snapshot()
					};
					return;
				}

				yield { type: 'completed', sessionItems: await session.snapshot() };
			};
			yield* this.observeTurn(
				{
					input: request.prompt ?? '',
					sessionId: run.conversationId,
					model: run.model,
					userId: actor.userId,
					runId: run.id,
					...(run.traceparent ? { parentTraceparent: run.traceparent } : {}),
					onRoot: (value: string) => {
						traceparent ??= value;
					}
				},
				() => runTurn(),
				() => outputText
			);
		} catch (error) {
			if (signal.aborted) throw error;
			throw this.providers.failure(error);
		} finally {
			preparation.abort();
			await provider.close();
		}
	}
}
