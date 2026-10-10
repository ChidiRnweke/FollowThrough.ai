import type { ActorContext } from '$lib/models/identity';
import type { PendingAgentDecision } from '$lib/models/agent';
import type { ControllerFactory } from '$lib/server/factories/controller-factory';
import { createToolReviews } from '$lib/server/factories/agent/tool-review-factory';

export const restoredToolReviews = (
	controllers: ControllerFactory,
	actor: ActorContext,
	pending: readonly PendingAgentDecision[]
) => {
	const reviews = createToolReviews(() => controllers.notes(), actor);
	reviews.restore(pending);
	return reviews;
};
