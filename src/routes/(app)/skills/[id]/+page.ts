import { error } from '@sveltejs/kit';
import { noteRecordSchema } from '$lib/models/workspace-records';
import type { PageLoad } from './$types';
export const load: PageLoad = async ({ parent, params }) => {
	const { session } = await parent();
	const noteId = noteRecordSchema.shape.id.parse(params.id);
	const opened = await Promise.all([
		session.resources.open({ type: 'notes', id: [noteId] }),
		session.resources.open({ type: 'skills', id: [noteId] })
	]);
	for (const result of opened)
		if (result.kind !== 'ready')
			error(
				result.kind === 'deleted' ? 410 : 503,
				result.kind === 'failure' ? result.message : 'This skill is not available on this device'
			);
	return { noteId };
};
