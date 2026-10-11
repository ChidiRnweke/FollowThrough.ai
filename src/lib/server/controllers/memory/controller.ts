import type { MemoryIndexing as MemoryIndexer } from '$lib/server/services/knowledge-search/retrieval';
import { ValidationError } from '$lib/errors';
import type { AppliedChange } from '$lib/models/proposal-effects';
import type { IMemoryEditingService } from '$lib/services/memory/edits';
import type { IMemoryPresentationService } from '$lib/services/memory/presentation';
import type { WorkspaceCommandRules } from '$lib/services/workspace/commands';

import type { ActorContext } from '$lib/models/identity';
import type {
	CreateMemoryEntryInput,
	DeleteMemoryEntryInput,
	ListMemoryInput,
	ListMemoryOutput,
	MemoryEntry,
	MemoryEntryId,
	ProposeMemoryChangeInput,
	ProposeMemoryChangeOutput,
	UpdateMemoryEntryInput
} from '$lib/models/memory';
import type { Suggestion } from '$lib/models/suggestions';
import type { DateTime, AtomicOperation as TransactionRunner } from '$lib/models/workspace';
import type {
	MemoryMutationRequest,
	WorkspaceMutationResult
} from '$lib/models/workspace-mutations';
import type { TrustPolicyEvaluator } from '$lib/server/services/agent/runs/tool-trust';
import type { MemoryChanges, MemoryLibrary } from '$lib/server/services/memory/library';
import type { SuggestionEffectService } from '$lib/server/services/suggestions/effects';
import type { SuggestionAccepter, SuggestionCreator } from '$lib/server/services/suggestions/inbox';
import type { WorkspaceMutationGuard } from '$lib/server/services/workspace/mutation-receipts';

/**
 * Application boundary for memory: the persistent facts the agent is allowed to read,
 * managed directly by the user or proposed by the agent.
 *
 * Direct edits are immediate; agent proposals go through the suggestion pipeline and are
 * auto-accepted only when the trust policy says the change is safe.
 */
export interface MemoryController {
	synchronize(input: MemoryMutationRequest): Promise<WorkspaceMutationResult>;
	/**
	 * List memory entries, optionally restricted to those shared with agents. Entries the
	 * user keeps private are visible here but never to the agent.
	 */
	list(input: ListMemoryInput): Promise<ListMemoryOutput>;
	/** Add a memory entry. */
	create(input: CreateMemoryEntryInput): Promise<{ entry: MemoryEntry }>;
	/** Edit an existing memory entry. */
	update(input: UpdateMemoryEntryInput): Promise<{ entry: MemoryEntry }>;
	/** Delete a memory entry. */
	remove(input: DeleteMemoryEntryInput): Promise<void>;
	/**
	 * Propose a memory change from the agent.
	 *
	 * Runs in one transaction: the owned source is validated, a memory suggestion is created,
	 * and — when the trust policy deems the proposal safe — the change is applied and the
	 * suggestion auto-accepted. Otherwise it lands as a pending suggestion for the user to
	 * review. Either way the entry can be traced back to the run that proposed it.
	 *
	 * @throws ValidationError if the proposal is malformed (project scope without a
	 * project, an update/removal without a target entry, or a non-removal without content).
	 */
	propose(input: ProposeMemoryChangeInput): Promise<ProposeMemoryChangeOutput<Suggestion>>;
}

export interface MemoryDependencies {
	readonly editing: IMemoryEditingService;
	readonly presentation: IMemoryPresentationService;
	memoryIndexer: MemoryIndexer;
	syncMutations: WorkspaceMutationGuard;
	syncRetry: 'database-only' | 'never';
	memoryLibrary: MemoryLibrary;
	memoryChanges: MemoryChanges;
	suggestionCreator: SuggestionCreator;
	suggestionAccepter: SuggestionAccepter;
	suggestionEffects: SuggestionEffectService;
	trustPolicyEvaluator: TrustPolicyEvaluator;
	transactionRunner: TransactionRunner;
}

export class Memory implements MemoryController {
	async synchronize(input: MemoryMutationRequest): Promise<WorkspaceMutationResult> {
		try {
			return await this.dependencies.transactionRunner.run(
				async () => {
					const target = this.workspaceCommandRules.mutationResource(input.command);
					const prepared = await this.dependencies.syncMutations.prepare(input, {
						identity: target,
						key: this.workspaceCommandRules.workspaceResourceKey(target)
					});
					if (prepared.kind === 'finished') return prepared.result;
					await this.applySynchronizedCommand(input);
					return this.dependencies.syncMutations.complete(input, target);
				},
				{ retry: this.dependencies.syncRetry }
			);
		} catch (error) {
			if (!(error instanceof Error)) throw error;
			return this.dependencies.syncMutations.reject(error);
		}
	}

