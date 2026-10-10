import {
	noteChangeRequestSchema,
	noteChangeReviewSchema,
	type NoteChangeRequest,
	type NoteChangeReview
} from '$lib/models/notes';
import type { AgentPayloadObject } from '$lib/models/agent/payload';
import type { ToolReviewReader } from '$lib/server/controllers/agent/tool-reviews';

export class AgentToolReviewReader implements ToolReviewReader {
	review(content: string): NoteChangeReview {
		return noteChangeReviewSchema.parse(JSON.parse(content));
	}
	request(args: AgentPayloadObject, kind: 'replace' | 'patch'): NoteChangeRequest {
		return noteChangeRequestSchema.parse({ ...args, kind });
	}
}
