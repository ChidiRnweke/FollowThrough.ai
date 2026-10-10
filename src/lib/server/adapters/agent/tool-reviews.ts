import type { ToolReviewReader } from '$lib/models/agent-tool-reviews';
import type { AgentPayloadObject } from '$lib/models/agent/payload';
import {
	noteChangeRequestSchema,
	noteChangeReviewSchema,
	type NoteChangeRequest,
	type NoteChangeReview
} from '$lib/models/notes';

export class AgentToolReviewReader implements ToolReviewReader {
	review(content: string): NoteChangeReview {
		return noteChangeReviewSchema.parse(JSON.parse(content));
	}
	request(args: AgentPayloadObject, kind: 'replace' | 'patch'): NoteChangeRequest {
		return noteChangeRequestSchema.parse({ ...args, kind });
	}
}
