import { todayLocalDate } from '$lib/client/todos/local-date';
import { error } from '@sveltejs/kit';
import { projectRecordSchema } from '$lib/models/workspace-records';
import type { PageLoad } from './$types';
export const load: PageLoad = async ({ parent, params }) => {
	const projectId = projectRecordSchema.shape.id.parse(params.id);
	const { session } = await parent();
	const opened = await session.resources.open({ type: 'projects', id: [projectId] });
	if (opened.kind !== 'ready')
		error(
			opened.kind === 'deleted' ? 410 : 503,
			opened.kind === 'failure' ? opened.message : 'This project is not available on this device'
		);
	await session.resources.prepare([
		'todos',
		'memory_entries',
		'artifacts',
		'diagrams',
		'attachments',
		'attachment_versions',
		'user_preferences'
	]);
	return {
		projectId,
		today: todayLocalDate(),
		renderedAt: new Date().toISOString(),
		tipSeed: Math.floor(Math.random() * 1000)
	};
};
