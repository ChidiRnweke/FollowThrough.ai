import {
	agentToolNameSchema,
	persistedSessionItemSchema,
	sessionJsonObjectSchema,
	storedSessionItemSchema,
	toolNameSchema,
	type FunctionCallResultSessionItem,
	type AgentToolOutcome,
	type PersistedSessionItem,
	type ProviderToolOutput,
	type SessionJsonObject
} from '$lib/models/agent';
import { readToolOutput } from '$lib/server/repositories/agent/tool-failure';
import type { AgentToolName, ToolName } from '$lib/models/agent/tool-catalog';
import type { AgentPayloadObject } from '$lib/models/agent/payload';
import {
	parseProviderToolCall,
	parseProviderStreamEvent,
	providerRejectionContext
} from '$lib/server/infrastructure/agents/provider-events';
import {
	Agent,
	RunState,
	Runner,
	type OpenAIProvider,
	type RunConfig,
	type Session,
	type AgentInputItem,
	type RunToolApprovalItem,
	type Tool
} from '@openai/agents';
import type OpenAI from 'openai';
import type {
	AgentRunDecisionRecord,
	ConversationImageInput,
	PendingAgentDecision,
	ProviderStreamEvent,
	WebResearchSettings
} from '$lib/models/agent';
import { AgentProviderFailure, ValidationError } from '$lib/errors';

/** One model turn in progress: its parsed events, then whether it completed or parked on approvals. */
export interface AgentProviderTurn {
	readonly events: AsyncIterable<ProviderStreamEvent>;
	outcome(): Promise<
		| { readonly kind: 'completed'; readonly sessionItems: readonly PersistedSessionItem[] }
		| {
				readonly kind: 'approval';
				serialize(): string;
				readonly pending: readonly PendingAgentDecision[];
				readonly sessionItems: readonly PersistedSessionItem[];
		  }
	>;
	/** Releases the provider lease; the turn's events end with it. */
	close(): Promise<void>;
}

export interface AgentProviderTurnInput {
	readonly model: string;
	readonly instructions: string;
	readonly webSearch: WebResearchSettings;
	// chisel-ignore narrowing:no-unknown-type -- Tool's context parameter belongs to the agent SDK, which owns execution of this protocol value.
	readonly tools: Tool<unknown>[];
	readonly conversationId: string;
	/** The conversation so far, as stored. */
	readonly history: readonly PersistedSessionItem[];
	readonly prompt: { readonly text: string; readonly images: readonly ConversationImageInput[] };
	readonly maxTurns: number;
	readonly signal: AbortSignal;
	readonly recovery: Pick<RunConfig, 'toolNotFoundBehavior' | 'toolErrorFormatter'>;
	readonly decisions: readonly AgentRunDecisionRecord[];
	readonly serializedState: string | undefined;
}

export interface AgentTurns {
	/** The tool names the model has called so far in this conversation. */
	calledTools(history: readonly PersistedSessionItem[]): readonly string[];
	turn(input: AgentProviderTurnInput): Promise<AgentProviderTurn>;
	/** The agent tool a provider event names, or absent for a name this agent does not offer. */
	toolName(name: string): AgentToolName | undefined;
	/** Whether a provider-reported tool output succeeded or carries the tool's own failure. */
	toolOutcome(output: ProviderToolOutput): AgentToolOutcome;
	describeImages(
		images: readonly ConversationImageInput[],
		model: string,
		signal: AbortSignal
	): Promise<string[]>;
	// chisel-ignore narrowing:no-unknown-type -- a caught provider failure is classified here, where the provider's error shapes are known.
	failure(error: unknown): AgentProviderFailure;
}

export interface AgentTurnDependencies {
	/** The agents SDK model provider for one turn, configured for the run's web research. */
	readonly models: (settings: WebResearchSettings) => Pick<OpenAIProvider, 'getModel' | 'close'>;
	readonly images: Pick<OpenAI, 'chat'>;
}

/** Runs agent turns through the OpenAI agents SDK against the injected model provider. */
export class AgentTurnService implements AgentTurns {
	constructor(private readonly dependencies: AgentTurnDependencies) {}

	calledTools(history: readonly PersistedSessionItem[]): readonly string[] {
		return history.flatMap((item) => (item.type === 'function_call' ? [item.name] : []));
	}

