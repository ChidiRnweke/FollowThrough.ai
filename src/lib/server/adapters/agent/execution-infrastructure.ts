import { toolNameSchema, type ProviderToolCall } from '$lib/models/agent';
import type { ToolName } from '$lib/models/agent/tool-catalog';
import { parseProviderToolCall, parseProviderStreamEvent } from './provider-events';
import {
	Agent,
	OpenAIProvider,
	RunState,
	Runner,
	type Session,
	type AgentInputItem
} from '@openai/agents';
import OpenAI from 'openai';
import type { ConversationImageInput, WebResearchSettings } from '$lib/models/agent';
import { AgentProviderFailure, ValidationError } from '$lib/errors';
import type {
	AgentExecutionInfrastructure,
	AgentProviderTurn,
	AgentProviderTurnInput
} from '$lib/server/controllers/agent/execution';
import { withWebResearch } from './web-research-transport';
import { withReasoning } from './reasoning-transport';
export class AgentSdkInfrastructure implements AgentExecutionInfrastructure {
	async calledTools(session: Session): Promise<readonly string[]> {
		return (await session.getItems()).flatMap((item) =>
			item.type === 'function_call' ? [item.name] : []
		);
	}

	constructor(
		private readonly apiKey = process.env.OPENROUTER_API_KEY,
		private readonly baseURL = process.env.OPENROUTER_BASE_URL ?? 'https://openrouter.ai/api/v1',
		private readonly appURL = process.env.ORIGIN ?? 'http://localhost:5173',
		private readonly providerFetch?: typeof globalThis.fetch,
		private readonly override?: (
			settings: WebResearchSettings
		) => Pick<OpenAIProvider, 'getModel' | 'close'>
	) {}
	create(settings: WebResearchSettings): Pick<OpenAIProvider, 'getModel' | 'close'> {
		return this.override ? this.override(settings) : this.provider(settings);
	}
	async describeImages(
		images: readonly ConversationImageInput[],
		model: string,
		signal: AbortSignal
	): Promise<string[]> {
		const client = new OpenAI({
			apiKey: this.apiKey,
			baseURL: this.baseURL,
			fetch: this.providerFetch,
			timeout: Number(process.env.PROVIDER_REQUEST_TIMEOUT_MS ?? 120_000)
		});
		return Promise.all(
			images.map(async (image) => {
				const response = await client.chat.completions.create(
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
	failure(error: unknown): AgentProviderFailure {
		return new AgentProviderFailure(
			error instanceof Error ? error.message : String(error),
			this.providerErrorCode(error) ?? 'EXTERNAL_SERVICE',
			this.isRetryable(error),
			{ cause: error }
		);
	}
	private provider(webSearch: WebResearchSettings): OpenAIProvider {
		const client = new OpenAI({
			apiKey: this.apiKey,
			baseURL: this.baseURL,
			timeout: Number(process.env.PROVIDER_REQUEST_TIMEOUT_MS ?? 120_000),
			// Two OpenRouter-only body fields, both added at the transport because the
			// agents SDK has nowhere to put them. Reasoning is what makes the model's
			// thinking arrive as deltas rather than one block per generation.
			fetch: withReasoning(withWebResearch(this.providerFetch ?? globalThis.fetch, webSearch)),
			defaultHeaders: {
				'HTTP-Referer': this.appURL,
				'X-OpenRouter-Title': 'FollowThrough'
			}
		});
		return new OpenAIProvider({
			openAIClient: client,
			useResponses: false,
			strictFeatureValidation: true
		});
	}
	private providerErrorCode(error: unknown): string | undefined {
		if (typeof error !== 'object' || error === null) return undefined;
		if ('code' in error && typeof error.code === 'string') return error.code;
		if ('status' in error && typeof error.status === 'number') return String(error.status);
		return undefined;
	}
	private isRetryable(error: unknown): boolean {
		if (typeof error !== 'object' || error === null) return false;
		if (!('status' in error) || typeof error.status !== 'number') return false;
		const { status } = error;
		return status === 408 || status === 409 || status === 429 || status >= 500;
	}

	async turn(
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
			session: input.session,
			maxTurns: input.maxTurns,
			signal: input.signal,
			...input.recovery
		});
		return {
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
					return { kind: 'approval', serialize: () => stream.state.toString(), pending };
				}
				return { kind: 'completed' };
			}
		};
	}
}

const unidentifiedCall = (name: string) =>
	new AgentProviderFailure(
		`The provider opened a call to "${name}" without an identifier`,
		'UNIDENTIFIED_TOOL_CALL',
		false
	);
const parkedCall = (
	item: unknown
): ProviderToolCall & { readonly callId: string; readonly name: ToolName } => {
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
	return { ...call, callId, name };
};
