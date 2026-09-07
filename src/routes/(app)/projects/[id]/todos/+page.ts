import { error } from '@sveltejs/kit';
import { readTodoListFilter } from '$lib/client/todos/list-filter';
import { projectRecordSchema } from '$lib/models/workspace-records';
import type { PageLoad } from './$types';
export const load: PageLoad = async ({ parent, params, url }) => {
	const projectId = projectRecordSchema.shape.id.parse(params.id);
	const filter = { ...readTodoListFilter(url.searchParams), projectId };
	const { session } = await parent();
	const opened = await session.resources.open({ type: 'projects', id: [projectId] });
	if (opened.kind !== 'ready')
		error(
			opened.kind === 'deleted' ? 410 : 503,
			opened.kind === 'failure' ? opened.message : 'This project is not available on this device'
		);
	await session.resources.prepare(['todos', 'source_anchors', 'provenance']);
	return { projectId, filter, view: url.searchParams.get('view') ?? 'board' };
};
