import type {
	ActorContext,
	CreateMemoryEntryInput,
	DateTime,
	MemoryChangePayload,
	MemoryEntry,
	MemoryEntryId,
	MemorySuggestion,
	ProjectId,
	ProvenanceId,
	UpdateMemoryEntryInput
} from '$lib/models';
import { InvalidTransitionError, NotFoundError, ValidationError } from '$lib/errors';
import type {
	MemoryEntryRepository,
	ProjectRepository,
	ProvenanceRepository
} from '$lib/server/repositories';
import type { MemoryEntryListFilter } from '$lib/server/repositories';

interface MemoryIndexer {
	index(actor: ActorContext, entry: MemoryEntry): Promise<void>;
}

const now = (): DateTime => new Date().toISOString() as DateTime;

export class MemoryLibrary {
	constructor(
		private readonly entries: MemoryEntryRepository,
		private readonly projects: ProjectRepository,
		private readonly provenance: ProvenanceRepository,
		private readonly indexer: MemoryIndexer
	) {}

	async get(actor: ActorContext, memoryEntryId: MemoryEntryId): Promise<MemoryEntry> {
		const entry = await this.entries.findById(actor, memoryEntryId);
		if (!entry) throw new NotFoundError('Memory entry was not found', { memoryEntryId });
		return entry;
	}

	async list(actor: ActorContext, filter: MemoryEntryListFilter): Promise<readonly MemoryEntry[]> {
		if (filter.projectId) await this.requireProject(actor, filter.projectId);
		return this.entries.list(actor, filter);
	}

	async create(actor: ActorContext, input: CreateMemoryEntryInput): Promise<MemoryEntry> {
		const content = input.content.trim();
		if (!content) throw new ValidationError('Memory entry content is required');
		if (input.projectId) await this.requireProject(actor, input.projectId);
		const timestamp = now();
		const entry = await this.entries.insert(actor, {
			id: crypto.randomUUID() as MemoryEntryId,
			userId: actor.userId,
			...(input.projectId !== undefined ? { projectId: input.projectId } : {}),
			content,
			...(input.type !== undefined ? { type: input.type } : {}),
			shareWithAgents: input.shareWithAgents ?? true,
			createdAt: timestamp,
			updatedAt: timestamp
		});
		await this.indexer.index(actor, entry);
		return entry;
	}

	async update(actor: ActorContext, input: UpdateMemoryEntryInput): Promise<MemoryEntry> {
		const current = await this.getActive(actor, input.memoryEntryId);
		const content = input.content?.trim() ?? current.content;
		if (!content) throw new ValidationError('Memory entry content is required');
		const entry = await this.entries.update(actor, {
			...current,
			content,
			...(input.type !== undefined ? { type: input.type ?? undefined } : {}),
			shareWithAgents: input.shareWithAgents ?? current.shareWithAgents,
			updatedAt: now()
		});
		await this.indexer.index(actor, entry);
		return entry;
	}

	async remove(actor: ActorContext, memoryEntryId: MemoryEntryId): Promise<void> {
		const current = await this.getActive(actor, memoryEntryId);
		const entry = await this.entries.update(actor, {
			...current,
			deletedAt: now(),
			updatedAt: now()
		});
		await this.indexer.index(actor, entry);
	}

	async apply(
		actor: ActorContext,
		payload: MemoryChangePayload,
		provenanceId: ProvenanceId
	): Promise<MemoryEntry> {
		if (!(await this.provenance.findById(actor, provenanceId)))
			throw new NotFoundError('Memory change provenance was not found');
		switch (payload.operation) {
			case 'add':
				return this.applyAdd(actor, payload, provenanceId);
			case 'update':
				return this.applyUpdate(actor, payload, provenanceId);
			case 'remove':
				return this.applyRemove(actor, payload);
		}
	}

	async revert(actor: ActorContext, suggestion: MemorySuggestion): Promise<void> {
		if (!suggestion.appliedArtifactId)
			throw new InvalidTransitionError('Memory suggestion has no applied artifact');
		const applied = await this.get(actor, suggestion.appliedArtifactId as MemoryEntryId);
		switch (suggestion.payload.operation) {
			case 'add': {
				await this.softDelete(actor, applied);
				return;
			}
			case 'update': {
				await this.softDelete(actor, applied);
				if (applied.replacesEntryId)
					await this.restore(actor, await this.get(actor, applied.replacesEntryId));
				return;
			}
			case 'remove': {
				await this.restore(actor, applied);
				return;
			}
		}
	}

