import type { ActorContext } from '$lib/models/identity';
import type { AppContextSnapshotV1 } from '$lib/models/workspace';

export interface FeedbackReport {
	readonly body: string;
	readonly url: string;
	readonly appContext: AppContextSnapshotV1;
}

/** Write-only: feedback has no read path in the app, only the submission the UI feeds it. */
export interface FeedbackRepository {
	create(actor: ActorContext, report: FeedbackReport): Promise<void>;
}
