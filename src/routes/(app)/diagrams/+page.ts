import { requireRouteResource, routeResourceId } from '$lib/client/sync/route-access';
import { redirect } from '@sveltejs/kit';
import { projectRecordSchema } from '$lib/models/workspace-records';
import type { PageLoad } from './$types';

// Existing gallery presentation size; resource synchronization is never paginated here.
const PAGE_SIZE = 12;
export const load: PageLoad = async ({ parent, url }) => {
	const { session } = await parent();
	const selection = url.searchParams.get('projectId');
	const selectedProjectId = selection
		? routeResourceId(projectRecordSchema.shape.id, selection)
		: null;
	const query = url.searchParams.get('q')?.trim() ?? '';
	const requested = Number(url.searchParams.get('page') ?? '1');
	let page = Number.isInteger(requested) && requested > 0 ? requested : 1;
	if (selectedProjectId) {
		const opened = await session.resources.open({ type: 'projects', id: [selectedProjectId] });
		requireRouteResource(opened, session.resources.online, 'project');
		await session.resources.prepare(['diagrams']);
		const total = session.resources.views.diagrams(selectedProjectId, query).length;
		page = Math.min(page, Math.max(1, Math.ceil(total / PAGE_SIZE)));
		const params = new URLSearchParams({ projectId: selectedProjectId });
		if (query) params.set('q', query);
		if (page > 1) params.set('page', String(page));
		const canonical = `/diagrams?${params}`;
		if (`${url.pathname}${url.search}` !== canonical) redirect(303, canonical);
	}
	return { selectedProjectId, query, page, pageSize: PAGE_SIZE };
};
