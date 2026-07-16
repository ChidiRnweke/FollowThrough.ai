import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { DomainError } from '$lib/models';
import { AppFactory } from '$lib/server/app-factory';
import type { RequestHandler } from './$types';

const inputSchema = z.object({
	selection: z
		.object({
			noteId: z.string().uuid(),
			revision: z.number().int().positive(),
			from: z.number().int().nonnegative(),
			to: z.number().int().nonnegative(),
			text: z.string().min(1)
		})
		.refine((selection) => selection.to >= selection.from, 'Selection end must follow its start.'),
	instruction: z.string().trim().min(1).optional()
});

export const POST: RequestHandler = async ({ request }) => {
	try {
		const input = inputSchema.parse(await request.json());
		return json(
			await AppFactory.controllerFactory()
				.diagrams()
				.generateMermaid(AppFactory.actor(), input as never)
		);
	} catch (error) {
		if (error instanceof z.ZodError)
			return json(
				{ message: error.issues[0]?.message ?? 'Invalid diagram request.' },
				{ status: 400 }
			);
		if (error instanceof DomainError)
			return json(
				{ code: error.code, message: error.message },
				{ status: error.code === 'EXTERNAL_SERVICE' ? 502 : 400 }
			);
		throw error;
	}
};
