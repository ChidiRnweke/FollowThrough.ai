import type { NoteId } from '$lib/models';
import { AppFactory } from '$lib/server/app-factory';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const view = await AppFactory.controllerFactory()
		.notes()
		.get(AppFactory.actor(), { noteId: params.id as NoteId });
	return { view };
};
