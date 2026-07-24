import { fail, redirect } from '@sveltejs/kit';
import { AppFactory } from '$lib/server/app-factory';
import { todayLocalDate } from '$lib/components/app/labels';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const factory = AppFactory.controllerFactory();
	const view = await factory.workspace().getTodayView(AppFactory.actor(locals), {
		today: todayLocalDate()
	});
	return { view };
};

export const actions: Actions = {
	capture: async ({ request, locals }) => {
		const data = await request.formData();
		const title = String(data.get('title') ?? '').trim();
		if (!title) return fail(400, { message: 'Give the note a title first.' });
		const factory = AppFactory.controllerFactory();
		const { note } = await factory.notes().create(AppFactory.actor(locals), { title });
		redirect(303, `/notes/${note.id}`);
	}
};
