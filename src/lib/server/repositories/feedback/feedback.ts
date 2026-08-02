import type { ActorContext } from '$lib/models/identity';

export interface FeedbackReport {
	readonly body: string;
	readonly url: string;
	readonly appContext: Readonly<Record<string, unknown>>;
}

/** Write-only: feedback has no read path in the app, only the submission the UI feeds it. */
export interface FeedbackRepository {
	create(actor: ActorContext, report: FeedbackReport): Promise<void>;
}
