import type { DiagramId, NoteId } from '$lib/models';
import { AppFactory } from '$lib/server/app-factory';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const diagram = await AppFactory.controllerFactory()
		.diagrams()
		.getDrawio(AppFactory.actor(), {
			noteId: params.id as NoteId,
			diagramId: params.diagramId as DiagramId
		});
	return { diagram };
};
