import type {
	ActorContext,
	AcceptSuggestionInput,
	AcceptSuggestionOutput,
	ListSuggestionsInput,
	ListSuggestionsOutput,
	SuggestionGroup,
	SuggestionView,
	RejectSuggestionInput,
	RevertSuggestionInput,
	Suggestion
} from '$lib/models';
import type { TransactionRunner } from '$lib/repositories';
import type {
	SuggestionAccepter,
	SuggestionFinder,
	SuggestionLister,
	SuggestionRejecter,
	SuggestionReverter,
	SuggestionViewAssembler
} from '$lib/services';

export interface SuggestionArtifactApplier {
	apply(actor: ActorContext, suggestion: Suggestion): Promise<AcceptSuggestionOutput['artifact']>;
	revert(actor: ActorContext, suggestion: Suggestion): Promise<void>;
}

export interface SuggestionsController {
	list(actor: ActorContext, input: ListSuggestionsInput): Promise<ListSuggestionsOutput>;
	accept(actor: ActorContext, input: AcceptSuggestionInput): Promise<AcceptSuggestionOutput>;
	reject(actor: ActorContext, input: RejectSuggestionInput): Promise<Suggestion>;
	revert(actor: ActorContext, input: RevertSuggestionInput): Promise<Suggestion>;
}
export interface SuggestionsDependencies {
	suggestionLister: SuggestionLister;
	suggestionViewAssembler: SuggestionViewAssembler;
	suggestionFinder: SuggestionFinder;
	suggestionAccepter: SuggestionAccepter;
	suggestionRejecter: SuggestionRejecter;
	suggestionReverter: SuggestionReverter;
	artifactApplier: SuggestionArtifactApplier;
	transactionRunner: TransactionRunner;
}
export class DefaultSuggestionsController implements SuggestionsController {
	constructor(private readonly dependencies: SuggestionsDependencies) {}
	async list(actor: ActorContext, input: ListSuggestionsInput): Promise<ListSuggestionsOutput> {
		const suggestions = await this.dependencies.suggestionLister.listByStatus(actor, input.status);
		const views = await this.dependencies.suggestionViewAssembler.assemble(actor, suggestions);
		const ordered = [...views].sort((a, b) =>
			a.suggestion.createdAt.localeCompare(b.suggestion.createdAt)
		);
		const groups = new Map<string, { note?: SuggestionView['note']; views: SuggestionView[] }>();
		for (const view of ordered) {
			const key = view.note?.id ?? '';
			const group = groups.get(key) ?? { note: view.note, views: [] };
			group.views.push(view);
			groups.set(key, group);
		}
		const result: SuggestionGroup[] = [...groups.values()].map((group) =>
			group.note ? { note: group.note, suggestions: group.views } : { suggestions: group.views }
		);
		return { groups: result };
	}
	accept(actor: ActorContext, input: AcceptSuggestionInput): Promise<AcceptSuggestionOutput> {
		return this.dependencies.transactionRunner.run(async () => {
			const pending = await this.dependencies.suggestionFinder.get(actor, input.suggestionId);
			const artifact = await this.dependencies.artifactApplier.apply(actor, pending);
			const suggestion = await this.dependencies.suggestionAccepter.accept(
				actor,
				pending,
				artifact.id,
				input.autoAccepted ?? false
			);
			return { suggestion, artifact };
		});
	}
	reject(actor: ActorContext, input: RejectSuggestionInput): Promise<Suggestion> {
		return this.dependencies.transactionRunner.run(async () =>
			this.dependencies.suggestionRejecter.reject(
				actor,
				await this.dependencies.suggestionFinder.get(actor, input.suggestionId)
			)
		);
	}
	revert(actor: ActorContext, input: RevertSuggestionInput): Promise<Suggestion> {
		return this.dependencies.transactionRunner.run(async () => {
			const accepted = await this.dependencies.suggestionFinder.get(actor, input.suggestionId);
			await this.dependencies.artifactApplier.revert(actor, accepted);
			return this.dependencies.suggestionReverter.revert(actor, accepted);
		});
	}
}
