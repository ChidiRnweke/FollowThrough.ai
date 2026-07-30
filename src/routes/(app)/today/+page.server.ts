import { AppFactory } from '$lib/server/app-factory';
import { todayLocalDate } from '$lib/components/app/labels';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const factory = AppFactory.controllers();
	const view = await factory.workspace().getTodayView(AppFactory.actor(locals), {
		today: todayLocalDate()
	});
	return { view };
};
