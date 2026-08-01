import type { ActorContext } from '$lib/models/identity';
import type {
	CreateMemoryEntryInput,
	DeleteMemoryEntryInput,
	ListMemoryInput,
	ListMemoryOutput,
	MemoryChangePayload,
	MemoryEntry,
	ProposeMemoryChangeInput,
	ProposeMemoryChangeOutput,
	UpdateMemoryEntryInput
} from '$lib/models/memory';
import { InvalidGeneratedContentError, ValidationError } from '$lib/errors';
import type { AtomicOperation as TransactionRunner } from '$lib/models/workspace';
import type {
	MemoryChangeApplier,
	MemoryEntryCreator,
	MemoryEntryDeleter,
	MemoryEntryEditor,
	MemoryEntryLister
} from '$lib/server/services/memory/contracts';
import type { ProvenanceRecorder } from '$lib/server/services/notes/provenance';
import type {
	SuggestionAccepter,
	SuggestionCreator
} from '$lib/server/services/suggestions/contracts';
import type { TrustPolicyEvaluator } from '$lib/server/services/agent/runs/tool-trust';

export interface MemoryController {
	list(actor: ActorContext, input: ListMemoryInput): Promise<ListMemoryOutput>;
	create(actor: ActorContext, input: CreateMemoryEntryInput): Promise<{ entry: MemoryEntry }>;
	update(actor: ActorContext, input: UpdateMemoryEntryInput): Promise<{ entry: MemoryEntry }>;
	remove(actor: ActorContext, input: DeleteMemoryEntryInput): Promise<void>;
	propose(actor: ActorContext, input: ProposeMemoryChangeInput): Promise<ProposeMemoryChangeOutput>;
}

export interface MemoryDependencies {
	memoryLister: MemoryEntryLister;
	memoryCreator: MemoryEntryCreator;
	memoryEditor: MemoryEntryEditor;
	memoryDeleter: MemoryEntryDeleter;
	memoryChangeApplier: MemoryChangeApplier;
	provenanceRecorder: ProvenanceRecorder;
	suggestionCreator: SuggestionCreator;
	suggestionAccepter: SuggestionAccepter;
	trustPolicyEvaluator: TrustPolicyEvaluator;
	transactionRunner: TransactionRunner;
}

export class Memory implements MemoryController {
	constructor(private readonly dependencies: MemoryDependencies) {}

	async list(actor: ActorContext, input: ListMemoryInput): Promise<ListMemoryOutput> {
		const entries = await this.dependencies.memoryLister.list(actor, {
			projectId: input.projectId
		});
		return {
			entries: input.sharedOnly ? entries.filter((entry) => entry.shareWithAgents) : entries
		};
	}

	async create(
		actor: ActorContext,
		input: CreateMemoryEntryInput
	): Promise<{ entry: MemoryEntry }> {
		return { entry: await this.dependencies.memoryCreator.create(actor, input) };
	}

	async update(
		actor: ActorContext,
		input: UpdateMemoryEntryInput
	): Promise<{ entry: MemoryEntry }> {
		return { entry: await this.dependencies.memoryEditor.update(actor, input) };
	}

	async remove(actor: ActorContext, input: DeleteMemoryEntryInput): Promise<void> {
		await this.dependencies.memoryDeleter.remove(actor, input.memoryEntryId);
	}

	async propose(
		actor: ActorContext,
		input: ProposeMemoryChangeInput
	): Promise<ProposeMemoryChangeOutput> {
		const payload = this.toPayload(input);
		return this.dependencies.transactionRunner.run(async () => {
			const provenance = await this.dependencies.provenanceRecorder.record(actor, {
				producerKind: 'agent',
				producerName: 'Agent memory',
				pipeline: 'memory',
				metadata: {}
			});
			const suggestion = await this.dependencies.suggestionCreator.create(actor, {
				kind: 'memory',
				...(input.confidence !== undefined ? { confidence: input.confidence } : {}),
				provenanceId: provenance.id,
				payload
			});
			if (suggestion.kind !== 'memory')
				throw new InvalidGeneratedContentError(
					'Suggestion creator returned a non-memory suggestion for a memory proposal'
				);
			if (
				await this.dependencies.trustPolicyEvaluator.shouldAutoAccept(actor, 'memory', suggestion)
			) {
				const entry = await this.dependencies.memoryChangeApplier.apply(
					actor,
					suggestion.payload,
					suggestion.provenanceId
				);
				const accepted = await this.dependencies.suggestionAccepter.accept(
					actor,
					suggestion,
					entry.id,
					true
				);
				return { suggestion: accepted, appliedEntry: entry };
			}
			return { suggestion };
		});
	}

	private toPayload(input: ProposeMemoryChangeInput): MemoryChangePayload {
		if (input.scope === 'project' && input.projectId === undefined)
			throw new ValidationError('Project memory proposals require a project');
		if (input.operation !== 'add' && input.memoryEntryId === undefined)
			throw new ValidationError('Memory updates and removals require a target entry');
		if (input.operation !== 'remove' && !input.content?.trim())
			throw new ValidationError('Memory additions and updates require content');
		return {
			...(input.scope === 'project' ? { projectId: input.projectId } : {}),
			operation: input.operation,
			...(input.memoryEntryId !== undefined ? { memoryEntryId: input.memoryEntryId } : {}),
			...(input.content !== undefined ? { content: input.content } : {}),
			...(input.shareWithAgents !== undefined ? { shareWithAgents: input.shareWithAgents } : {}),
			...(input.justification !== undefined ? { justification: input.justification } : {})
		};
	}
}
