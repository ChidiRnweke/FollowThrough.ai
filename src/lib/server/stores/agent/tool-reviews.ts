import type { ToolReviewState } from '$lib/models/agent-tool-reviews';
import type { NoteChangeReview } from '$lib/models/notes';

/** Prepared changes belong to one execution, including its restored checkpoint. */
export class AgentToolReviewStore implements ToolReviewState {
	private readonly notes = new Map<string, NoteChangeReview>();
	get(callId: string): NoteChangeReview | undefined {
		return this.notes.get(callId);
	}
	save(callId: string, review: NoteChangeReview): void {
		this.notes.set(callId, review);
	}
}