	private async applySynchronizedCommand(input: MemoryMutationRequest): Promise<void> {
		const command = input.command;
		switch (command.kind) {
			case 'createMemory':
				await this.create(command);
				break;
			case 'updateMemory':
				await this.update(command);
				break;
			case 'deleteMemory':
				await this.remove(command);
				break;
		}
	}
	constructor(
		private readonly actor: ActorContext,
		private readonly workspaceCommandRules: WorkspaceCommandRules,
		private readonly dependencies: MemoryDependencies
	) {}

	async list(input: ListMemoryInput): Promise<ListMemoryOutput> {
		const entries = await this.dependencies.memoryLibrary.list({
			projectId: input.projectId
		});
		return {
			entries: input.sharedOnly ? this.dependencies.presentation.sharedEntries(entries) : entries
		};
	}

	async create(input: CreateMemoryEntryInput): Promise<{ entry: MemoryEntry }> {
		return this.dependencies.transactionRunner.run(async () => {
			const decision = this.dependencies.editing.create(input, {
				id: input.id ?? (crypto.randomUUID() as MemoryEntryId),
				userId: this.actor.userId,
				timestamp: new Date().toISOString() as DateTime
			});
			if (decision.kind === 'invalid') throw new ValidationError(decision.message);
			const entry = await this.dependencies.memoryLibrary.create(decision.entry);
			await this.dependencies.memoryIndexer.indexMemory(entry);
			return { entry };
		});
	}

	async update(input: UpdateMemoryEntryInput): Promise<{ entry: MemoryEntry }> {
		return this.dependencies.transactionRunner.run(async () => {
			const current = await this.dependencies.memoryLibrary.getForEdit(input.memoryEntryId);
			const decision = this.dependencies.editing.edit(
				current,
				input,
				new Date().toISOString() as DateTime
			);
			if (decision.kind === 'invalid') throw new ValidationError(decision.message);
			const entry = await this.dependencies.memoryLibrary.update(decision.entry);
			await this.dependencies.memoryIndexer.indexMemory(entry);
			return { entry };
		});
	}

	async remove(input: DeleteMemoryEntryInput): Promise<void> {
		await this.dependencies.transactionRunner.run(async () => {
			const entry = await this.dependencies.memoryLibrary.remove(input.memoryEntryId);
			await this.dependencies.memoryIndexer.indexMemory(entry);
		});
	}

	async propose(input: ProposeMemoryChangeInput): Promise<ProposeMemoryChangeOutput<Suggestion>> {
		const { confidence, provenanceId, ...payload } = input;
		return this.dependencies.transactionRunner.run(async () => {
			await this.dependencies.memoryChanges.validate(payload);

			const suggestion = await this.dependencies.suggestionCreator.create({
				kind: 'memory',
				...(confidence !== undefined ? { confidence } : {}),
				provenanceId,
				payload
			});

			if (await this.dependencies.trustPolicyEvaluator.shouldAutoAccept('memory', suggestion)) {
				const applied = await this.dependencies.memoryChanges.apply(
					suggestion.payload,
					suggestion.provenanceId
				);
				for (const change of applied.changes)
					await this.dependencies.memoryIndexer.indexMemory(change.after);
				const entry = applied.entry;
				await this.dependencies.suggestionEffects.record(
					suggestion.id,
					applied.changes.map((change) =>
						mapAppliedChange(change, (value) => ({ type: 'memory_entries' as const, value }))
					)
				);
				const accepted = await this.dependencies.suggestionAccepter.accept(
					suggestion,
					entry.id,
					true
				);
				return { suggestion: accepted, appliedEntry: entry };
			}
			return { suggestion };
		});
	}
}

function mapAppliedChange<Input, Output>(
	change: AppliedChange<Input>,
	map: (record: Input) => Output
): AppliedChange<Output> {
	switch (change.kind) {
		case 'created':
			return { kind: 'created', after: map(change.after) };
		case 'modified':
			return { kind: 'modified', before: map(change.before), after: map(change.after) };
		case 'unchanged':
			return { kind: 'unchanged', after: map(change.after) };
	}
}
