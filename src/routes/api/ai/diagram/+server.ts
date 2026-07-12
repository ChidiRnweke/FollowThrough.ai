import { json } from '@sveltejs/kit';
import type { GenerateMermaidDiagramInput } from '$lib/models';
import { AppFactory } from '$lib/server/app-factory';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	const input = (await request.json()) as GenerateMermaidDiagramInput;
	return json(
		await AppFactory.controllerFactory().diagrams().generateMermaid(AppFactory.actor(), input)
	);
};
