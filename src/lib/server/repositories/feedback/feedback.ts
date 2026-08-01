import type { ActorContext } from '$lib/models/identity';

export interface FeedbackReport {
	readonly body: string;
	readonly url: string;
	readonly appContext: Readonly<Record<string, unknown>>;
}

export interface FeedbackRepository {
	create(actor: ActorContext, report: FeedbackReport): Promise<void>;
}
