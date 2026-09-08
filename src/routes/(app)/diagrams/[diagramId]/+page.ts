import { error } from '@sveltejs/kit';
import { diagramRecordSchema } from '$lib/models/workspace-records';
import type { PageLoad } from './$types';
export const load: PageLoad = async ({ parent, params }) => {
	const { session } = await parent();
	const diagramId = diagramRecordSchema.options[0].shape.id.parse(params.diagramId);
	const result = await session.resources.open({ type: 'diagrams', id: [diagramId] });
	if (result.kind !== 'ready')
		error(
			result.kind === 'deleted' ? 410 : 503,
			result.kind === 'failure' ? result.message : 'This diagram is not available on this device'
		);
	return { diagramId };
};
