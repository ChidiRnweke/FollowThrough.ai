import type { IndexingResult } from '$lib/models/knowledge-search';
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

export interface MemoryEntryReader {
	get(actor: ActorContext, memoryEntryId: MemoryEntryId): Promise<MemoryEntry>;
}
export interface MemoryEntryLister {
	list(actor: ActorContext, filter: MemoryEntryListFilter): Promise<readonly MemoryEntry[]>;
}
export interface MemoryEntryCreator {
	create(actor: ActorContext, entry: MemoryEntry): Promise<MemoryEntry>;
}
export interface MemoryEntryEditor {
	getForEdit(actor: ActorContext, memoryEntryId: MemoryEntryId): Promise<MemoryEntry>;
	update(actor: ActorContext, entry: MemoryEntry): Promise<MemoryEntry>;
}
export interface MemoryEntryDeleter {
	remove(actor: ActorContext, memoryEntryId: MemoryEntryId): Promise<MemoryEntry>;
}
export interface MemoryChanges {
	validate(actor: ActorContext, payload: MemoryChangePayload): Promise<void>;
	apply(
		actor: ActorContext,
		payload: MemoryChangePayload,
		provenanceId: ProvenanceId
	): Promise<MemoryApplication<AppliedChange<MemoryEntry>>>;
}
export interface MemoryIndexer {
	index(actor: ActorContext, entry: MemoryEntry): Promise<IndexingResult>;
}

const now = (): DateTime => new Date().toISOString() as DateTime;
async function requireProject(
	projects: ProjectRepository,
	actor: ActorContext,
	projectId: ProjectId
): Promise<void> {
	if (!(await projects.findById(actor, projectId)))
		throw new NotFoundError('Memory project was not found');
}
async function readMemory(
	entries: MemoryEntryRepository,
	projects: ProjectRepository,
	actor: ActorContext,
	memoryEntryId: MemoryEntryId
): Promise<MemoryEntry> {
	const entry = await entries.findById(actor, memoryEntryId);
	if (!entry) throw new NotFoundError('Memory entry was not found', { memoryEntryId });
	if (entry.projectId) await requireProject(projects, actor, entry.projectId);
	return entry;
}
async function readEditableMemory(
	entries: MemoryEntryRepository,
	projects: ProjectRepository,
	actor: ActorContext,
	memoryEntryId: MemoryEntryId
): Promise<MemoryEntry> {
	const entry = await entries.findByIdForUpdate(actor, memoryEntryId);
	if (!entry || entry.deletedAt)
		throw new NotFoundError('Memory entry was not found', { memoryEntryId });
	if (entry.projectId) await requireProject(projects, actor, entry.projectId);
	return entry;
}
async function deleteMemory(
	entries: MemoryEntryRepository,
	actor: ActorContext,
	entry: MemoryEntry
): Promise<MemoryEntry> {
	const deleted = await entries.update(actor, {
		...entry,
		deletedAt: now(),
		updatedAt: now()
	});
	return deleted;
}
export class MemoryReadingService implements MemoryEntryReader, MemoryEntryLister {
	constructor(
		private readonly entries: MemoryEntryRepository,
		private readonly projects: ProjectRepository
	) {}
	get(actor: ActorContext, id: MemoryEntryId): Promise<MemoryEntry> {
		return readMemory(this.entries, this.projects, actor, id);
	}
	async list(actor: ActorContext, filter: MemoryEntryListFilter): Promise<readonly MemoryEntry[]> {
		if (filter.projectId) await requireProject(this.projects, actor, filter.projectId);
		return this.entries.list(actor, filter);
	}
}
export class MemoryWritingService implements MemoryEntryCreator, MemoryEntryEditor {
	constructor(
		private readonly entries: MemoryEntryRepository,
		private readonly projects: ProjectRepository
	) {}
	async create(actor: ActorContext, entry: MemoryEntry): Promise<MemoryEntry> {
		if (entry.userId !== actor.userId)
			throw new OwnershipError('Cannot create another user’s memory');
		if (entry.projectId) await requireProject(this.projects, actor, entry.projectId);
		return this.entries.insert(actor, entry);
	}
	async update(actor: ActorContext, entry: MemoryEntry): Promise<MemoryEntry> {
		if (entry.userId !== actor.userId)
			throw new OwnershipError('Cannot edit another user’s memory');
		if (entry.projectId) await requireProject(this.projects, actor, entry.projectId);
		return this.entries.update(actor, entry);
	}
	getForEdit(actor: ActorContext, id: MemoryEntryId): Promise<MemoryEntry> {
		return readEditableMemory(this.entries, this.projects, actor, id);
	}
}
export class MemoryLifecycleService implements MemoryEntryDeleter {
	constructor(
		private readonly entries: MemoryEntryRepository,
		private readonly projects: ProjectRepository
	) {}
	async remove(actor: ActorContext, memoryEntryId: MemoryEntryId): Promise<MemoryEntry> {
		const current = await readEditableMemory(this.entries, this.projects, actor, memoryEntryId);
		const entry = await this.entries.update(actor, {
			...current,
			deletedAt: now(),
			updatedAt: now()
		});
		return entry;
	}
}
export class MemoryProposalService implements MemoryChanges {
	constructor(
		private readonly entries: MemoryEntryRepository,
		private readonly projects: ProjectRepository,
		private readonly provenance: ProvenanceRepository
	) {}
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
		if (payload.scope === 'project') await requireProject(this.projects, actor, payload.projectId);
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
		if (payload.projectId) await requireProject(this.projects, actor, payload.projectId);
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
		const target = await readEditableMemory(
			this.entries,
			this.projects,
			actor,
			payload.memoryEntryId
		);
		this.requireScope(target, payload);
		const timestamp = now();
		const replacement = await this.entries.insert(actor, {
			id: crypto.randomUUID() as MemoryEntryId,
			userId: actor.userId,
			...(target.projectId !== undefined ? { projectId: target.projectId } : {}),
			content,
			type: target.type,
			shareWithAgents: payload.shareWithAgents ?? target.shareWithAgents,
			provenanceId,
			replacesEntryId: target.id,
			createdAt: timestamp,
			updatedAt: timestamp
		});
		const deleted = await deleteMemory(this.entries, actor, target);
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
		const target = await readEditableMemory(
			this.entries,
			this.projects,
			actor,
			payload.memoryEntryId
		);
		this.requireScope(target, payload);
		const entry = await deleteMemory(this.entries, actor, target);
		return { entry, changes: [{ kind: 'modified', before: target, after: entry }] };
	}
	private async getActive(actor: ActorContext, memoryEntryId: MemoryEntryId): Promise<MemoryEntry> {
		const entry = await readMemory(this.entries, this.projects, actor, memoryEntryId);
		if (entry.deletedAt) throw new NotFoundError('Memory entry was not found', { memoryEntryId });
		return entry;
	}
}
