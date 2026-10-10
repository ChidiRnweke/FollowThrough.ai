import { type AgentToolReviewControl } from '$lib/models/agent-tool-reviews';
import type { ActorContext } from '$lib/models/identity';
import { AgentToolReviews } from '$lib/server/adapters/agent/tool-review-session';
import { AgentToolReviewReader } from '$lib/server/adapters/agent/tool-reviews';
import type { NotesController } from '$lib/server/controllers/notes/controller';
import { AgentToolReviewStore } from '$lib/server/stores/agent/tool-reviews';

export const createToolReviews = (
	notes: () => Pick<NotesController, 'prepareAgentReviewedChange' | 'applyAgentReviewedChange'>,
	actor: ActorContext
): AgentToolReviewControl =>
	new AgentToolReviews(notes, actor, new AgentToolReviewStore(), new AgentToolReviewReader());
