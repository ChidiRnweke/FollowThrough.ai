import type { NoteId } from '$lib/models';
import { AppFactory } from '$lib/server/app-factory';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const factory = AppFactory.controllerFactory();
	const view = await factory.skills().get(AppFactory.actor(), { noteId: params.id as NoteId });
	return { view };
};
