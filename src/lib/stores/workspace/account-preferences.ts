import type { DateTime } from '$lib/models/workspace';
import { workspaceSession } from './session.svelte';

/** Each form keeps its own observed base; the shared draft owns availability and submission. */
export const openPreferenceDraft = async <K extends 'agent_preferences' | 'user_preferences'>(
	type: K
) => {
	const session = await workspaceSession.start();
	const draft = session.resources.draft({ type, id: [session.bootstrap.accountId] });
	const timestamp = new Date().toISOString() as DateTime;
	const common = { userId: session.shell.user.id, createdAt: timestamp, updatedAt: timestamp };
	const opened = await draft.readOrCreate(
		type === 'agent_preferences'
			? {
					type: 'agent_preferences',
					value: { ...common, executionMode: 'approval_required', inlineSuggestionsEnabled: true }
				}
			: { type: 'user_preferences', value: common }
	);
	if (opened.kind !== 'ready')
		throw new Error(draft.lastError ?? 'These preferences are unavailable');
	return { draft, value: opened.value };
};
