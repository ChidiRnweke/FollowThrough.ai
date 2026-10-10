import type { AgentToolInput } from '$lib/models/agent-tool-inputs';
import type { ActorContext } from '$lib/models/identity';
import type { SuggestionsController } from '$lib/server/controllers/suggestions/controller';
import type { AgentToolPresentation } from '$lib/server/services/agent/runs/tool-views';
import type { AgentToolOutput } from '../tool-outputs';
interface SuggestionsToolOperationsDependencies {
	suggestions(): Pick<SuggestionsController, 'list' | 'acceptReviewed' | 'reject' | 'revert'>;
}
export interface SuggestionsToolOperations {
	list_suggestions(
		input: AgentToolInput<'list_suggestions'>
	): Promise<AgentToolOutput<'list_suggestions'>>;
	accept_suggestion(
		input: AgentToolInput<'accept_suggestion'>
	): Promise<AgentToolOutput<'accept_suggestion'>>;
	reject_suggestion(
		input: AgentToolInput<'reject_suggestion'>
	): Promise<AgentToolOutput<'reject_suggestion'>>;
	revert_suggestion(
		input: AgentToolInput<'revert_suggestion'>
	): Promise<AgentToolOutput<'revert_suggestion'>>;
}
export class SuggestionsToolOperationsController implements SuggestionsToolOperations {
	constructor(
		private readonly controllers: SuggestionsToolOperationsDependencies,
		private readonly actor: ActorContext,
		private readonly toolPresentation: AgentToolPresentation
	) {}
	async list_suggestions(
		input: AgentToolInput<'list_suggestions'>
	): Promise<AgentToolOutput<'list_suggestions'>> {
		return {
			suggestions: (await this.controllers.suggestions().list(this.actor, input)).groups.flatMap(
				(group) =>
					group.suggestions.map((view) => this.toolPresentation.projectSuggestion(view.suggestion))
			)
		};
	}
	async accept_suggestion(
		input: AgentToolInput<'accept_suggestion'>
	): Promise<AgentToolOutput<'accept_suggestion'>> {
		return this.controllers.suggestions().acceptReviewed(this.actor, input);
	}
	async reject_suggestion(
		input: AgentToolInput<'reject_suggestion'>
	): Promise<AgentToolOutput<'reject_suggestion'>> {
		return this.controllers.suggestions().reject(this.actor, input);
	}
	async revert_suggestion(
		input: AgentToolInput<'revert_suggestion'>
	): Promise<AgentToolOutput<'revert_suggestion'>> {
		return this.controllers.suggestions().revert(this.actor, input);
	}
}
