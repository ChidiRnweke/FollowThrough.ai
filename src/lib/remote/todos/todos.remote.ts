import { z } from 'zod';
import { query } from '$app/server';
import { AppFactory } from '$lib/server/factories/app-factory';
import { requestActor } from '$lib/server/factories/request-actor-factory';
import type { ProjectId } from '$lib/models/projects';

const projectId = z
	.string()
	.uuid()
	.transform((value) => value as ProjectId);
/** The board's shareable URL filters; the title search stays client-only, so the PDF
    reflects the server-side filters rather than the search box. */
export const exportBoardPdf = query(
	z.object({
		projectId: projectId.optional(),
		responsibility: z.enum(['mine', 'waiting_on']).optional(),
		category: z.string().trim().max(100).optional()
	}),
	async (input) => {
		return AppFactory.controllers().todos().exportBoardPdf(requestActor(), input);
	}
);