	async describeImages(
		images: readonly ConversationImageInput[],
		model: string,
		signal: AbortSignal
	): Promise<string[]> {
		return Promise.all(
			images.map(async (image) => {
				const response = await this.dependencies.images.chat.completions.create(
					{
						model,
						messages: [
							{
								role: 'user',
								content: [
									{ type: 'text', text: 'Describe this image precisely for another assistant.' },
									{ type: 'image_url', image_url: { url: image.dataUrl } }
								]
							}
						]
					},
					{ signal }
				);
				const description = response.choices[0]?.message.content?.trim();
				if (!description) throw new Error('Image description provider returned no usable text');
				return description;
			})
		);
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

	// chisel-ignore narrowing:no-unknown-type -- a caught provider failure is classified here, where the provider's error shapes are known.
	failure(error: unknown): AgentProviderFailure {
		if (error instanceof AgentProviderFailure) return error;
		return new AgentProviderFailure(
			`${error instanceof Error ? error.message : String(error)}${providerRejectionContext(error)}`,
			providerErrorCode(error) ?? 'EXTERNAL_SERVICE',
			isRetryable(error),
			{ cause: error }
		);
	}

	async turn(input: AgentProviderTurnInput): Promise<AgentProviderTurn> {
		const provider = this.dependencies.models(input.webSearch);
		try {
			return await this.start(provider, input);
		} catch (error) {
			await provider.close();
			throw error;
		}
	}

	private async start(
		provider: Pick<OpenAIProvider, 'getModel' | 'close'>,
		input: AgentProviderTurnInput
	): Promise<AgentProviderTurn> {
		const agent = new Agent({
			name: 'FollowThrough Workbench Agent',
			model: input.model,
			instructions: input.instructions,
			tools: input.tools
		});
		const runner = new Runner({ modelProvider: provider, traceIncludeSensitiveData: true });
		const session = new ReplaySession(input.conversationId, input.history);
		let state: RunState<unknown, typeof agent> | undefined;
		if (input.decisions.length > 0 && input.serializedState) {
			state = await RunState.fromString(agent, input.serializedState);
			// Resumed SDK agent spans were never started; discard the placeholder so the resumed turn opens a real span.
			state._currentAgentSpan = undefined;
			const interruptions = state.getInterruptions();
			let applied = 0;
			for (const decision of input.decisions) {
				const pending = interruptions.find((item) => parkedCall(item).callId === decision.callId);
				if (!pending) continue;
				applied += 1;
				if (decision.decision === 'approve') state.approve(pending);
				else
					state.reject(pending, {
						message: decision.message ?? 'The user rejected this action. Recover without it.'
					});
			}
			if (applied === 0) throw new ValidationError('The pending approval could not be resumed');
		}
		const initial: string | AgentInputItem[] = input.prompt.images.length
			? [
					{
						role: 'user',
						content: [
							{ type: 'input_text', text: input.prompt.text },
							...input.prompt.images.map((image) => ({
								type: 'input_image' as const,
								image: image.dataUrl
							}))
						]
					}
				]
			: input.prompt.text;
		const stream = await runner.run(agent, state ?? initial, {
			stream: true,
			session,
			maxTurns: input.maxTurns,
			signal: input.signal,
			...input.recovery
		});
		return {
			close: () => provider.close(),
			events: (async function* () {
				for await (const event of stream) yield parseProviderStreamEvent(event);
			})(),
			outcome: async () => {
				await stream.completed;
				if (stream.interruptions.length > 0) {
					// The resume starts a new agent span; end the parked one before publishing its checkpoint.
					stream.state._currentAgentSpan?.end();
					const pending = stream.interruptions.map((item) => {
						const call = parkedCall(item);
						return { callId: call.callId, toolName: call.name, arguments: call.arguments };
					});
					return {
						kind: 'approval',
						serialize: () => stream.state.toString(),
						pending,
						sessionItems: session.items
					};
				}
				return { kind: 'completed', sessionItems: session.items };
			}
		};
	}
}

// chisel-ignore narrowing:no-unknown-type -- reads the code off a caught provider failure, whose shape the SDK does not type.
const providerErrorCode = (error: unknown): string | undefined => {
	if (typeof error !== 'object' || error === null) return undefined;
	if ('code' in error && typeof error.code === 'string') return error.code;
	if ('status' in error && typeof error.status === 'number') return String(error.status);
	return undefined;
};

// chisel-ignore narrowing:no-unknown-type -- reads the status off a caught provider failure, whose shape the SDK does not type.
const isRetryable = (error: unknown): boolean => {
	if (typeof error !== 'object' || error === null) return false;
	if (!('status' in error) || typeof error.status !== 'number') return false;
	const { status } = error;
	return status === 408 || status === 409 || status === 429 || status >= 500;
};

const unidentifiedCall = (name: string) =>
	new AgentProviderFailure(
		`The provider opened a call to "${name}" without an identifier`,
		'UNIDENTIFIED_TOOL_CALL',
		false
	);
const parkedCall = (
	item: RunToolApprovalItem
): {
	readonly callId: string;
	readonly name: ToolName;
	readonly arguments: AgentPayloadObject;
} => {
	const call = parseProviderToolCall(item);
	if (!call)
		throw new AgentProviderFailure(
			'The provider parked a run on a tool call this run cannot read',
			'UNREADABLE_PARKED_CALL',
			false
		);
	const { callId } = call;
	if (callId === undefined) throw unidentifiedCall(call.name);
	const name = toolNameSchema.safeParse(call.name).data;
	if (name === undefined)
		throw new AgentProviderFailure(
			`The provider parked a run on "${call.name}", which is not a tool this agent offers`,
			'UNKNOWN_PARKED_CALL',
			false
		);
	return { callId, name, arguments: call.arguments.value };
};

const isDiagramWrite = (name: string): boolean =>
	name === 'create_diagram' || name === 'edit_diagram';
const DIAGRAM_SOURCE_PLACEHOLDER =
	'[source omitted from history; call read_canvas_diagram to read the current diagram]';

const outputText = (item: FunctionCallResultSessionItem): string | undefined => {
	const { output } = item;
	if (typeof output === 'string') return output;
	return 'type' in output ? output.text : undefined;
};

const jsonObject = (json: string): SessionJsonObject | undefined =>
	sessionJsonObjectSchema.safeParse(JSON.parse(json)).data;

/**
 * What the model sees of the conversation: a diagram write keeps its arguments and result,
 * but the full source is replaced by a pointer to `read_canvas_diagram`, unless the write
 * failed and its source is the only record of what the model tried.
 */
const replayView = (items: readonly PersistedSessionItem[]): readonly PersistedSessionItem[] => {
	const failed = new Set(
		items.flatMap((item) => {
			if (item.type !== 'function_call_result' || !isDiagramWrite(item.name)) return [];
			const text = outputText(item);
			return text !== undefined && readToolOutput(text).kind !== 'success' ? [item.callId] : [];
		})
	);
	return items.map((item) => {
		if (item.type !== 'function_call' && item.type !== 'function_call_result') return item;
		if (!isDiagramWrite(item.name) || failed.has(item.callId)) return item;
		const json = item.type === 'function_call' ? item.arguments : outputText(item);
		const parsed = json === undefined ? undefined : jsonObject(json);
		if (!parsed || typeof parsed.source !== 'string') return item;
		const elided = JSON.stringify({ ...parsed, source: DIAGRAM_SOURCE_PLACEHOLDER });
		if (item.type === 'function_call') return { ...item, arguments: elided };
		if (typeof item.output === 'string') return { ...item, output: elided };
		return 'type' in item.output ? { ...item, output: { ...item.output, text: elided } } : item;
	});
};

/** The SDK session for one turn: the stored conversation plus what the turn adds to it. */
class ReplaySession implements Session {
	private current: readonly PersistedSessionItem[];
	private presented: readonly PersistedSessionItem[] | undefined;

	constructor(
		private readonly conversationId: string,
		history: readonly PersistedSessionItem[]
	) {
		this.current = history;
	}

	get items(): readonly PersistedSessionItem[] {
		return this.current;
	}

	async getSessionId(): Promise<string> {
		return this.conversationId;
	}

	async getItems(limit?: number): Promise<AgentInputItem[]> {
		this.presented ??= replayView(this.current);
		const shown = limit === undefined ? this.presented : this.presented.slice(-limit);
		return shown.map((item) => storedSessionItemSchema.parse(item) as AgentInputItem);
	}

	async addItems(items: AgentInputItem[]): Promise<void> {
		this.replace([...this.current, ...items.map((item) => persistedSessionItemSchema.parse(item))]);
	}

	async popItem(): Promise<AgentInputItem | undefined> {
		const item = this.current.at(-1);
		this.replace(this.current.slice(0, -1));
		return item && (storedSessionItemSchema.parse(item) as AgentInputItem);
	}

	async clearSession(): Promise<void> {
		this.replace([]);
	}

	private replace(items: readonly PersistedSessionItem[]): void {
		this.current = items;
		this.presented = undefined;
	}
}
