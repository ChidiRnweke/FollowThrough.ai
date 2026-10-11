import type { FeedbackReport } from '$lib/models/feedback';

/** Write-only: feedback has no read path in the app, only the submission the UI feeds it. */
export interface FeedbackRepository {
	create(report: FeedbackReport): Promise<void>;
}
