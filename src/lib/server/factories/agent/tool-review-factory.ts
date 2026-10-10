import type { ActorContext } from '$lib/models/identity';
import type { NotesController } from '$lib/server/controllers/notes/controller';
import { AgentToolReviewReader } from '$lib/server/adapters/agent/tool-reviews';
import {
	AgentToolReviews,
	type AgentToolReviewControl
} from '$lib/server/controllers/agent/tool-reviews';
import { AgentToolReviewStore } from '$lib/server/stores/agent/tool-reviews';
import { AgentToolPresentationService } from '$lib/server/services/agent/runs/tool-views';

export const createToolReviews = (
	notes: () => Pick<NotesController, 'prepareChange' | 'applyReviewedChange'>,
	actor: ActorContext
): AgentToolReviewControl =>
	new AgentToolReviews(
		notes,
		actor,
		new AgentToolReviewStore(),
		new AgentToolReviewReader(),
		new AgentToolPresentationService()
	);
