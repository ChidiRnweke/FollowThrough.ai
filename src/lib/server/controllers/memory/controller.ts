import type { IndexingResult } from '$lib/models/knowledge-search';
import type { IEmbeddings } from '$lib/server/services/knowledge-search/embeddings';
import type { ContentIndex } from '$lib/server/services/knowledge-search/indexing';
import type { MemoryIndexer } from '$lib/server/services/memory/contracts';
import { mapAppliedChange } from '$lib/models/proposal-effects';
import type { SuggestionEffectService } from '$lib/server/services/suggestions/contracts';
import type { Suggestion } from '$lib/models/suggestions';
import type {
	MemoryMutationRequest,
	WorkspaceMutationResult
} from '$lib/models/workspace-mutations';
import type { WorkspaceMutationReceipts } from '$lib/server/services/workspace/mutation-receipts';
import type { ActorContext } from '$lib/models/identity';
import type {
	CreateMemoryEntryInput,
	DeleteMemoryEntryInput,
	ListMemoryInput,
	ListMemoryOutput,
	MemoryEntry,
	ProposeMemoryChangeInput,
	ProposeMemoryChangeOutput,
	UpdateMemoryEntryInput
} from '$lib/models/memory';
import type { AtomicOperation as TransactionRunner } from '$lib/models/workspace';
import type {
	MemoryChanges,
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
	synchronize(actor: ActorContext, input: MemoryMutationRequest): Promise<WorkspaceMutationResult>;
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
	propose(
		actor: ActorContext,
		input: ProposeMemoryChangeInput
	): Promise<ProposeMemoryChangeOutput<Suggestion>>;
}

export interface MemoryDependencies {
	indexEmbeddings: IEmbeddings;
	indexWriter: Pick<ContentIndex, 'complete'>;
	memoryIndexer: MemoryIndexer;
	syncMutations: Pick<WorkspaceMutationReceipts, 'prepare' | 'complete' | 'reject'>;
	syncRetry: 'database-only' | 'never';
	memoryLister: MemoryEntryLister;
	memoryCreator: MemoryEntryCreator;
	memoryEditor: MemoryEntryEditor;
	memoryDeleter: MemoryEntryDeleter;
	memoryChanges: MemoryChanges;
	provenanceRecorder: ProvenanceRecorder;
	suggestionCreator: SuggestionCreator;
	suggestionAccepter: SuggestionAccepter;
	suggestionEffects: SuggestionEffectService;
	trustPolicyEvaluator: TrustPolicyEvaluator;
	transactionRunner: TransactionRunner;
}

export class Memory implements MemoryController {
	async synchronize(
		actor: ActorContext,
		input: MemoryMutationRequest
	): Promise<WorkspaceMutationResult> {
		try {
			return await this.dependencies.transactionRunner.run(
				async () => {
					const prepared = await this.dependencies.syncMutations.prepare(actor, input);
					if (prepared.kind === 'finished') return prepared.result;
					await this.applySynchronizedCommand(actor, input);
					return this.dependencies.syncMutations.complete(actor, input);
				},
				{ retry: this.dependencies.syncRetry }
			);
		} catch (error) {
			if (!(error instanceof Error)) throw error;
			return this.dependencies.syncMutations.reject(error);
		}
	}

	private async applySynchronizedCommand(
		actor: ActorContext,
		input: MemoryMutationRequest
	): Promise<void> {
		const command = input.command;
		switch (command.kind) {
			case 'createMemory':
				await this.create(actor, command);
				break;
			case 'updateMemory':
				await this.update(actor, command);
				break;
			case 'deleteMemory':
				await this.remove(actor, command);
				break;
		}
	}
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
		return this.dependencies.transactionRunner.run(async () => {
			const entry = await this.dependencies.memoryCreator.create(actor, input);
			await this.finishIndex(actor, await this.dependencies.memoryIndexer.index(actor, entry));
			return { entry };
		});
	}

	async update(
		actor: ActorContext,
		input: UpdateMemoryEntryInput
	): Promise<{ entry: MemoryEntry }> {
		return this.dependencies.transactionRunner.run(async () => {
			const entry = await this.dependencies.memoryEditor.update(actor, input);
			await this.finishIndex(actor, await this.dependencies.memoryIndexer.index(actor, entry));
			return { entry };
		});
	}

	async remove(actor: ActorContext, input: DeleteMemoryEntryInput): Promise<void> {
		await this.dependencies.transactionRunner.run(async () => {
			const entry = await this.dependencies.memoryDeleter.remove(actor, input.memoryEntryId);
			await this.finishIndex(actor, await this.dependencies.memoryIndexer.index(actor, entry));
		});
	}

	async propose(
		actor: ActorContext,
		input: ProposeMemoryChangeInput
	): Promise<ProposeMemoryChangeOutput<Suggestion>> {
		const { confidence, ...payload } = input;
		return this.dependencies.transactionRunner.run(async () => {
			await this.dependencies.memoryChanges.validate(actor, payload);
			const provenance = await this.dependencies.provenanceRecorder.record(actor, {
				producerKind: 'agent',
				producerName: 'Agent memory',
				pipeline: 'memory',
				metadata: {}
			});
			const suggestion = await this.dependencies.suggestionCreator.create(actor, {
				kind: 'memory',
				...(confidence !== undefined ? { confidence } : {}),
				provenanceId: provenance.id,
				payload
			});

			if (
				await this.dependencies.trustPolicyEvaluator.shouldAutoAccept(actor, 'memory', suggestion)
			) {
				const applied = await this.dependencies.memoryChanges.apply(
					actor,
					suggestion.payload,
					suggestion.provenanceId
				);
				for (const change of applied.changes)
					await this.finishIndex(
						actor,
						await this.dependencies.memoryIndexer.index(actor, change.after)
					);
				const entry = applied.entry;
				await this.dependencies.suggestionEffects.record(
					actor,
					suggestion.id,
					applied.changes.map((change) =>
						mapAppliedChange(change, (value) => ({ type: 'memory_entries' as const, value }))
					)
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
	private async finishIndex(actor: ActorContext, result: IndexingResult): Promise<void> {
		if (result.kind === 'stored') return;
		const batch = await this.dependencies.indexEmbeddings.embed(
			result.missing.map((chunk) => chunk.input)
		);
		await this.dependencies.indexWriter.complete(actor, result, batch);
	}
}
