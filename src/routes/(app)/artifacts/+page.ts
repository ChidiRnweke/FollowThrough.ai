import { error, redirect } from '@sveltejs/kit';
import { projectRecordSchema } from '$lib/models/workspace-records';
import type { PageLoad } from './$types';

// Existing gallery presentation size; resource synchronization is never paginated here.
const PAGE_SIZE = 10;
export const load: PageLoad = async ({ parent, url }) => {
	const { session } = await parent();
	const selection = url.searchParams.get('projectId');
	const selectedProjectId = selection ? projectRecordSchema.shape.id.parse(selection) : null;
	const query = url.searchParams.get('q')?.trim() ?? '';
	const requested = Number(url.searchParams.get('page') ?? '1');
	let page = Number.isInteger(requested) && requested > 0 ? requested : 1;
	if (selectedProjectId) {
		const opened = await session.resources.open({ type: 'projects', id: [selectedProjectId] });
		if (opened.kind !== 'ready')
			error(
				opened.kind === 'deleted' ? 410 : 503,
				opened.kind === 'failure' ? opened.message : 'This project is not available on this device'
			);
		await session.resources.prepare(['artifacts', 'project_templates', 'notes']);
		const total = session.resources.views.artifacts(selectedProjectId, query).length;
		page = Math.min(page, Math.max(1, Math.ceil(total / PAGE_SIZE)));
		const params = new URLSearchParams({ projectId: selectedProjectId });
		if (query) params.set('q', query);
		if (page > 1) params.set('page', String(page));
		const canonical = `/artifacts?${params}`;
		if (`${url.pathname}${url.search}` !== canonical) redirect(303, canonical);
	}
	return { selectedProjectId, query, page, pageSize: PAGE_SIZE };
};
