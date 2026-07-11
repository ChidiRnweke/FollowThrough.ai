import type { ActorContext, ExtractPromisesInput, ExtractPromisesOutput, Todo } from '../models';
import { InvalidGeneratedContentError } from '../models';
import type {
	PromiseExtractor,
	ProvenanceRecorder,
	SelectionAnchorCreator,
	SuggestionAccepter,
	SuggestionCreator,
	TodoCreator,
	TrustPolicyEvaluator
} from '../services';

export interface ExtractPromisesDependencies {
	anchorCreator: SelectionAnchorCreator;
	promiseExtractor: PromiseExtractor;
	provenanceRecorder: ProvenanceRecorder;
	suggestionCreator: SuggestionCreator;
	trustPolicyEvaluator: TrustPolicyEvaluator;
	todoCreator: TodoCreator;
	suggestionAccepter: SuggestionAccepter;
}

export class DefaultExtractPromisesController {
	constructor(private readonly dependencies: ExtractPromisesDependencies) {}

	async execute(actor: ActorContext, input: ExtractPromisesInput): Promise<ExtractPromisesOutput> {
		const anchor = await this.dependencies.anchorCreator.create(actor, input.selection);
		const candidates = await this.dependencies.promiseExtractor.extract(actor, input.selection);
		const provenance = await this.dependencies.provenanceRecorder.record(actor, {
			producerKind: 'pipeline',
			producerName: 'Extract Promises',
			pipeline: 'extract_promises',
			sourceAnchorId: anchor.id,
			metadata: {}
		});
		const suggestions = [];
		const createdTodos: Todo[] = [];
		for (const candidate of candidates) {
			const suggestion = await this.dependencies.suggestionCreator.create(actor, {
				kind: 'todo',
				noteId: input.selection.noteId,
				confidence: candidate.confidence,
				provenanceId: provenance.id,
				sourceAnchorId: anchor.id,
				payload: {
					title: candidate.action,
					responsibility: candidate.responsibility,
					dueDateVerbatim: candidate.dueDateVerbatim,
					dueDate: candidate.resolvedDueDate,
					promiseStrength: candidate.strength,
					sourceAnchorId: anchor.id,
					provenanceId: provenance.id
				}
			});
			if (suggestion.kind !== 'todo') {
				throw new InvalidGeneratedContentError(
					'Suggestion creator returned a non-todo suggestion for a todo proposal'
				);
			}
			if (
				await this.dependencies.trustPolicyEvaluator.shouldAutoAccept(
					actor,
					'extract_promises',
					suggestion
				)
			) {
				const todo = await this.dependencies.todoCreator.create(actor, suggestion.payload);
				createdTodos.push(todo);
				await this.dependencies.suggestionAccepter.accept(actor, suggestion, todo.id, true);
			}
			suggestions.push(suggestion);
		}
		return { anchorId: anchor.id, suggestions, createdTodos };
	}
}
