import type { ActorContext, Note, NoteId, ProvenanceId, RunAgentInput } from '$lib/models';
export interface AgentContextBuilder {
	build(
		actor: ActorContext,
		input: RunAgentInput,
		run: {
			provenanceId: ProvenanceId;
			conversationId?: import('$lib/models').ConversationId;
		}
	): Promise<Readonly<Record<string, unknown>>>;
}
interface NoteReader {
	get(actor: ActorContext, noteId: NoteId): Promise<Note>;
}

export class BaseAgentContext implements AgentContextBuilder {
	constructor(private readonly noteReader?: NoteReader) {}
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
