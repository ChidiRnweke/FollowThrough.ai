import { z } from 'zod';
import { appContextSnapshotV1Schema } from '$lib/models/workspace';

/** A report and the screen context captured when the user submits it. */
export const feedbackReportSchema = z.object({
	body: z.string().min(1),
	url: z.string(),
	appContext: appContextSnapshotV1Schema
});

export type FeedbackReport = z.infer<typeof feedbackReportSchema>;
