import type { AppliedChange } from '$lib/models/proposal-effects';
import type { ActorContext } from '$lib/models/identity';
import type {
	MemoryChangePayload,
	MemoryEntry,
	MemoryEntryId,
	MemoryApplication
} from '$lib/models/memory';
import type { DateTime } from '$lib/models/workspace';
import type { ProjectId } from '$lib/models/projects';
import type { ProvenanceId } from '$lib/models/provenance';
import { NotFoundError, OwnershipError, ValidationError } from '$lib/errors';
import type { MemoryEntryRepository } from '$lib/server/repositories/memory';
import type { ProjectRepository } from '$lib/server/repositories/projects/projects';
import type { ProvenanceRepository } from '$lib/server/repositories/provenance/provenance';
import type { MemoryEntryListFilter } from '$lib/server/repositories/memory';

const now = (): DateTime => new Date().toISOString() as DateTime;

export class MemoryLibrary {
	constructor(
		private readonly entries: MemoryEntryRepository,
		private readonly projects: ProjectRepository,
		private readonly provenance: ProvenanceRepository
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

	async create(actor: ActorContext, entry: MemoryEntry): Promise<MemoryEntry> {
		if (entry.userId !== actor.userId)
			throw new OwnershipError('Cannot create another user’s memory');
		if (entry.projectId) await this.requireProject(actor, entry.projectId);
		return this.entries.insert(actor, entry);
	}

	async update(actor: ActorContext, entry: MemoryEntry): Promise<MemoryEntry> {
		if (entry.userId !== actor.userId)
			throw new OwnershipError('Cannot edit another user’s memory');
		return this.entries.update(actor, entry);
	}

	async remove(actor: ActorContext, memoryEntryId: MemoryEntryId): Promise<MemoryEntry> {
		const current = await this.getActive(actor, memoryEntryId);
		const entry = await this.entries.update(actor, {
			...current,
			deletedAt: now(),
			updatedAt: now()
		});
		return entry;
	}

	async apply(
		actor: ActorContext,
		payload: MemoryChangePayload,
		provenanceId: ProvenanceId
	): Promise<MemoryApplication<AppliedChange<MemoryEntry>>> {
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

	async validate(actor: ActorContext, payload: MemoryChangePayload): Promise<void> {
		if (payload.scope === 'project') await this.requireProject(actor, payload.projectId);
		if (payload.operation !== 'add') {
			const target = await this.getActive(actor, payload.memoryEntryId);
			this.requireScope(target, payload);
		}
	}

	private requireScope(target: MemoryEntry, payload: MemoryChangePayload): void {
		if (target.projectId !== payload.projectId)
			throw new ValidationError('Memory target does not belong to the requested scope');
	}

	private async applyAdd(
		actor: ActorContext,
		payload: Extract<MemoryChangePayload, { operation: 'add' }>,
		provenanceId: ProvenanceId
	): Promise<MemoryApplication<AppliedChange<MemoryEntry>>> {
		const content = payload.content.trim();
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
		return { entry, changes: [{ kind: 'created', after: entry }] };
	}

	private async applyUpdate(
		actor: ActorContext,
		payload: Extract<MemoryChangePayload, { operation: 'update' }>,
		provenanceId: ProvenanceId
	): Promise<MemoryApplication<AppliedChange<MemoryEntry>>> {
		const content = payload.content.trim();
		if (!content) throw new ValidationError('Memory entry content is required');
		const target = await this.getForEdit(actor, payload.memoryEntryId);
		this.requireScope(target, payload);
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
		const deleted = await this.softDelete(actor, target);
		return {
			entry: replacement,
			changes: [
				{ kind: 'modified', before: target, after: deleted },
				{ kind: 'created', after: replacement }
			]
		};
	}

	private async applyRemove(
		actor: ActorContext,
		payload: Extract<MemoryChangePayload, { operation: 'remove' }>
	): Promise<MemoryApplication<AppliedChange<MemoryEntry>>> {
		const target = await this.getForEdit(actor, payload.memoryEntryId);
		this.requireScope(target, payload);
		const entry = await this.softDelete(actor, target);
		return { entry, changes: [{ kind: 'modified', before: target, after: entry }] };
	}

	async getForEdit(actor: ActorContext, memoryEntryId: MemoryEntryId): Promise<MemoryEntry> {
		const entry = await this.entries.findByIdForUpdate(actor, memoryEntryId);
		if (!entry || entry.deletedAt)
			throw new NotFoundError('Memory entry was not found', { memoryEntryId });
		return entry;
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
		return deleted;
	}

	private async requireProject(actor: ActorContext, projectId: ProjectId): Promise<void> {
		if (!(await this.projects.findById(actor, projectId)))
			throw new NotFoundError('Memory project was not found');
	}
}
