import type { NoteId } from '$lib/models';
import { noteEtag } from '$lib/models/note-sync';
import { AppFactory } from '$lib/server/app-factory';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	const factory = AppFactory.controllerFactory();
	const noteId = params.id as NoteId;
	const [view, raw] = await Promise.all([
		factory.skills().get(AppFactory.actor(locals), { noteId }),
		factory.skills().serialize(AppFactory.actor(locals), { noteId })
	]);
	return { view, raw, etag: noteEtag(view.skill.note) };
};
