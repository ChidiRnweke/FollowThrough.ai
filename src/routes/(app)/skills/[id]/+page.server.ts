import type { NoteId } from '$lib/models';
import { AppFactory } from '$lib/server/app-factory';
import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const factory = AppFactory.controllerFactory();
	const noteId = params.id as NoteId;
	const [view, versions] = await Promise.all([
		factory.skills().get(AppFactory.actor(), { noteId }),
		factory.skills().listVersions(AppFactory.actor(), { noteId })
	]);
	return { view, versions };
};

export const actions: Actions = {
	restore: async ({ params, request }) => {
		const revision = Number((await request.formData()).get('revision'));
		if (!Number.isInteger(revision) || revision < 1)
			return fail(400, { error: 'A valid revision is required' });
		const factory = AppFactory.controllerFactory();
		await factory.skills().restoreVersion(AppFactory.actor(), {
			noteId: params.id as NoteId,
			revision
		});
		return { restored: revision };
	}
};
