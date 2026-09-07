import { error } from '@sveltejs/kit';
import { todoRecordSchema } from '$lib/models/workspace-records';
import { safeReturnUrl } from '$lib/client/todos/return-url';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ params, url, parent }) => {
	const todoId = todoRecordSchema.shape.id.parse(params.id);
	const { session } = await parent();
	const opened = await session.resources.open({ type: 'todos', id: [todoId] });
	if (opened.kind !== 'ready')
		error(
			opened.kind === 'deleted' ? 410 : 503,
			opened.kind === 'failure' ? opened.message : 'This todo is not available on this device'
		);
	await session.resources.prepare(['source_anchors', 'provenance']);
	return { todoId, returnTo: safeReturnUrl(url.searchParams.get('returnTo')) };
};
