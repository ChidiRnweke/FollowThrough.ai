import { workspaceSession } from '$lib/factories/workspace/session';
import { suggestionActions } from '$lib/stores/suggestions/actions.svelte';
import type { SuggestionId } from '$lib/models/suggestions';
import { acceptSuggestion, rejectSuggestion } from '$lib/remote/suggestions/suggestions.remote';

/**
 * Accept or reject a suggestion, then refresh the workspace so what it created is on screen.
 * False leaves the suggestion visible and actionable.
 */
export const decideSuggestion = async (
	suggestionId: SuggestionId,
	decision: 'accept' | 'reject'
): Promise<boolean> => {
	suggestionActions.begin(suggestionId);
	const decided =
		decision === 'accept'
			? await workspaceSession.serverChange(acceptSuggestion({ suggestionId }))
			: await workspaceSession.serverChange(rejectSuggestion({ suggestionId }));
	suggestionActions.finish(suggestionId);
	return decided.kind === 'saved';
};
