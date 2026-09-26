import type { ActorContext } from '$lib/models/identity';
import type { FeedbackReport } from '$lib/models/feedback';

/** Write-only: feedback has no read path in the app, only the submission the UI feeds it. */
export interface FeedbackRepository {
	create(actor: ActorContext, report: FeedbackReport): Promise<void>;
}
