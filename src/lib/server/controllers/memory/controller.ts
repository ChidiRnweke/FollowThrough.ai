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

/**
 * Application boundary for memory: the persistent facts the agent is allowed to read,
 * managed directly by the user or proposed by the agent.
 *
 * Direct edits are immediate; agent proposals go through the suggestion pipeline and are
 * auto-accepted only when the trust policy says the change is safe.
 */
export interface MemoryController {
	/**
	 * List memory entries, optionally restricted to those shared with agents. Entries the
	 * user keeps private are visible here but never to the agent.
	 */
	list(actor: ActorContext, input: ListMemoryInput): Promise<ListMemoryOutput>;
	/** Add a memory entry. */
	create(actor: ActorContext, input: CreateMemoryEntryInput): Promise<{ entry: MemoryEntry }>;
	/** Edit an existing memory entry. */
	update(actor: ActorContext, input: UpdateMemoryEntryInput): Promise<{ entry: MemoryEntry }>;
	/** Delete a memory entry. */
	remove(actor: ActorContext, input: DeleteMemoryEntryInput): Promise<void>;
	/**
	 * Propose a memory change from the agent.
	 *
	 * Runs in one transaction: provenance is recorded, a memory suggestion is created,
	 * and — when the trust policy deems the proposal safe — the change is applied and the
	 * suggestion auto-accepted. Otherwise it lands as a pending suggestion for the user to
	 * review. Either way the entry can be traced back to the run that proposed it.
	 *
	 * @throws ValidationError if the proposal is malformed (project scope without a
	 * project, an update/removal without a target entry, or a non-removal without content).
	 */
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
