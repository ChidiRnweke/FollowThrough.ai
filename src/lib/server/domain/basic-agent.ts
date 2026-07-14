import type {
	ActorContext,
	AgentEvent,
	ConversationId,
	DecideAgentRunInput,
	ProjectId,
	ProvenanceId,
	RunAgentInput
} from '$lib/models';
import type {
	AgentContextBuilder,
	AgentRunner,
	NoteReader,
	ProvenanceRecorder,
	SuggestionCreator
} from '$lib/services';

export class BasicAgent implements AgentContextBuilder, AgentRunner {
	constructor(
		private readonly suggestionCreator?: SuggestionCreator,
		private readonly provenanceRecorder?: ProvenanceRecorder,
		private readonly noteReader?: NoteReader
	) {}
	async build(
		actor: ActorContext,
		input: RunAgentInput,
		_run: { provenanceId: ProvenanceId }
	): Promise<Readonly<Record<string, unknown>>> {
		void _run;
		const note =
			input.noteId && this.noteReader ? await this.noteReader.get(actor, input.noteId) : undefined;
		return {
			projectId: input.projectId ?? note?.projectId,
			noteId: input.noteId,
			noteTitle: note?.title,
			selection: input.selection
		};
	}
	async *run(
		actor: ActorContext,
		input: RunAgentInput,
		context: Readonly<Record<string, unknown>>
	): AsyncIterable<AgentEvent> {
		if (/search|find|what did/i.test(input.prompt)) {
			const callId = crypto.randomUUID();
			yield { type: 'tool_started', callId, name: 'knowledge_search', arguments: {} };
			yield { type: 'tool_completed', callId, name: 'knowledge_search' };
		}
		yield { type: 'text_delta', text: `I can help with: ${input.prompt}` };
		if (
			/(?:create|add|make).*(?:todo|task)/i.test(input.prompt) &&
			this.suggestionCreator &&
			this.provenanceRecorder &&
			typeof context.projectId === 'string'
		) {
			const provenance = await this.provenanceRecorder.record(actor, {
				producerKind: 'agent',
				producerName: 'Agent',
				pipeline: 'agent',
				metadata: {}
			});
			const suggestion = await this.suggestionCreator.create(actor, {
				kind: 'todo',
				noteId: input.noteId,
				provenanceId: provenance.id,
				payload: {
					projectId: context.projectId as ProjectId,
					title:
						input.prompt
							.replace(/^(?:please\s+)?(?:create|add|make)\s+(?:a\s+)?(?:todo|task)\s*/i, '')
							.trim() || 'Agent task',
					responsibility: 'mine',
					provenanceId: provenance.id
				}
			});
			yield { type: 'suggestion', suggestion };
		}
		yield {
			type: 'completed',
			conversationId: (input.conversationId ?? crypto.randomUUID()) as ConversationId
		};
	}
	async *resume(
		_actor: ActorContext,
		_input: DecideAgentRunInput,
		_context: Readonly<Record<string, unknown>>
	): AsyncIterable<AgentEvent> {
		void _actor;
		void _input;
		void _context;
	}
}
