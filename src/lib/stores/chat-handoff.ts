import type { NoteId, ProjectId, TextSelection } from '$lib/models';

const KEY = 'followthrough.chat.handoff';

export interface ChatHandoff {
	readonly prompt: string;
	readonly noteId?: NoteId;
	readonly projectId?: ProjectId;
	readonly selection?: TextSelection;
	readonly requestedSkillNames?: readonly string[];
}

export function stageChatHandoff(handoff: ChatHandoff, storage: Storage = sessionStorage): void {
	storage.setItem(KEY, JSON.stringify(handoff));
}

export function consumeChatHandoff(storage: Storage = sessionStorage): ChatHandoff | undefined {
	const value = storage.getItem(KEY);
	if (!value) return undefined;
	storage.removeItem(KEY);
	try {
		return JSON.parse(value) as ChatHandoff;
	} catch {
		return undefined;
	}
}
