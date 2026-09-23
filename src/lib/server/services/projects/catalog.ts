import type { ActorContext } from '$lib/models/identity';
import type {
	CreateProjectInput,
	MoveProjectEntryInput,
	Project,
	ProjectId,
	ProjectEntryReference,
	ProjectDetails,
	RenameProjectInput,
	SetProjectSectionNumberingInput
} from '$lib/models/projects';
import type { Note, NoteId } from '$lib/models/notes';
import { NotFoundError } from '$lib/errors';
import type {
	ProjectRepository,
	ProjectTreeRepository
} from '$lib/server/repositories/projects/projects';
export class ProjectCatalog {
	constructor(
		private readonly projects: ProjectRepository,
		private readonly tree: ProjectTreeRepository
	) {}

	async create(actor: ActorContext, input: CreateProjectInput & ProjectDetails): Promise<Project> {
		return this.projects.insert(actor, input);
	}

	async get(actor: ActorContext, projectId: ProjectId): Promise<Project> {
		const project = await this.projects.findById(actor, projectId);
		if (!project) throw new NotFoundError('Project was not found');
		return project;
	}

	list(actor: ActorContext): Promise<readonly Project[]> {
		return this.projects.listActive(actor);
	}

	async rename(actor: ActorContext, input: RenameProjectInput & ProjectDetails): Promise<Project> {
		await this.get(actor, input.projectId);
		return this.projects.update(actor, input);
	}

	async archive(actor: ActorContext, projectId: ProjectId): Promise<Project> {
		await this.get(actor, projectId);
		return this.projects.archive(actor, projectId);
	}

	async setSectionNumberingDefault(
		actor: ActorContext,
		input: SetProjectSectionNumberingInput
	): Promise<Project> {
		await this.get(actor, input.projectId);
		return this.projects.setSectionNumberingDefault(actor, input.projectId, input.enabled ?? null);
	}

	async readEntries(actor: ActorContext, projectId: ProjectId): Promise<readonly Note[]> {
		await this.get(actor, projectId);
		return this.tree.list(actor, projectId);
	}

	async readForMove(actor: ActorContext, projectId: ProjectId): Promise<readonly Note[]> {
		const project = await this.projects.findForWrite(actor, projectId);
		if (!project) throw new NotFoundError('Project was not found');
		return this.tree.list(actor, projectId);
	}

	persistOrder(
		actor: ActorContext,
		entries: readonly { id: NoteId; parentId: NoteId | undefined; position: number }[]
	): Promise<void> {
		return this.tree.persistOrder(actor, entries);
	}
}

/** A move rewrites both sibling lists while preserving their existing relative order. */
export function decideProjectEntryMove<
	Entry extends Pick<ProjectEntryReference, 'id' | 'parentId' | 'kind' | 'position'>
>(
	input: MoveProjectEntryInput,
	entries: readonly Entry[]
):
	| { kind: 'invalid'; code: 'VALIDATION' | 'NOT_FOUND'; message: string }
	| {
			kind: 'move';
			entry: Entry;
			parentId: NoteId | undefined;
			position: number;
			changes: readonly {
				readonly id: NoteId;
				readonly parentId: NoteId | undefined;
				readonly position: number;
			}[];
	  } {
	if (!Number.isInteger(input.position) || input.position < 0)
		return {
			kind: 'invalid',
			code: 'VALIDATION',
			message: 'Entry position must be a non-negative integer'
		};
	const entry = entries.find((candidate) => candidate.id === input.entryId);
	if (!entry) return { kind: 'invalid', code: 'NOT_FOUND', message: 'Project entry was not found' };
	if (input.parentId === entry.id)
		return { kind: 'invalid', code: 'VALIDATION', message: 'An entry cannot parent itself' };
	if (input.parentId) {
		const parent = entries.find((candidate) => candidate.id === input.parentId);
		if (!parent)
			return { kind: 'invalid', code: 'NOT_FOUND', message: 'Project entry was not found' };
		if (parent.kind !== 'folder')
			return { kind: 'invalid', code: 'VALIDATION', message: 'A parent must be a folder' };
		let cursor: NoteId | undefined = input.parentId;
		while (cursor) {
			if (cursor === entry.id)
				return {
					kind: 'invalid',
					code: 'VALIDATION',
					message: 'An entry cannot move below its descendant'
				};
			const ancestor = entries.find((candidate) => candidate.id === cursor);
			if (!ancestor)
				return { kind: 'invalid', code: 'NOT_FOUND', message: 'Project entry was not found' };
			cursor = ancestor.parentId;
		}
	}
	const oldSiblings = entries
		.filter((candidate) => candidate.parentId === entry.parentId && candidate.id !== entry.id)
		.sort((left, right) => left.position - right.position);
	const targetSiblings = (
		entry.parentId === input.parentId
			? oldSiblings
			: entries
					.filter((candidate) => candidate.parentId === input.parentId && candidate.id !== entry.id)
					.sort((left, right) => left.position - right.position)
	).slice();
	targetSiblings.splice(Math.min(input.position, targetSiblings.length), 0, entry);
	return {
		kind: 'move',
		entry,
		parentId: input.parentId,
		position: targetSiblings.indexOf(entry),
		changes: [
			...(entry.parentId === input.parentId
				? []
				: oldSiblings.map((sibling, position) => ({
						id: sibling.id,
						parentId: entry.parentId,
						position
					}))),
			...targetSiblings.map((sibling, position) => ({
				id: sibling.id,
				parentId: input.parentId,
				position
			}))
		]
	};
}
