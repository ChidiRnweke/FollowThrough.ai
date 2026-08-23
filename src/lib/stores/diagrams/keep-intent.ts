import type { ConversationId } from '$lib/models/agent';
import type { DiagramId } from '$lib/models/diagrams';
import type { ProjectId } from '$lib/models/projects';

/**
 * What pressing the canvas's one button will actually do.
 *
 * The rule this encodes: an action that is offered must either work or say why it
 * cannot. Both failures it replaces were silent in their own way — a "Replace
 * diagram" button that threw because the diagram had been deleted, and a "Keep
 * diagram" button that returned without a row, a message, or a clue.
 */
export type KeepIntent =
	| { readonly kind: 'replace'; readonly diagramId: DiagramId }
	| {
			readonly kind: 'create';
			readonly projectId: ProjectId;
			readonly conversationId: ConversationId;
	  }
	| { readonly kind: 'blocked'; readonly reason: string };

export interface KeepContext {
	/** The saved diagram this draft was drawn against, if it is a revision. */
	readonly target?: DiagramId;
	/** True once the target has been looked up and is not there any more. */
	readonly targetMissing: boolean;
	readonly projectId?: ProjectId;
	readonly conversationId?: ConversationId;
}

/** Worded as the studio hand-off words it, so the two agree on why. */
const NO_PROJECT = 'Open this chat inside a project to keep the diagram it draws.';
const NO_CONVERSATION = 'Send a message first — a diagram is kept alongside its conversation.';

export const keepIntent = (context: KeepContext): KeepIntent => {
	// A target that is gone falls through to creating rather than failing. The
	// diagram it was drawn against no longer existing says nothing about the
	// diagram on the canvas, which is the user's work and still worth keeping.
	if (context.target && !context.targetMissing)
		return { kind: 'replace', diagramId: context.target };
	if (!context.projectId) return { kind: 'blocked', reason: NO_PROJECT };
	if (!context.conversationId) return { kind: 'blocked', reason: NO_CONVERSATION };
	// Carried on the intent rather than re-read at the call site: the checks that
	// proved they exist are here, and a caller narrowing them again is a caller
	// that can get it wrong.
	return { kind: 'create', projectId: context.projectId, conversationId: context.conversationId };
};

/**
 * The button's words.
 *
 * Derived from the intent rather than chosen beside it, so the button cannot
 * promise a replacement it is not going to perform.
 */
export const keepLabel = (intent: KeepIntent): string =>
	intent.kind === 'replace' ? 'Replace diagram' : 'Keep diagram';
