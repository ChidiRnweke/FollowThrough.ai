import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { DomainError } from '$lib/models';
import { AppFactory } from '$lib/server/app-factory';
import type { RequestHandler } from './$types';

const inputSchema = z.object({
	noteId: z.string().uuid(),
	source: z.string().trim().min(1).max(50_000),
	instruction: z.string().trim().min(1).max(2_000)
});

export const POST: RequestHandler = async ({ request }) => {
	try {
		const input = inputSchema.parse(await request.json());
		return json(
			await AppFactory.controllerFactory()
				.diagrams()
				.reviseInlineMermaid(AppFactory.actor(), input as never)
		);
	} catch (error) {
		if (error instanceof z.ZodError)
			return json(
				{ message: error.issues[0]?.message ?? 'Invalid revision request.' },
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
