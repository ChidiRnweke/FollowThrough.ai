import type { NoteId } from '$lib/models/notes';
import type { ProjectId } from '$lib/models/projects';
import { chatHandoffSchema, type ChatHandoff } from '$lib/models/chat';

const KEY = 'followthrough.chat.handoff';

const parseChatHandoff = (value: string): ChatHandoff => {
	const parsed = chatHandoffSchema.parse(JSON.parse(value));
	return {
		prompt: parsed.prompt,
		...(parsed.noteId ? { noteId: parsed.noteId as NoteId } : {}),
		...(parsed.projectId ? { projectId: parsed.projectId as ProjectId } : {}),
		...(parsed.selection
			? {
					selection: {
						noteId: parsed.selection.noteId as NoteId,
						revision: parsed.selection.revision,
						from: parsed.selection.from,
						to: parsed.selection.to,
						text: parsed.selection.text
					}
				}
			: {}),
		...(parsed.requestedSkillNames ? { requestedSkillNames: parsed.requestedSkillNames } : {})
	};
};

export function stageChatHandoff(handoff: ChatHandoff, storage: Storage = sessionStorage): void {
	storage.setItem(KEY, JSON.stringify(handoff));
}

export function consumeChatHandoff(storage: Storage = sessionStorage): ChatHandoff | undefined {
	const value = storage.getItem(KEY);
	if (!value) return undefined;
	storage.removeItem(KEY);
	return parseChatHandoff(value);
}
