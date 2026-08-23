import type { NoteId, TextSelection } from '$lib/models/notes';
import type { ProjectId } from '$lib/models/projects';
import { z } from 'zod';

const KEY = 'followthrough.chat.handoff';

export interface ChatHandoff {
	readonly prompt: string;
	readonly noteId?: NoteId;
	readonly projectId?: ProjectId;
	readonly selection?: TextSelection;
	readonly requestedSkillNames?: readonly string[];
}

const chatHandoffSchema = z.object({
	prompt: z.string(),
	noteId: z.string().min(1).optional(),
	projectId: z.string().min(1).optional(),
	selection: z
		.object({
			noteId: z.string().min(1),
			revision: z.number().int().nonnegative(),
			from: z.number().int().nonnegative(),
			to: z.number().int().nonnegative(),
			text: z.string()
		})
		.optional(),
	requestedSkillNames: z.array(z.string().min(1)).optional()
});

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
