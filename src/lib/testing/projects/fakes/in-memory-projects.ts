import { decideProjectEntryMove } from '$lib/server/services/projects/catalog';
import type { ActorContext } from '$lib/models/identity';
import type {
	CreateFolderInput,
	CreateProjectInput,
	MoveProjectEntryInput,
	Project,
	ProjectId,
	ProjectDetails,
	RenameProjectInput,
	SetProjectSectionNumberingInput
} from '$lib/models/projects';
import type { Note, NoteId } from '$lib/models/notes';
import { ConflictError, NotFoundError, ValidationError } from '$lib/errors';
import type {
	FolderCreator,
	ProjectCreator,
	ProjectEditor,
	ProjectEntryMover,
	ProjectLister,
	ProjectReader,
	ProjectTreeReader
} from '$lib/server/services/projects/contracts';
import {
	noteBuilder,
	projectBuilder,
	testNoteId,
	testNow,
	testProjectId
} from '$lib/testing/workspace/fixtures/domain-builders';

export class InMemoryProjects
	implements
		ProjectCreator,
		ProjectReader,
		ProjectLister,
		ProjectEditor,
		ProjectTreeReader,
		FolderCreator,
		ProjectEntryMover
{
	projects: Project[] = [];
	entries: Note[] = [];
	private nextProject = 100;
	private nextEntry = 100;

	async create(actor: ActorContext, input: CreateProjectInput & ProjectDetails): Promise<Project> {
		const name = input.name;
		if (
			this.projects.some(
				(project) =>
					project.userId === actor.userId &&
					!project.archivedAt &&
					project.name.toLowerCase() === name.toLowerCase()
			)
		)
			throw new ConflictError('An active project with this name already exists');
		const project = projectBuilder({
			id: input.id ?? testProjectId(this.nextProject++),
			userId: actor.userId,
			name,
			description: input.description
		});
		this.projects.push(project);
		return project;
	}

	async get(actor: ActorContext, projectId: ProjectId): Promise<Project> {
		const project = this.projects.find(
			(candidate) => candidate.id === projectId && candidate.userId === actor.userId
		);
		if (!project) throw new NotFoundError('Project was not found');
		return project;
	}

	async list(actor: ActorContext): Promise<readonly Project[]> {
		return this.projects
			.filter((project) => project.userId === actor.userId && !project.archivedAt)
			.sort((a, b) => a.name.localeCompare(b.name));
	}

	async rename(actor: ActorContext, input: RenameProjectInput & ProjectDetails): Promise<Project> {
		const current = await this.get(actor, input.projectId);
		const name = input.name;
		const updated: Project = {
			...current,
			name,
			description: input.description,
			updatedAt: testNow
		};
		this.replaceProject(updated);
		return updated;
	}

	async archive(actor: ActorContext, projectId: ProjectId): Promise<Project> {
		const current = await this.get(actor, projectId);
		const updated = { ...current, archivedAt: testNow, updatedAt: testNow };
		this.replaceProject(updated);
		return updated;
	}

	async setSectionNumberingDefault(
		actor: ActorContext,
		input: SetProjectSectionNumberingInput
	): Promise<Project> {
		const current = await this.get(actor, input.projectId);
		const updated: Project = {
			...current,
			sectionNumberingDefault: input.enabled,
			updatedAt: testNow
		};
		this.replaceProject(updated);
		return updated;
	}

	async readEntries(actor: ActorContext, projectId: ProjectId): Promise<readonly Note[]> {
		await this.get(actor, projectId);
		const entries = this.entries
			.filter(
				(entry) =>
					entry.userId === actor.userId && entry.projectId === projectId && !entry.archivedAt
			)
			.sort((a, b) => a.position - b.position || a.createdAt.localeCompare(b.createdAt));
		return entries;
	}

	async createFolder(actor: ActorContext, input: CreateFolderInput): Promise<Note> {
		await this.get(actor, input.projectId);
		const name = input.name.trim();
		if (!name) throw new ValidationError('Folder name is required');
		if (input.parentId) {
			const parent = this.requireEntry(actor, input.projectId, input.parentId);
			if (parent.kind !== 'folder') throw new ValidationError('A parent must be a folder');
		}
		const position = this.entries.filter(
			(entry) => entry.projectId === input.projectId && entry.parentId === input.parentId
		).length;
		const folder = noteBuilder({
			id: input.id ?? testNoteId(this.nextEntry++),
			userId: actor.userId,
			projectId: input.projectId,
			kind: 'folder',
			position,
			title: name,
			...(input.parentId ? { parentId: input.parentId } : {})
		});
		this.entries.push(folder);
		return folder;
	}

	async move(actor: ActorContext, input: MoveProjectEntryInput): Promise<Note> {
		const decision = decideProjectEntryMove(input, await this.readEntries(actor, input.projectId));
		if (decision.kind === 'invalid') {
			if (decision.code === 'NOT_FOUND') throw new NotFoundError(decision.message);
			throw new ValidationError(decision.message);
		}
		const changes = new Map(decision.changes.map((change) => [change.id, change]));
		this.entries = this.entries.map((entry) => {
			const change = changes.get(entry.id);
			return change ? { ...entry, parentId: change.parentId, position: change.position } : entry;
		});
		return { ...decision.entry, parentId: decision.parentId, position: decision.position };
	}

	private requireEntry(actor: ActorContext, projectId: ProjectId, entryId: NoteId): Note {
		const entry = this.entries.find(
			(candidate) =>
				candidate.id === entryId &&
				candidate.projectId === projectId &&
				candidate.userId === actor.userId
		);
		if (!entry) throw new NotFoundError('Project entry was not found');
		return entry;
	}

	private replaceProject(project: Project): void {
		this.projects = this.projects.map((candidate) =>
			candidate.id === project.id ? project : candidate
		);
	}
}
