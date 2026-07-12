import {
	Agent,
	OpenAIProvider,
	Runner,
	isOpenAIResponsesRawModelStreamEvent,
	tool,
	webSearchTool
} from '@openai/agents';
import { z } from 'zod';
import type {
	ActorContext,
	AgentEvent,
	ConversationId,
	RunAgentInput,
	Suggestion
} from '$lib/models';
import { ExternalServiceError } from '$lib/models';
import type { AgentRunner, AgentWorkflowToolbox } from '$lib/services';

const noParameters = z.object({});
const diagramParameters = z.object({ instruction: z.string().optional() });

type ToolStreamEvent = {
	readonly type: string;
	readonly name?: string;
	readonly item?: { toJSON(): unknown };
};

export class AgentToolEventMapper {
	private readonly namesByCallId = new Map<string, string>();

	map(event: ToolStreamEvent): AgentEvent | undefined {
		if (event.type !== 'run_item_stream_event') return undefined;
		if (event.name !== 'tool_called' && event.name !== 'tool_output') return undefined;
		const serialized = event.item?.toJSON() as
			{ rawItem?: Record<string, unknown>; type?: string } | undefined;
		const raw = serialized?.rawItem ?? {};
		const callId = String(raw.callId ?? raw.call_id ?? '');
		if (event.name === 'tool_called') {
			const name = String(raw.name ?? raw.type ?? serialized?.type ?? 'tool');
			if (callId) this.namesByCallId.set(callId, name);
			return { type: 'tool_started', name };
		}
		const name = this.namesByCallId.get(callId) ?? String(raw.name ?? raw.type ?? 'tool');
		if (callId) this.namesByCallId.delete(callId);
		return { type: 'tool_completed', name };
	}
}

export class OpenAIAgentRunner implements AgentRunner {
	constructor(
		private readonly toolbox: AgentWorkflowToolbox,
		private readonly fallback: AgentRunner,
		private readonly apiKey = process.env.OPENAI_API_KEY,
		private readonly model = process.env.OPENAI_AGENT_MODEL ?? 'gpt-5.6-terra'
	) {}

	async *run(
		actor: ActorContext,
		input: RunAgentInput,
		context: Readonly<Record<string, unknown>>
	): AsyncIterable<AgentEvent> {
		if (!this.apiKey) {
			yield* this.fallback.run(actor, input, context);
			return;
		}
		const emittedSuggestions: Suggestion[] = [];
		const toolEvents = new AgentToolEventMapper();
		const requireSelection = () => {
			if (!input.selection) throw new Error('This tool requires a current text selection.');
			return input.selection;
		};
		const tools = [
			tool({
				name: 'extract_promises',
				description: 'Extract commitments from the current selection through the tested pipeline.',
				parameters: noParameters,
				execute: async () => {
					const result = await this.toolbox.extractPromises(actor, requireSelection());
					emittedSuggestions.push(...result.suggestions);
					return result;
				}
			}),
			tool({
				name: 'relate_selection',
				description: 'Find semantically related notes for the current selection.',
				parameters: noParameters,
				execute: async () => {
					const result = await this.toolbox.relate(actor, requireSelection());
					emittedSuggestions.push(...result.suggestions);
					return result;
				}
			}),
			tool({
				name: 'find_references',
				description: 'Find ranked web references for the current selection.',
				parameters: noParameters,
				execute: async () => {
					const result = await this.toolbox.reference(actor, requireSelection());
					if (result.outcome === 'found') emittedSuggestions.push(...result.suggestions);
					return result;
				}
			}),
			tool({
				name: 'generate_mermaid_diagram',
				description: 'Generate a Mermaid diagram suggestion from the current selection.',
				parameters: diagramParameters,
				execute: async ({ instruction }) => {
					const result = await this.toolbox.generateDiagram(actor, requireSelection(), instruction);
					emittedSuggestions.push(result.suggestion);
					return result;
				}
			}),
			webSearchTool()
		];
		const provider = new OpenAIProvider({ apiKey: this.apiKey, useResponses: true });
		try {
			const runner = new Runner({ modelProvider: provider });
			const agent = new Agent({
				name: 'Architect Workbench Agent',
				model: this.model,
				instructions:
					'Help with solution architecture work. Use the registered point-solution tools instead of improvising domain mutations. All mutations must remain suggestions for review.',
				tools
			});
			const stream = await runner.run(
				agent,
				`Context: ${JSON.stringify(context)}\n\nUser request: ${input.prompt}`,
				{ stream: true }
			);
			for await (const event of stream) {
				const toolEvent = toolEvents.map(event);
				if (toolEvent) yield toolEvent;
				if (
					isOpenAIResponsesRawModelStreamEvent(event) &&
					event.data.event.type === 'response.output_text.delta'
				) {
					yield { type: 'text_delta', text: event.data.event.delta };
				}
			}
			await stream.completed;
			const uniqueSuggestions = new Map(
				emittedSuggestions.map((suggestion) => [suggestion.id, suggestion])
			);
			for (const suggestion of uniqueSuggestions.values()) yield { type: 'suggestion', suggestion };
			yield {
				type: 'completed',
				conversationId: (input.conversationId ?? crypto.randomUUID()) as ConversationId
			};
		} catch (error) {
			throw new ExternalServiceError('Agent execution failed', {
				cause: error instanceof Error ? error.message : String(error)
			});
		} finally {
			await provider.close();
		}
	}
}
