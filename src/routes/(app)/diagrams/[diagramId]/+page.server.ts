import { error } from '@sveltejs/kit';
import type { DiagramId } from '$lib/models/diagrams';
import { NotFoundError } from '$lib/errors';
import { AppFactory } from '$lib/server/factories/app-factory';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	const diagramId = params.diagramId as DiagramId;
	try {
		// Handed to the canvas so the first paint is the diagram rather than a
		// loading line; the canvas still owns the query, so a save refreshes it
		// without re-running the route.
		const diagram = await AppFactory.controllers()
			.diagramStudio()
			.getProjectDiagram(AppFactory.actor(locals), { diagramId });
		return { diagramId, diagram };
	} catch (cause) {
		if (cause instanceof NotFoundError) error(404, 'Diagram not found');
		throw cause;
	}
};
