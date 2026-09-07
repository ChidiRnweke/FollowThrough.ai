import { error } from '@sveltejs/kit';
import { resourceDataSchemas } from '$lib/models/workspace-records';
import type { PageLoad } from './$types';
export const load: PageLoad = async ({ parent, params }) => {
	const { session } = await parent();
	const conversationId = resourceDataSchemas.conversations.shape.id.parse(params.id);
	const opened = await session.resources.open({ type: 'conversations', id: [conversationId] });
	if (opened.kind !== 'ready')
		error(
			opened.kind === 'deleted' ? 410 : 503,
			opened.kind === 'failure' ? opened.message : 'This chat is not available on this device'
		);
	await session.resources.prepare(['messages', 'agent_runs']);
	return { conversationId };
};
