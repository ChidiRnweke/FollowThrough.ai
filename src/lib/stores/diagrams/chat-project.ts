import type { Conversation } from '$lib/models/agent';
import type { NoteId } from '$lib/models/notes';
import type { ProjectId } from '$lib/models/projects';

/** Resolve the immutable project origin of a conversation-backed canvas. */
export const conversationProjectId = (
	conversation: Conversation | undefined,
	notes: readonly { readonly id: NoteId; readonly projectId: ProjectId }[]
): ProjectId | undefined => {
	if (conversation?.contextProjectId) return conversation.contextProjectId;
	if (!conversation?.contextNoteId) return undefined;
	return notes.find((note) => note.id === conversation.contextNoteId)?.projectId;
};
