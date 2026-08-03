import type { ActorContext } from '$lib/models/identity';
import type { Note, NoteId } from '$lib/models/notes';
import type { ProvenanceId } from '$lib/models/provenance';
import type { ConversationId, RunAgentInput } from '$lib/models/agent';
export interface AgentContextBuilder {
	build(
		actor: ActorContext,
		input: RunAgentInput,
		run: {
			provenanceId: ProvenanceId;
			conversationId?: ConversationId;
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
		_run: {
			provenanceId: ProvenanceId;
			conversationId?: ConversationId;
		}
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
