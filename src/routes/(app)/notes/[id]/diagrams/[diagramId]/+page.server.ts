import type { DiagramId } from '$lib/models/diagrams';
import type { NoteId } from '$lib/models/notes';
import { AppFactory } from '$lib/server/app-factory';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	const diagram = await AppFactory.controllers()
		.diagrams()
		.getDrawio(AppFactory.actor(locals), {
			noteId: params.id as NoteId,
			diagramId: params.diagramId as DiagramId
		});
	return { diagram };
};
