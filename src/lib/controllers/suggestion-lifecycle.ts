import type {
	AcceptSuggestionInput,
	AcceptSuggestionOutput,
	ActorContext,
	RejectSuggestionInput,
	RevertSuggestionInput,
	Suggestion
} from '../models';
import type { TransactionRunner } from '../repositories';
import type {
	SuggestionAccepter,
	SuggestionFinder,
	SuggestionRejecter,
	SuggestionReverter
} from '../services';

export interface SuggestionArtifactApplier {
	apply(actor: ActorContext, suggestion: Suggestion): Promise<AcceptSuggestionOutput['artifact']>;
	revert(actor: ActorContext, suggestion: Suggestion): Promise<void>;
}
export interface AcceptSuggestionDependencies {
	suggestionFinder: SuggestionFinder;
	suggestionAccepter: SuggestionAccepter;
	artifactApplier: SuggestionArtifactApplier;
	transactionRunner: TransactionRunner;
}
export class DefaultAcceptSuggestionController {
	constructor(private readonly dependencies: AcceptSuggestionDependencies) {}
	execute(actor: ActorContext, input: AcceptSuggestionInput): Promise<AcceptSuggestionOutput> {
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
}
export interface RejectSuggestionDependencies {
	suggestionFinder: SuggestionFinder;
	suggestionRejecter: SuggestionRejecter;
	transactionRunner: TransactionRunner;
}
export class DefaultRejectSuggestionController {
	constructor(private readonly dependencies: RejectSuggestionDependencies) {}
	execute(actor: ActorContext, input: RejectSuggestionInput): Promise<Suggestion> {
		return this.dependencies.transactionRunner.run(async () =>
			this.dependencies.suggestionRejecter.reject(
				actor,
				await this.dependencies.suggestionFinder.get(actor, input.suggestionId)
			)
		);
	}
}
export interface RevertSuggestionDependencies {
	suggestionFinder: SuggestionFinder;
	suggestionReverter: SuggestionReverter;
	artifactApplier: SuggestionArtifactApplier;
	transactionRunner: TransactionRunner;
}
export class DefaultRevertSuggestionController {
	constructor(private readonly dependencies: RevertSuggestionDependencies) {}
	execute(actor: ActorContext, input: RevertSuggestionInput): Promise<Suggestion> {
		return this.dependencies.transactionRunner.run(async () => {
			const accepted = await this.dependencies.suggestionFinder.get(actor, input.suggestionId);
			await this.dependencies.artifactApplier.revert(actor, accepted);
			return this.dependencies.suggestionReverter.revert(actor, accepted);
		});
	}
}
