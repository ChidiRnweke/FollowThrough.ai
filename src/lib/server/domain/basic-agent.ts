import type { ActorContext, ProvenanceId, RunAgentInput } from '$lib/models';
import type {
	AgentContextBuilder,
	NoteReader,
	ProvenanceRecorder,
	SuggestionCreator
} from '$lib/services';

export class BasicAgent implements AgentContextBuilder {
	constructor(
		private readonly suggestionCreator?: SuggestionCreator,
		private readonly provenanceRecorder?: ProvenanceRecorder,
		private readonly noteReader?: NoteReader
	) {}
	async build(
		actor: ActorContext,
		input: RunAgentInput,
		_run: { provenanceId: ProvenanceId; conversationId?: import('$lib/models').ConversationId }
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
}
