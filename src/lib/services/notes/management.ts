import type {
	ActorContext,
	CreateNoteInput,
	DateTime,
	Note,
	NoteId,
	NoteRevision,
	NoteRevisionId,
	NoteSummary,
	Project,
	SourceAnchor,
	SourceAnchorId,
	TextSelection
} from '$lib/models';
import {
	DEFAULT_PROJECT_NAME,
	findProseMirrorDocumentIssue,
	NotFoundError,
	OwnershipError,
	StaleRevisionError,
	ValidationError
} from '$lib/models';
import type { NoteRepository, ProjectRepository, SourceAnchorRepository } from '$lib/repositories';
import type {
	NoteArchiver,
	NoteCreator,
	NoteEditor,
	NotePublisher,
	NoteReader,
	NoteRevisionReader,
	NoteRevisionRecorder,
	NoteTreeReader,
	SelectionAnchorCreator,
	SourceAnchorRepairer
} from './contracts';

const now = (): DateTime => new Date().toISOString() as DateTime;

export class NoteManagementService
	implements
		NoteCreator,
		NoteReader,
		NoteTreeReader,
		NoteEditor,
		NoteArchiver,
		NotePublisher,
		NoteRevisionRecorder,
		NoteRevisionReader,
		SelectionAnchorCreator,
		SourceAnchorRepairer
{
	constructor(
		private readonly notes: NoteRepository,
		private readonly anchors: SourceAnchorRepository,
		private readonly projects: ProjectRepository
	) {}

	async get(actor: ActorContext, noteId: NoteId): Promise<Note> {
		const note = await this.notes.findById(actor, noteId);
		if (!note) throw new NotFoundError('Note was not found', { noteId });
		return note;
	}

	async list(actor: ActorContext, projectId?: Note['projectId']): Promise<readonly NoteSummary[]> {
		const notes = await this.notes.listActive(actor, projectId);
		return notes.filter((note) => note.kind !== 'skill');
	}

	async create(actor: ActorContext, input: CreateNoteInput): Promise<Note>;
	async create(actor: ActorContext, input: TextSelection): Promise<SourceAnchor>;
	async create(
		actor: ActorContext,
		input: CreateNoteInput | TextSelection
	): Promise<Note | SourceAnchor> {
		return 'text' in input ? this.createAnchor(actor, input) : this.createNote(actor, input);
	}

	async save(actor: ActorContext, candidate: Note): Promise<Note> {
		if (candidate.userId !== actor.userId)
			throw new OwnershipError('Cannot save another user’s note');
		const current = await this.get(actor, candidate.id);
		if (!candidate.title.trim()) throw new ValidationError('Note title is required');
		const documentIssue = findProseMirrorDocumentIssue(candidate.document);
		if (documentIssue)
			throw new ValidationError(
				`Invalid note document at ${documentIssue.path}: ${documentIssue.message}`
			);
		if (current.archivedAt) throw new ValidationError('Archived notes cannot be edited');
		if (candidate.projectId !== current.projectId || candidate.kind !== current.kind)
			throw new ValidationError('A save cannot move a note between projects or change its kind');
		if (candidate.parentId !== current.parentId || candidate.position !== current.position)
			throw new ValidationError('A content save cannot move or reorder a note');
		if (
			candidate.kind === 'folder' &&
			(candidate.plainText.trim() || candidate.document.content?.length)
		)
			throw new ValidationError('Folders cannot contain authored document content');
		if (candidate.currentRevision !== current.currentRevision)
			throw new StaleRevisionError('The note has changed since it was loaded');
		if (this.isUnchanged(current, candidate)) return current;
		const updated = await this.notes.updateIfRevision(
			actor,
			{
				...candidate,
				title: candidate.title.trim(),
				currentRevision: current.currentRevision + 1,
				updatedAt: now()
			},
			current.currentRevision
		);
		if (!updated) throw new StaleRevisionError('The note changed while it was being saved');
		return updated;
	}

	async archive(actor: ActorContext, noteId: NoteId): Promise<Note> {
		const note = await this.get(actor, noteId);
		if (note.archivedAt) throw new ValidationError('The note is already archived');
		if (note.kind === 'folder') {
			const active = await this.notes.listActive(actor, note.projectId);
			if (active.some((entry) => entry.parentId === noteId))
				throw new ValidationError('A folder with active contents cannot be archived');
		}
		return this.notes.update(actor, { ...note, archivedAt: now(), updatedAt: now() });
	}

	async restore(actor: ActorContext, noteId: NoteId): Promise<Note> {
		const note = await this.get(actor, noteId);
		if (!note.archivedAt) throw new ValidationError('The note is not archived');
		const { archivedAt, ...rest } = note;
		void archivedAt;
		return this.notes.update(actor, { ...rest, updatedAt: now() });
	}

	async record(
		actor: ActorContext,
		note: Note,
		provenance?: import('$lib/models').Provenance
	): Promise<void> {
		await this.get(actor, note.id);
		const revision: NoteRevision = {
			id: crypto.randomUUID() as NoteRevisionId,
			noteId: note.id,
			revision: note.currentRevision,
			title: note.title,
			document: note.document,
			plainText: note.plainText,
			...(provenance ? { provenanceId: provenance.id } : {}),
			createdAt: now()
		};
		await this.notes.insertRevision(actor, revision);
	}

	async latestRevision(actor: ActorContext, noteId: NoteId): Promise<NoteRevision | undefined> {
		await this.get(actor, noteId);
		const revisions = await this.notes.listRevisions(actor, noteId);
		return revisions.length > 0 ? revisions[revisions.length - 1] : undefined;
	}

	async markPublished(actor: ActorContext, noteId: NoteId): Promise<Note> {
		const note = await this.get(actor, noteId);
		return this.notes.update(actor, { ...note, publishedAt: now(), updatedAt: now() });
	}

	async repairForNote(actor: ActorContext, note: Note): Promise<readonly SourceAnchor[]> {
		await this.get(actor, note.id);
		const existing = await this.anchors.listForNote(actor, note.id);
		const repaired: SourceAnchor[] = [];
		for (const anchor of existing) {
			const first = note.plainText.indexOf(anchor.quote);
			if (first < 0 || first !== note.plainText.lastIndexOf(anchor.quote)) continue;
			repaired.push(
				await this.anchors.update(actor, {
					...anchor,
					from: first,
					to: first + anchor.quote.length,
					revision: note.currentRevision
				})
			);
		}
		return repaired;
	}

	private async createNote(actor: ActorContext, input: CreateNoteInput): Promise<Note> {
		const title = input.title.trim();
		if (!title) throw new ValidationError('Note title is required');
		const project = await this.resolveProject(actor, input.projectId);
		if (input.parentId) {
			const parent = await this.get(actor, input.parentId);
			if (parent.projectId !== project.id) throw new NotFoundError('Parent folder was not found');
			if (parent.kind !== 'folder') throw new ValidationError('A parent must be a folder');
		}
		const timestamp = now();
		return this.notes.insert(actor, {
			id: crypto.randomUUID() as NoteId,
			userId: actor.userId,
			projectId: project.id,
			kind: 'note',
			parentId: input.parentId,
			position: await this.notes.countSiblings(actor, project.id, input.parentId),
			title,
			document: { type: 'doc', content: [] },
			plainText: '',
			currentRevision: 1,
			isPinned: false,
			createdAt: timestamp,
			updatedAt: timestamp
		});
	}

	private async createAnchor(actor: ActorContext, selection: TextSelection): Promise<SourceAnchor> {
		if (!selection.text.trim()) throw new ValidationError('A non-empty selection is required');
		const note = await this.get(actor, selection.noteId);
		if (selection.revision !== note.currentRevision)
			throw new StaleRevisionError('The selected note revision is stale');
		if (
			!Number.isInteger(selection.from) ||
			!Number.isInteger(selection.to) ||
			selection.from < 0 ||
			selection.from > selection.to ||
			selection.to > note.plainText.length
		)
			throw new ValidationError('Selection offsets are outside the note');
		if (note.plainText.slice(selection.from, selection.to) !== selection.text)
			throw new ValidationError('Selection text does not match the note at those offsets');
		return this.anchors.insert(actor, {
			id: crypto.randomUUID() as SourceAnchorId,
			noteId: note.id,
			from: selection.from,
			to: selection.to,
			quote: selection.text,
			revision: selection.revision,
			createdAt: now()
		});
	}

	private async resolveProject(
		actor: ActorContext,
		projectId?: Note['projectId']
	): Promise<Project> {
		const project = projectId
			? await this.projects.findById(actor, projectId)
			: await this.projects.findFirstActive(actor);
		if (project) return project;
		if (projectId) throw new NotFoundError('Project was not found');
		return this.projects.insert(actor, { name: DEFAULT_PROJECT_NAME });
	}

	private isUnchanged(current: Note, candidate: Note): boolean {
		return (
			current.title === candidate.title &&
			current.plainText === candidate.plainText &&
			JSON.stringify(current.document) === JSON.stringify(candidate.document) &&
			current.parentId === candidate.parentId &&
			current.position === candidate.position &&
			current.isPinned === candidate.isPinned
		);
	}
}