	private async applyAdd(
		actor: ActorContext,
		payload: MemoryChangePayload,
		provenanceId: ProvenanceId
	): Promise<MemoryEntry> {
		const content = payload.content?.trim();
		if (!content) throw new ValidationError('Memory entry content is required');
		if (payload.projectId) await this.requireProject(actor, payload.projectId);
		const timestamp = now();
		const entry = await this.entries.insert(actor, {
			id: crypto.randomUUID() as MemoryEntryId,
			userId: actor.userId,
			...(payload.projectId !== undefined ? { projectId: payload.projectId } : {}),
			content,
			shareWithAgents: payload.shareWithAgents ?? true,
			provenanceId,
			createdAt: timestamp,
			updatedAt: timestamp
		});
		await this.indexer.index(actor, entry);
		return entry;
	}

	private async applyUpdate(
		actor: ActorContext,
		payload: MemoryChangePayload,
		provenanceId: ProvenanceId
	): Promise<MemoryEntry> {
		if (!payload.memoryEntryId) throw new ValidationError('Memory updates require a target entry');
		const content = payload.content?.trim();
		if (!content) throw new ValidationError('Memory entry content is required');
		const target = await this.getActive(actor, payload.memoryEntryId);
		const timestamp = now();
		const replacement = await this.entries.insert(actor, {
			id: crypto.randomUUID() as MemoryEntryId,
			userId: actor.userId,
			...(target.projectId !== undefined ? { projectId: target.projectId } : {}),
			content,
			shareWithAgents: payload.shareWithAgents ?? target.shareWithAgents,
			provenanceId,
			replacesEntryId: target.id,
			createdAt: timestamp,
			updatedAt: timestamp
		});
		await this.softDelete(actor, target);
		await this.indexer.index(actor, replacement);
		return replacement;
	}

	private async applyRemove(
		actor: ActorContext,
		payload: MemoryChangePayload
	): Promise<MemoryEntry> {
		if (!payload.memoryEntryId) throw new ValidationError('Memory removals require a target entry');
		const target = await this.getActive(actor, payload.memoryEntryId);
		return this.softDelete(actor, target);
	}

	private async getActive(actor: ActorContext, memoryEntryId: MemoryEntryId): Promise<MemoryEntry> {
		const entry = await this.get(actor, memoryEntryId);
		if (entry.deletedAt) throw new NotFoundError('Memory entry was not found', { memoryEntryId });
		return entry;
	}

	private async softDelete(actor: ActorContext, entry: MemoryEntry): Promise<MemoryEntry> {
		const deleted = await this.entries.update(actor, {
			...entry,
			deletedAt: now(),
			updatedAt: now()
		});
		await this.indexer.index(actor, deleted);
		return deleted;
	}

	private async restore(actor: ActorContext, entry: MemoryEntry): Promise<MemoryEntry> {
		const { deletedAt: _deletedAt, ...withoutDeletion } = entry;
		void _deletedAt;
		const restored = await this.entries.update(actor, { ...withoutDeletion, updatedAt: now() });
		await this.indexer.index(actor, restored);
		return restored;
	}

	private async requireProject(actor: ActorContext, projectId: ProjectId): Promise<void> {
		if (!(await this.projects.findById(actor, projectId)))
			throw new NotFoundError('Memory project was not found');
	}
}

export type MemoryEntryReader = Pick<MemoryLibrary, 'get'>;
export type MemoryEntryLister = Pick<MemoryLibrary, 'list'>;
export type MemoryEntryCreator = Pick<MemoryLibrary, 'create'>;
export type MemoryEntryEditor = Pick<MemoryLibrary, 'update'>;
export type MemoryEntryDeleter = Pick<MemoryLibrary, 'remove'>;
export type MemoryChangeApplier = Pick<MemoryLibrary, 'apply' | 'revert'>;
