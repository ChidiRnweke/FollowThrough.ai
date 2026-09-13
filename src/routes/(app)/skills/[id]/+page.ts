import { requireRouteResource, routeResourceId } from '$lib/client/sync/route-access';
import { noteRecordSchema } from '$lib/models/workspace-records';
import type { PageLoad } from './$types';
export const load: PageLoad = async ({ parent, params }) => {
	const { session } = await parent();
	const noteId = routeResourceId(noteRecordSchema.shape.id, params.id);
	const opened = await Promise.all([
		session.resources.open({ type: 'notes', id: [noteId] }),
		session.resources.open({ type: 'skills', id: [noteId] })
	]);
	for (const result of opened) requireRouteResource(result, session.resources.online, 'skill');
	return { noteId };
};
