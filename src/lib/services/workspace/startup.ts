import type { WorkspaceReadiness, WorkspaceStartupFacts } from '$lib/models/workspace-startup';

/** Cached prerequisites remain usable when a background pull fails. */
export function workspaceReadiness(facts: WorkspaceStartupFacts): WorkspaceReadiness {
	if (facts.userKnown && facts.inboxKnown && facts.preferencesKnown) return { kind: 'ready' };
	if (facts.failure) return { kind: 'failure', message: facts.failure };
	if (facts.inventoryComplete)
		return {
			kind: 'failure',
			message: 'Required account or inbox records are missing from this workspace.'
		};
	return facts.online ? { kind: 'loading' } : { kind: 'offline' };
}
