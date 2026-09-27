import { z } from 'zod';
import { appContextSnapshotV1Schema } from '$lib/models/workspace';

export const FEEDBACK_BODY_LIMIT = 10_000;

/** A report and the screen context captured when the user submits it. */
export const feedbackReportSchema = z.object({
	body: z.string().min(1).max(FEEDBACK_BODY_LIMIT),
	url: z.string().max(2000),
	appContext: appContextSnapshotV1Schema
});

export type FeedbackReport = z.infer<typeof feedbackReportSchema>;
