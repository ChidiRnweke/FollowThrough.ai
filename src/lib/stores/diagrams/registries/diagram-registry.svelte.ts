import type { DiagramId, DiagramKind } from '$lib/models/diagrams';
import type { ProjectId } from '$lib/models/projects';
import { SvelteMap } from 'svelte/reactivity';
import type { ChatSessionKey } from '$lib/stores/agent/chat.svelte';
import { Registry } from '$lib/stores/notes/registries/registry';

/**
 * What the shell knows about an open diagram.
 *
 * A diagram tab, unlike a note tab, has nothing in `ShellContext` to look itself
 * up in: the note tree carries notes, and adding every project's diagrams to the
 * shell payload would cost every page load to serve the tab strip. So the pane
 * that loads a diagram publishes what the chrome needs here, and the tab strip
 * and the workbench read it back without holding a reference of their own.
 */
/**
 * What a loaded diagram tells the chrome about itself.
 *
 * `title` is the one honest optional: a diagram row may have no title, and the
 * chrome supplies its own word for that. `projectId` and `kind` are read off a
 * row that exists, so they are not.
 */
export interface DiagramDescription {
	readonly title?: string;
	readonly projectId: ProjectId;
	readonly kind: DiagramKind;
}

export class DiagramStore {
	constructor(readonly diagramId: DiagramId) {}

	/**
	 * What the pane published, or nothing until it has loaded.
	 *
	 * One field, because there is one fact. Three separate optionals let a reader
	 * ask for the project of a diagram whose kind it had not established, and made
	 * "not loaded yet" indistinguishable from "loaded, and untitled" — both of
	 * which came out of `?.title` as the same `undefined` and collapsed into one
	 * `?? 'Untitled diagram'`. `describe` only ever set all three together.
	 */
	description = $state<DiagramDescription | undefined>(undefined);

	/** Called by the pane once its diagram has loaded, and after a rename. */
	describe(description: DiagramDescription): void {
		this.description = description;
	}
}

const registry = new Registry<DiagramId, DiagramStore>((id) => new DiagramStore(id));

/**
 * The project a studio draft belongs to, until it is kept.
 *
 * A draft has no diagram and no conversation yet, so there is nothing durable to
 * hang the project on — the user simply started it from a project's gallery. This
 * remembers that until promotion turns it into a real row.
 */
const draftProjects = new SvelteMap<ChatSessionKey, ProjectId>();

export class DiagramRegistry {
	/** Records the project a newly started draft belongs to. */
	startDraft(sessionKey: ChatSessionKey, projectId: ProjectId): void {
		draftProjects.set(sessionKey, projectId);
	}

	/** The project a draft belongs to, if this session started one. */
	draftProject(sessionKey: ChatSessionKey): ProjectId | undefined {
		return draftProjects.get(sessionKey);
	}

	/** Forgets a draft once it has been kept or abandoned. */
	endDraft(sessionKey: ChatSessionKey): void {
		draftProjects.delete(sessionKey);
	}

	/** Acquires the store for a diagram, bumping its refcount. */
	for(diagramId: DiagramId): DiagramStore {
		return registry.for(diagramId);
	}

	/** Releases one hold; the store is dropped when the last pane closes. */
	release(diagramId: DiagramId): void {
		registry.release(diagramId);
	}

	/**
	 * Reads a diagram without acquiring it. Safe to call from a `$derived` that
	 * re-runs, which `for` is not — it would bump the refcount on every read.
	 */
	peek(diagramId: DiagramId): DiagramStore | undefined {
		return registry.peek(diagramId);
	}
}

export const diagramRegistry = new DiagramRegistry();
