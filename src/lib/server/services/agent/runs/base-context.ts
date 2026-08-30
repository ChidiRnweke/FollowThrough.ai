import type { ActorContext } from '$lib/models/identity';
import type { Note, NoteId } from '$lib/models/notes';
import type { ProvenanceId } from '$lib/models/provenance';
import type {
	BaseAgentContextData,
	ContextSelection,
	ConversationId,
	RunAgentInput
} from '$lib/models/agent';
export interface BaseAgentContextBuilder {
	build(
		actor: ActorContext,
		input: RunAgentInput,
		run: { provenanceId: ProvenanceId; conversationId?: ConversationId }
	): Promise<BaseAgentContextData>;
}
interface NoteReader {
	get(actor: ActorContext, noteId: NoteId): Promise<Note>;
}

export class BaseAgentContext implements BaseAgentContextBuilder {
	constructor(private readonly noteReader?: NoteReader) {}
	async build(
		actor: ActorContext,
		input: RunAgentInput,
		_run: { provenanceId: ProvenanceId; conversationId?: ConversationId }
	): Promise<BaseAgentContextData> {
		void _run;
		const note =
			input.noteId && this.noteReader ? await this.noteReader.get(actor, input.noteId) : undefined;
		// One shape for the prompt to read, whichever field the request arrived with. The
		// singular `selection` is deliberately not emitted alongside it: it exists on the input
		// so the selection-bound tools can be offered, and repeating the excerpt here would put
		// the same passage in front of the model twice.
		const pinned = input.selections ?? (input.selection ? [input.selection] : []);
		// Titled only from the note this run already loaded, which is the note the passages
		// almost always came from. Reading a note apiece to name the rest would buy a label the
		// model can fetch itself.
		const selections: ContextSelection[] = pinned.map((selection) =>
			note && selection.noteId === note.id ? { ...selection, title: note.title } : selection
		);
		const projectId = input.projectId ?? note?.projectId;
		return {
			...(projectId ? { projectId } : {}),
			...(input.noteId ? { noteId: input.noteId } : {}),
			...(note ? { noteTitle: note.title } : {}),
			...(selections.length ? { selections } : {})
		};
	}
}
