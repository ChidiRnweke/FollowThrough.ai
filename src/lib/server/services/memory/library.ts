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
	get(memoryEntryId: MemoryEntryId): Promise<MemoryEntry>;
}
export interface MemoryEntryLister {
	list(filter: MemoryEntryListFilter): Promise<readonly MemoryEntry[]>;
}
export interface MemoryEntryCreator {
	create(entry: MemoryEntry): Promise<MemoryEntry>;
}
export interface MemoryEntryEditor {
	getForEdit(memoryEntryId: MemoryEntryId): Promise<MemoryEntry>;
	update(entry: MemoryEntry): Promise<MemoryEntry>;
}
export interface MemoryEntryDeleter {
	remove(memoryEntryId: MemoryEntryId): Promise<MemoryEntry>;
}
export interface MemoryLibrary
	extends
		MemoryEntryReader,
		MemoryEntryLister,
		MemoryEntryCreator,
		MemoryEntryEditor,
		MemoryEntryDeleter {}
export interface MemoryChanges {
	validate(payload: MemoryChangePayload): Promise<void>;
	apply(
		payload: MemoryChangePayload,
		provenanceId: ProvenanceId
	): Promise<MemoryApplication<AppliedChange<MemoryEntry>>>;
}

async function requireProject(projects: ProjectRepository, projectId: ProjectId): Promise<void> {
	if (!(await projects.findById(projectId)))
		throw new NotFoundError('Memory project was not found');
}
async function readMemory(
	entries: MemoryEntryRepository,
	projects: ProjectRepository,
	memoryEntryId: MemoryEntryId
): Promise<MemoryEntry> {
	const entry = await entries.findById(memoryEntryId);
	if (!entry) throw new NotFoundError('Memory entry was not found', { memoryEntryId });
	if (entry.projectId) await requireProject(projects, entry.projectId);
	return entry;
}
async function readEditableMemory(
	entries: MemoryEntryRepository,
	projects: ProjectRepository,
	memoryEntryId: MemoryEntryId
): Promise<MemoryEntry> {
	const entry = await entries.findByIdForUpdate(memoryEntryId);
	if (!entry || entry.deletedAt)
		throw new NotFoundError('Memory entry was not found', { memoryEntryId });
	if (entry.projectId) await requireProject(projects, entry.projectId);
	return entry;
}
async function deleteMemory(
	entries: MemoryEntryRepository,
	entry: MemoryEntry,
	deletedAt: DateTime
): Promise<MemoryEntry> {
	const deleted = await entries.update({
		...entry,
		deletedAt,
		updatedAt: deletedAt
	});
	return deleted;
}
export class MemoryLibraryService implements MemoryLibrary {
	constructor(
		private readonly actor: ActorContext,
		private readonly entries: MemoryEntryRepository,
		private readonly projects: ProjectRepository,
		private readonly now: () => DateTime
	) {}
	get(id: MemoryEntryId): Promise<MemoryEntry> {
		return readMemory(this.entries, this.projects, id);
	}
	async list(filter: MemoryEntryListFilter): Promise<readonly MemoryEntry[]> {
		if (filter.projectId) await requireProject(this.projects, filter.projectId);
		return this.entries.list(filter);
	}
	async create(entry: MemoryEntry): Promise<MemoryEntry> {
		if (entry.userId !== this.actor.userId)
			throw new OwnershipError('Cannot create another user’s memory');
		if (entry.projectId) await requireProject(this.projects, entry.projectId);
		return this.entries.insert(entry);
	}
	async update(entry: MemoryEntry): Promise<MemoryEntry> {
		if (entry.userId !== this.actor.userId)
			throw new OwnershipError('Cannot edit another user’s memory');
		if (entry.projectId) await requireProject(this.projects, entry.projectId);
		return this.entries.update(entry);
	}
	getForEdit(id: MemoryEntryId): Promise<MemoryEntry> {
		return readEditableMemory(this.entries, this.projects, id);
	}
	async remove(memoryEntryId: MemoryEntryId): Promise<MemoryEntry> {
		return deleteMemory(
			this.entries,
			await readEditableMemory(this.entries, this.projects, memoryEntryId),
			this.now()
		);
	}
}
export class MemoryProposalService implements MemoryChanges {
	constructor(
		private readonly actor: ActorContext,
		private readonly entries: MemoryEntryRepository,
		private readonly projects: ProjectRepository,
		private readonly provenance: ProvenanceRepository,
		private readonly now: () => DateTime
	) {}
	async apply(
		payload: MemoryChangePayload,
		provenanceId: ProvenanceId
	): Promise<MemoryApplication<AppliedChange<MemoryEntry>>> {
		if (!(await this.provenance.findById(provenanceId)))
			throw new NotFoundError('Memory change provenance was not found');
		switch (payload.operation) {
			case 'add':
				return this.applyAdd(payload, provenanceId);
			case 'update':
				return this.applyUpdate(payload, provenanceId);
			case 'remove':
				return this.applyRemove(payload);
		}
	}
	async validate(payload: MemoryChangePayload): Promise<void> {
		if (payload.scope === 'project') await requireProject(this.projects, payload.projectId);
		if (payload.operation !== 'add') {
			const target = await this.getActive(payload.memoryEntryId);
			this.requireScope(target, payload);
		}
	}
	private requireScope(target: MemoryEntry, payload: MemoryChangePayload): void {
		if (target.projectId !== payload.projectId)
			throw new ValidationError('Memory target does not belong to the requested scope');
	}
	private async applyAdd(
		payload: Extract<MemoryChangePayload, { operation: 'add' }>,
		provenanceId: ProvenanceId
	): Promise<MemoryApplication<AppliedChange<MemoryEntry>>> {
		const content = payload.content.trim();
		if (!content) throw new ValidationError('Memory entry content is required');
		if (payload.projectId) await requireProject(this.projects, payload.projectId);
		const timestamp = this.now();
		const entry = await this.entries.insert({
			id: crypto.randomUUID() as MemoryEntryId,
			userId: this.actor.userId,
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
		payload: Extract<MemoryChangePayload, { operation: 'update' }>,
		provenanceId: ProvenanceId
	): Promise<MemoryApplication<AppliedChange<MemoryEntry>>> {
		const content = payload.content.trim();
		if (!content) throw new ValidationError('Memory entry content is required');
		const target = await readEditableMemory(this.entries, this.projects, payload.memoryEntryId);
		this.requireScope(target, payload);
		const timestamp = this.now();
		const replacement = await this.entries.insert({
			id: crypto.randomUUID() as MemoryEntryId,
			userId: this.actor.userId,
			...(target.projectId !== undefined ? { projectId: target.projectId } : {}),
			content,
			type: target.type,
			shareWithAgents: payload.shareWithAgents ?? target.shareWithAgents,
			provenanceId,
			replacesEntryId: target.id,
			createdAt: timestamp,
			updatedAt: timestamp
		});
		const deleted = await deleteMemory(this.entries, target, this.now());
		return {
			entry: replacement,
			changes: [
				{ kind: 'modified', before: target, after: deleted },
				{ kind: 'created', after: replacement }
			]
		};
	}
	private async applyRemove(
		payload: Extract<MemoryChangePayload, { operation: 'remove' }>
	): Promise<MemoryApplication<AppliedChange<MemoryEntry>>> {
		const target = await readEditableMemory(this.entries, this.projects, payload.memoryEntryId);
		this.requireScope(target, payload);
		const entry = await deleteMemory(this.entries, target, this.now());
		return { entry, changes: [{ kind: 'modified', before: target, after: entry }] };
	}
	private async getActive(memoryEntryId: MemoryEntryId): Promise<MemoryEntry> {
		const entry = await readMemory(this.entries, this.projects, memoryEntryId);
		if (entry.deletedAt) throw new NotFoundError('Memory entry was not found', { memoryEntryId });
		return entry;
	}
}
