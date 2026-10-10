import type { AgentExecutionMode, PendingAgentDecision } from '$lib/models/agent';
import type { PreparedAction, ToolPreparation } from '$lib/models/agent-tool-protocol';
import type { AgentPayloadObject } from '$lib/models/agent/payload';
import type { NoteChangeRequest, NoteChangeReview } from '$lib/models/notes';
export interface ToolReviewReader {
	review(content: string): NoteChangeReview;
	request(args: AgentPayloadObject, kind: 'replace' | 'patch'): NoteChangeRequest;
}
export interface AgentToolReviewControl {
	restore(pending: readonly PendingAgentDecision[]): void;
	checkpoint(pending: PendingAgentDecision): PendingAgentDecision;
	prepare(
		name: string,
		requirement: 'ready' | 'approval_required',
		mode: AgentExecutionMode,
		action: PreparedAction,
		callId: string | undefined,
		phase: 'approval' | 'execute'
	): Promise<ToolPreparation>;
}

export type AgentNoteReviewPreparation =
	| {
			readonly kind: 'failure';
			readonly review: NoteChangeReview;
			readonly failure: import('$lib/models/agent/tool-failure').ToolFailure;
	  }
	| { readonly kind: 'ready' | 'approval_required'; readonly review: NoteChangeReview };
export interface AgentNoteReviewRequest {
	readonly request: NoteChangeRequest;
	readonly target: import('$lib/models/notes').NoteChangeTarget;
	readonly mode: AgentExecutionMode;
	readonly phase: 'approval' | 'execute';
	readonly saved?: NoteChangeReview;
}

export interface ToolReviewState {
	get(callId: string): NoteChangeReview | undefined;
	save(callId: string, review: NoteChangeReview): void;
}
/** Protocol routes for tools that carry a serialized note review through approval. */
export const reviewedNoteTools: readonly {
	readonly name: string;
	readonly target: import('$lib/models/notes').NoteChangeTarget;
	readonly kind: 'patch' | 'replace';
}[] = [
	{ name: 'save_note', target: 'authored', kind: 'replace' },
	{ name: 'edit_note', target: 'authored', kind: 'patch' },
	{ name: 'save_skill', target: 'skill', kind: 'replace' },
	{ name: 'edit_skill', target: 'skill', kind: 'patch' }
];
