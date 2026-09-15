import type { ProjectId } from '$lib/models/projects';
import { SvelteMap } from 'svelte/reactivity';
import type { ChatSessionKey } from '$lib/stores/agent/chat.svelte';

/**
 * The project a studio draft belongs to, until it is kept.
 *
 * A draft has no diagram and no conversation yet, so there is nothing durable to
 * hang the project on — the user simply started it from a project's gallery. This
 * remembers that until promotion turns it into a real row.
 */
const chatProjects = new SvelteMap<ChatSessionKey, ProjectId>();

export class DiagramRegistry {
	/** Records the project a newly started draft belongs to. */
	useProject(sessionKey: ChatSessionKey, projectId: ProjectId): void {
		chatProjects.set(sessionKey, projectId);
	}

	/** The project a draft belongs to, if this session started one. */
	projectFor(sessionKey: ChatSessionKey): ProjectId | undefined {
		return chatProjects.get(sessionKey);
	}

	/** Forgets a draft once it has been kept or abandoned. */
	forgetProject(sessionKey: ChatSessionKey): void {
		chatProjects.delete(sessionKey);
	}
}

export const diagramRegistry = new DiagramRegistry();
