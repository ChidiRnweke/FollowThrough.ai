import type { AgentFile } from '$lib/models/agent-files';
import type { NoteMarkdown } from '$lib/models/note-markdown';
import type { WithProjectChoice } from '$lib/models/projects';
import { noteEtag } from '$lib/models/notes';
import type { DateTime } from '$lib/models/workspace';
import type { AgentFileReferences } from '$lib/server/services/agent-files/virtual-files';
import type {
	NoteCreator,
	NoteDeletion,
	NoteTrashOperations
} from '$lib/server/services/notes/catalog';
import type { ProjectLister } from '$lib/server/services/projects/catalog';
import type { NoteEditingRules } from '$lib/services/notes/editing';
import type {
	NoteCreationRules,
	NotePublicationRules,
	NoteTrashRules
} from '$lib/services/notes/lifecycle';
import type { NotePresentation } from '$lib/services/notes/presentation';
import type { ProjectChoiceRules } from '$lib/services/projects/choice';
import type { ProvenancePresentation } from '$lib/services/provenance/presentation';
import type { ReferencePresentation } from '$lib/services/references/presentation';
import type { BacklinkPresentation } from '$lib/services/relationships/presentation';
import type { ISuggestionPresentationService } from '$lib/services/suggestions/presentation';
import type { TodoPresentation } from '$lib/services/todos/presentation';
import type { WorkspaceCommandRules } from '$lib/services/workspace/commands';

import { NotFoundError, StaleRevisionError, ValidationError } from '$lib/errors';
import type { Diagram } from '$lib/models/diagrams';
import type { ActorContext } from '$lib/models/identity';
import type {
	ArchiveNoteInput,
	ArchiveNoteOutput,
	CompareNoteRevisionsInput,
	CompareNoteRevisionsOutput,
	CreateNoteInput,
	CreateNoteOutput,
	DeleteNoteForeverInput,
	DeleteNoteForeverOutput,
	DiscardNoteDraftInput,
	DiscardNoteDraftOutput,
	EmptyNoteTrashInput,
	EmptyNoteTrashOutput,
	GetNoteRevisionInput,
	GetNoteRevisionOutput,
	GetNoteViewInput,
	ListNoteDocumentsInput,
	ListNoteRevisionsInput,
	ListNoteRevisionsOutput,
	ListNoteTrashInput,
	ListNoteTrashOutput,
	Note,
	NoteDocument,
	NoteId,
	NoteRevision,
	NoteSearchOptions,
	NoteView,
	PublishNoteInput,
	PublishNoteOutput,
	ReadNoteRevisionInput,
	ReadNoteRevisionOutput,
	RenameNoteInput,
	RenameNoteOutput,
	ReplaceNoteTextInput,
	ReplaceNoteTextOutput,
	RestoreNoteInput,
	RestoreNoteOutput,
	RestoreNoteRevisionInput,
	RestoreNoteRevisionOutput,
	SaveNoteInput,
	SaveNoteOutput,
	SearchNoteTextInput,
	SearchNoteTextOutput,
	SectionNumberingView,
	SetNoteSectionNumberingInput,
	SetNoteSectionNumberingOutput
} from '$lib/models/notes';
import {
	type ApplyReviewedNoteChangeOutput,
	type NoteChangeRequest,
	type NoteChangeReview,
	type NoteChangeTarget,
	type PreparedNoteChange
} from '$lib/models/notes';
import type {
	ArchiveLinkIssue,
	ArchiveNoteReference,
	ImportMarkdownArchiveInput,
	ImportMarkdownArchiveOutput,
	ParsedMarkdownNote
} from '$lib/models/projects';
import type { ReferenceView } from '$lib/models/references';
import type { BacklinkView } from '$lib/models/relationships';
import type { SuggestionView } from '$lib/models/suggestions';
import type { TodoView } from '$lib/models/todos';
import type { AtomicOperation as TransactionRunner } from '$lib/models/workspace';
import type {
	NoteMutationRequest,
	WorkspaceMutationCurrent,
	WorkspaceMutationResult
} from '$lib/models/workspace-mutations';
import type { DiagramLister } from '$lib/server/services/diagrams/library';
import type { UserPreferencesReader } from '$lib/server/services/identity/user-preferences';
import type { NoteArchiveImportPreparation } from '$lib/server/services/notes/import';
import type { NotePatchPreparation } from '$lib/server/services/notes/patches';
import type { NoteRevisionComparison } from '$lib/server/services/notes/revision-diff';
import type { ProjectReader } from '$lib/server/services/projects/catalog';
import type {
	BacklinkContextReader,
	NoteLinkReconciler,
	RelationshipFinder
} from '$lib/server/services/relationships/graph';
import type { WorkspaceMutationGuard } from '$lib/server/services/workspace/mutation-receipts';
import type { NoteReferences } from '$lib/services/notes/references';
import type { NoteSectionNumbering } from '$lib/services/notes/section-numbering';
import type { NoteTextSearch } from '$lib/services/notes/text-search';

import type {
	NoteReader,
	NoteTextSearcher,
	NoteTreeReader
} from '$lib/server/services/notes/catalog';

import type {
	NoteAttachmentRestorer,
	NoteEditor,
	NotePublisher,
	NoteRevisionReader,
	NoteRevisionRecorder,
	NoteSectionNumberingEditor,
	NoteTrashReader,
	SourceAnchorRepairer
} from '$lib/server/services/notes/catalog';
import type { NoteIndexing as NoteIndexer } from '$lib/server/services/knowledge-search/retrieval';
import type {
	ReferenceContextReader,
	ReferenceLister
} from '$lib/server/services/references/library';
import type {
	SuggestionContextReader,
	SuggestionExpirer,
	SuggestionLister
} from '$lib/server/services/suggestions/inbox';
import type { TodoContextReader, TodoLister } from '$lib/server/services/todos/catalog';

/**
 * Application boundary for notes: the read model, editing and publishing, offline sync,
 * and archival.
 *
 * Reads are assembled in parallel from many sources; writes go through the transaction
 * runner so a save and its link/index side effects commit atomically.
 */
export interface NotesController {
	importMarkdownArchive(input: ImportMarkdownArchiveInput): Promise<ImportMarkdownArchiveOutput>;
	prepareChange(input: NoteChangeRequest, target: NoteChangeTarget): Promise<NoteChangeReview>;
	applyReviewedChange(
		change: PreparedNoteChange,
		target: NoteChangeTarget
	): Promise<ApplyReviewedNoteChangeOutput>;
	synchronize(input: NoteMutationRequest): Promise<WorkspaceMutationResult>;
	/**
	 * Load the full read model for one note: the document, its ETag, backlinks,
	 * references, diagrams, todos, and pending suggestions.
	 *
	 * The pieces are fetched in parallel because nothing depends on another's result.
	 */
	get(input: GetNoteViewInput): Promise<ResolvedNoteView>;
	/**
	 * Pin or clear the note's own section-numbering choice, returning the resolved
	 * cascade so the caller sees the effect of its write without a second read.
	 */
	setSectionNumbering(input: SetNoteSectionNumberingInput): Promise<SetNoteSectionNumberingOutput>;
	/**
	 * Read the bodies of several notes at once, for a caller that renders documents rather
	 * than a note screen — the export dialog, which needs every selected note's content in
	 * the browser to rasterize its diagrams.
	 *
	 * Only the title and document travel; assembling a full {@link ResolvedNoteView} per note would
	 * fan out to six more readers each for nothing.
	 *
	 * @throws ValidationError if more notes are requested than one batch allows.
	 */
	listDocuments(input: ListNoteDocumentsInput): Promise<readonly NoteDocument[]>;
	/** The note as a document file: its read model with the Markdown body as file metadata. */
	readDocument(input: GetNoteViewInput): Promise<NoteDocumentFile>;
	/**
	 * Create a new, empty note.
	 *
	 * @throws ProjectChoiceRequiredError if the request names no project.
	 */
	create(input: WithProjectChoice<CreateNoteInput>): Promise<CreateNoteOutput>;
	/**
	 * Persist a note body and, in the same transaction, repair its anchors, reconcile its
	 * links, and re-index it.
	 *
	 * Link reconciliation is deliberately in the transaction: the note's links are
	 * derived from the document that just landed, so committing the body without the
	 * derived `mentions` rows would show backlinks the note no longer has.
	 */
	save(input: SaveNoteInput): Promise<SaveNoteOutput>;
	/**
	 * Submit a note revision with an ETag for optimistic concurrency, returning either a
	 * saved outcome or, when the base ETag is stale and the remote diverged, a conflict
	 * carrying the remote revision so the client can reconcile.
	 *
	 * A stale ETag whose remote content happens to be identical still resolves to
	 * 'saved', so retrying a save that actually landed is never reported as a conflict.
	 *
	 * @throws ValidationError if the base ETag does not describe the submitted revision.
	 */

	/**
	 * Publish the current state of a note, recording a revision so `discardDraft` can
	 * restore it later. Guards on the ETag so a concurrent edit cannot be silently
	 * published over.
	 *
	 * @throws StaleRevisionError if the note changed since it was loaded.
	 */
	publish(input: PublishNoteInput): Promise<PublishNoteOutput>;
	/**
	 * Discard the unpublished draft by restoring the latest published revision.
	 *
	 * @throws NotFoundError if no published revision exists yet — there is nothing to
	 * fall back to.
	 */
	discardDraft(input: DiscardNoteDraftInput): Promise<DiscardNoteDraftOutput>;
	/**
	 * Exact or regex search across the title and plain text of every active note,
	 * optionally scoped to one project. Title matches are reported for display but are
	 * not replaceable — {@link replaceText} rewrites document bodies only.
	 *
	 * @throws ValidationError if the query is empty or the regex is invalid.
	 */
	searchText(input: SearchNoteTextInput): Promise<SearchNoteTextOutput>;
	/**
	 * Replace every match of the query across the matching notes' documents, saving each
	 * through the regular save path so anchor repair, link reconciliation and re-indexing
	 * run as they would for a hand edit.
	 *
	 * The search is re-run server-side against current state rather than trusting client
	 * offsets, so a stale result list can only shrink what gets replaced, never corrupt it.
	 *
	 * @throws ValidationError if the query is empty or the regex is invalid.
	 */
	replaceText(input: ReplaceNoteTextInput): Promise<ReplaceNoteTextOutput>;
	/** Change a note's title, recording a revision and re-indexing in the same transaction. */
	rename(input: RenameNoteInput): Promise<RenameNoteOutput>;
	/** Archive a note and re-index it so archived notes drop out of search results. */
	archive(input: ArchiveNoteInput): Promise<ArchiveNoteOutput>;
	/**
	 * Bring an archived note back and re-index it so it is findable again.
	 *
	 * @throws ValidationError if the note is not archived.
	 */
	restore(input: RestoreNoteInput): Promise<RestoreNoteOutput>;
	/** List the archived notes a reader can still bring back, most recently archived first. */
	listTrash(input: ListNoteTrashInput): Promise<ListNoteTrashOutput>;
	/**
	 * Destroy an archived note for good, taking the archived notes inside a folder with it.
	 * Unlike {@link archive} this cannot be undone.
	 *
	 * @throws ValidationError if the note is not archived.
	 */
	deleteForever(input: DeleteNoteForeverInput): Promise<DeleteNoteForeverOutput>;
	/** Destroy every archived note the trash listing shows, optionally within one project. */
	emptyTrash(input: EmptyNoteTrashInput): Promise<EmptyNoteTrashOutput>;
	/**
	 * List the note's kept snapshots, newest first, marking the one currently published.
	 *
	 * Bodies are omitted; {@link getRevision} fetches one at a time, because a history list
	 * of a long note would otherwise ship twenty full documents to render a sidebar.
	 */
	listRevisions(input: ListNoteRevisionsInput): Promise<ListNoteRevisionsOutput>;
	/**
	 * Read one snapshot in full, so a reader can diff it against the note as it stands.
	 *
	 * @throws NotFoundError if the revision does not belong to the note or has been pruned.
	 */
	getRevision(input: GetNoteRevisionInput): Promise<GetNoteRevisionOutput>;
	/**
	 * Read one snapshot's plain text without its ProseMirror document — the cheap way to
	 * see an old version in full when {@link compareRevisions}' diff is not enough.
	 *
	 * @throws NotFoundError if the revision does not belong to the note or has been pruned.
	 */
	readRevision(input: ReadNoteRevisionInput): Promise<ReadNoteRevisionOutput>;
	/**
	 * Diff one snapshot against a baseline — another snapshot when `againstRevisionId` is
	 * given, otherwise the note's current published revision — returning a compact unified
	 * patch so a caller can see what changed without loading either body in full. The
	 * patch reads from the baseline to the requested snapshot, i.e. the change restoring
	 * that snapshot would apply.
	 *
	 * @throws NotFoundError if either revision is unknown or pruned, or the note has no
	 * published revision to use as the default baseline.
	 */
	compareRevisions(input: CompareNoteRevisionsInput): Promise<CompareNoteRevisionsOutput>;
	/**
	 * Roll the note back to a snapshot by copying it forward as a new current revision,
	 * restoring the attachments that snapshot was taken with.
	 *
	 * History stays append-only: nothing between the snapshot and now is rewritten, so the
	 * rollback is itself undoable from the same list.
	 *
	 * @throws NotFoundError if the revision does not belong to the note or has been pruned.
	 */
	restoreRevision(input: RestoreNoteRevisionInput): Promise<RestoreNoteRevisionOutput>;
}
/** Everything the {@link NotesController} needs, injected so it can be built and tested without real stores. */
export interface NotesDependencies {
	readonly agentFiles: AgentFileReferences;
	readonly projectChoice: ProjectChoiceRules;
	readonly projectLister: ProjectLister;

	readonly archiveImport: NoteArchiveImportPreparation;
	readonly patchPreparation: NotePatchPreparation;
	readonly revisionComparison: NoteRevisionComparison;
	readonly todoPresentation: TodoPresentation;
	readonly textSearch: NoteTextSearch;
	readonly noteReferences: NoteReferences;
	readonly sections: NoteSectionNumbering;
	readonly noteEditingRules: NoteEditingRules;
	readonly notePublicationRules: NotePublicationRules;
	readonly noteTrashRules: NoteTrashRules;
	readonly noteCreationRules: NoteCreationRules;
	readonly notePresentation: NotePresentation;
	readonly suggestionPresentation: ISuggestionPresentationService;
	markdown: NoteMarkdown;
	syncMutations: WorkspaceMutationGuard;
	syncRetry: 'database-only' | 'never';
	noteReader: NoteReader;
	noteTreeReader: NoteTreeReader;
	noteTextSearcher: NoteTextSearcher;
	noteCreation: NoteCreator;
	noteSectionNumbering: NoteSectionNumberingEditor;
	projectReader: ProjectReader;
	userPreferences: UserPreferencesReader;
	relationshipFinder: RelationshipFinder;
	backlinkContextReader: BacklinkContextReader;
	referenceLister: ReferenceLister;
	referenceContextReader: ReferenceContextReader;
	diagramLister: DiagramLister;
	todoLister: TodoLister;
	todoContextReader: TodoContextReader;
	suggestionLister: SuggestionLister;
	suggestionExpirer: SuggestionExpirer;
	suggestionContextReader: SuggestionContextReader;
	noteEditor: NoteEditor;
	noteLinkReconciler: NoteLinkReconciler;
	noteTrash: NoteTrashOperations;
	noteTrashReader: NoteTrashReader;
	noteDeletion: NoteDeletion;
	notePublisher: NotePublisher;
	revisionRecorder: NoteRevisionRecorder;
	revisionReader: NoteRevisionReader;
	attachmentRestorer: NoteAttachmentRestorer;
	anchorRepairer: SourceAnchorRepairer;
	noteIndexer: NoteIndexer;
	transactionRunner: TransactionRunner;
}

/** Both text-search entry points reject a pattern they cannot run before touching any state. */
const assertValidSearch = (
	rules: NoteTextSearch,
	query: string,
	options: NoteSearchOptions
): void => {
	if (rules.valid(query, options)) return;
	throw new ValidationError(
		options.regex
			? 'The search pattern is not a valid regular expression'
			: 'A search query is required'
	);
};

async function importAttempt<T>(
	work: () => Promise<T>
): Promise<{ kind: 'success'; value: T } | { kind: 'failure'; message: string }> {
	try {
		return { kind: 'success', value: await work() };
	} catch (error) {
		return {
			kind: 'failure',
			message: error instanceof Error ? error.message : 'Could not be imported.'
		};
	}
}

function importedFolderId(folders: ReadonlyMap<string, NoteId>, path: string): NoteId {
	const id = folders.get(path);
	if (!id) throw new Error(`Imported parent folder is missing: ${path}`);
	return id;
}

export class Notes implements NotesController {
	/** Import keeps independent successes and uses the ordinary note write consequences. */
	async importMarkdownArchive(
		input: ImportMarkdownArchiveInput
	): Promise<ImportMarkdownArchiveOutput> {
		const failed: { path: string; message: string }[] = [];
		const folders = new Map<string, NoteId>();
		const blocked = new Set<string>();
		const plan = this.dependencies.archiveImport.prepare(input.notes);
		for (const path of plan.folders) {
			const parts = path.split('/');
			const parentPath = parts.slice(0, -1).join('/');
			if (blocked.has(parentPath)) {
				blocked.add(path);
				failed.push({ path, message: `Parent folder ${parentPath} could not be imported.` });
				continue;
			}
			const parentId = parentPath ? importedFolderId(folders, parentPath) : input.parentId;
			const result = await importAttempt(() =>
				this.createDocument(
					{
						projectId: input.projectId,
						title: parts.at(-1)!,
						...(parentId ? { parentId } : {})
					},
					'folder'
				)
			);
			if (result.kind === 'failure') {
				blocked.add(path);
				failed.push({ path, message: result.message });
			} else folders.set(path, result.value.id);
		}

		const pending: { note: ParsedMarkdownNote; created: Note }[] = [];
		const references: ArchiveNoteReference[] = [];
		for (const note of input.notes) {
			const folderPath = note.folders.join('/');
			if (blocked.has(folderPath)) {
				failed.push({
					path: note.path,
					message: `Destination folder ${folderPath} could not be imported.`
				});
				references.push({ path: note.path, title: note.title, outcome: { kind: 'failed' } });
				continue;
			}
			const parentId = folderPath ? importedFolderId(folders, folderPath) : input.parentId;
			const result = await importAttempt(() =>
				this.create({
					projectId: input.projectId,
					title: plan.titles.get(note)!,
					...(parentId ? { parentId } : {})
				})
			);
			if (result.kind === 'failure') {
				failed.push({ path: note.path, message: result.message });
				references.push({ path: note.path, title: note.title, outcome: { kind: 'failed' } });
			} else {
				pending.push({ note, created: result.value.note });
				references.push({
					path: note.path,
					title: note.title,
					outcome: { kind: 'created', id: result.value.note.id }
				});
			}
		}
		const unresolvedLinks: ArchiveLinkIssue[] = [];
		const resolvedNotes = this.dependencies.archiveImport.resolve(
			pending.map(({ note }) => note),
			references
		);
		for (const { note, created } of pending) {
			if (!note.markdown.trim()) continue;
			const resolved = resolvedNotes.get(note)!;
			unresolvedLinks.push(...resolved.issues);
			const result = await importAttempt(() =>
				this.save({
					note: { ...created, ...this.dependencies.markdown.read(resolved.markdown) }
				})
			);
			if (result.kind === 'failure') failed.push({ path: note.path, message: result.message });
		}
		return {
			importedNoteIds: pending.map(({ created }) => created.id),
			createdFolderIds: [...folders.values()],
			skipped: input.skipped,
			failed,
			unmappedFrontmatterKeys: plan.unmappedFrontmatterKeys,
			unresolvedLinks
		};
	}
	async synchronize(input: NoteMutationRequest): Promise<WorkspaceMutationResult> {
		try {
			return await this.dependencies.transactionRunner.run(
				async () => {
					const target = this.workspaceCommandRules.mutationResource(input.command);
					const prepared = await this.dependencies.syncMutations.prepare(input, {
						identity: target,
						key: this.workspaceCommandRules.workspaceResourceKey(target)
					});
					if (prepared.kind === 'finished') return prepared.result;
					await this.applySynchronizedCommand(input, prepared.current);
					return this.dependencies.syncMutations.complete(input, target);
				},
				{ retry: this.dependencies.syncRetry }
			);
		} catch (error) {
			if (!(error instanceof Error)) throw error;
			return this.dependencies.syncMutations.reject(error);
		}
	}

	private async applySynchronizedCommand(
		input: NoteMutationRequest,
		current: WorkspaceMutationCurrent
	): Promise<void> {
		const command = input.command;
		switch (command.kind) {
			case 'createNote':
				await this.create(command);
				break;
			case 'renameNote':
				await this.rename(command);
				break;
			case 'archiveNote':
				await this.archive(command);
				break;
			case 'restoreNote':
				await this.restore(command);
				break;
			case 'publishNote':
				if (current.kind !== 'found' || current.snapshot.value.type !== 'notes')
					throw new ValidationError('The note no longer exists');
				await this.publish({
					noteId: command.noteId,
					baseEtag: noteEtag(
						current.snapshot.value.value.id,
						current.snapshot.value.value.currentRevision
					)
				});
				break;
			case 'discardNoteDraft':
				await this.discardDraft(command);
				break;
			case 'noteNumbering':
				await this.setSectionNumbering(command);
				break;
			case 'saveNote': {
				if (current.kind !== 'found' || current.snapshot.value.type !== 'notes')
					throw new ValidationError('The note no longer exists');
				await this.save({
					note: this.dependencies.noteEditingRules.edit(
						current.snapshot.value.value,
						command,
						current.snapshot.value.value.updatedAt
					)
				});
				if (command.sectionNumbering !== undefined)
					await this.dependencies.noteSectionNumbering.setSectionNumbering({
						noteId: command.noteId,
						enabled: command.sectionNumbering ?? undefined
					});
				break;
			}
		}
	}

	constructor(
		private readonly actor: ActorContext,
		private readonly backlinkPresentation: BacklinkPresentation,
		private readonly referencePresentation: ReferencePresentation,
		private readonly workspaceCommandRules: WorkspaceCommandRules,
		private readonly provenancePresentation: ProvenancePresentation,
		private readonly dependencies: NotesDependencies
	) {}
	async get(input: GetNoteViewInput): Promise<ResolvedNoteView> {
		await this.dependencies.suggestionExpirer.expire();
		const [note, relationships, references, diagrams, todos, pending] = await Promise.all([
			this.dependencies.noteReader.get(input.noteId),
			this.dependencies.relationshipFinder.findForNote(input.noteId),
			this.dependencies.referenceLister.listForNote(input.noteId),
			this.dependencies.diagramLister.listForNote(input.noteId),
			this.dependencies.todoLister.list({ noteId: input.noteId }),
			this.dependencies.suggestionLister.listByStatus('proposed', input.noteId)
		]);
		const [backlinkContexts, referenceContexts, todoContexts, pendingContexts, sectionNumbering] =
			await Promise.all([
				this.dependencies.backlinkContextReader.readContexts(relationships),
				this.dependencies.referenceContextReader.readContexts(references),
				this.dependencies.todoContextReader.readContexts(todos),
				this.dependencies.suggestionContextReader.readContexts(pending),
				this.resolveSectionNumbering(note)
			]);
		return this.dependencies.notePresentation.assemble({
			note,
			backlinks: backlinkContexts.map(({ relationship, source, target }) =>
				this.backlinkPresentation.assembleBacklinkView(relationship, source, target)
			),
			references: referenceContexts.map(({ reference, anchor }) =>
				this.referencePresentation.assembleReferenceView(reference, { anchor })
			),
			diagrams,
			todos: todoContexts.map((context) =>
				this.dependencies.todoPresentation.view(context.todo, context)
			),
			pendingSuggestions: pendingContexts.map(({ suggestion, note, anchor, provenance }) =>
				this.dependencies.suggestionPresentation.assembleSuggestionView(suggestion, {
					note,
					anchor,
					origin: this.provenancePresentation.provenanceOrigin(provenance)
				})
			),
			sectionNumbering
		});
	}

	async setSectionNumbering(
		input: SetNoteSectionNumberingInput
	): Promise<SetNoteSectionNumberingOutput> {
		const note = await this.dependencies.noteSectionNumbering.setSectionNumbering(input);
		// The resolved view is returned so the caller sees the effect of its own
		// write without a second round trip.
		return { sectionNumbering: await this.resolveSectionNumbering(note) };
	}

	/** The note's cascade resolved across the note, its project and the app default. */
	private async resolveSectionNumbering(note: Note): Promise<SectionNumberingView> {
		const [project, preferences] = await Promise.all([
			this.dependencies.projectReader.get(note.projectId),
			this.dependencies.userPreferences.get()
		]);
		return this.dependencies.sections.view(
			note.sectionNumbering,
			project.sectionNumberingDefault,
			preferences.sectionNumberingDefault
		);
	}

	async listDocuments(input: ListNoteDocumentsInput): Promise<readonly NoteDocument[]> {
		return Promise.all(
			input.noteIds.map(async (noteId) => {
				const note = await this.dependencies.noteReader.get(noteId);
				return { id: note.id, title: note.title, document: note.document };
			})
		);
	}
	async readDocument(input: GetNoteViewInput): Promise<NoteDocumentFile> {
		const view = await this.get(input);
		const markdown = this.dependencies.markdown.write(view.note.document);
		return { view, file: this.dependencies.agentFiles.noteMetadata(view.note, markdown) };
	}
	async create(input: WithProjectChoice<CreateNoteInput>): Promise<CreateNoteOutput> {
		const projectId =
			input.projectId ??
			this.dependencies.projectChoice.requireChoice(
				await this.dependencies.projectLister.list(),
				'create a note'
			);
		return { note: await this.createDocument({ ...input, projectId }, 'note') };
	}
	private async createDocument(input: CreateNoteInput, kind: 'note' | 'folder'): Promise<Note> {
		return this.dependencies.transactionRunner.run(async () => {
			const facts = await this.dependencies.noteCreation.creationFacts(input);
			const decision = this.dependencies.noteCreationRules.decideCreation(
				{
					id: input.id ?? (crypto.randomUUID() as NoteId),
					title: input.title,
					parentId: input.parentId,
					kind: kind
				},
				facts,
				new Date().toISOString() as DateTime
			);
			if (decision.kind === 'invalid') {
				if (decision.code === 'NOT_FOUND') throw new NotFoundError(decision.message);
				throw new ValidationError(decision.message);
			}
			return this.dependencies.noteCreation.insert(decision.note);
		});
	}

	/** Resolve a body proposal once; later approval never reruns the requested patch. */
	async prepareChange(
		input: NoteChangeRequest,
		target: NoteChangeTarget
	): Promise<NoteChangeReview> {
		const note = await this.dependencies.noteReader.get(input.noteId);
		if (target === 'skill' && note.kind !== 'skill')
			return {
				kind: 'failure',
				problems: ['This tool only edits skill notes; this note is not a skill.']
			};
		if (note.archivedAt || note.kind === 'folder')
			return {
				kind: 'failure',
				problems: ['Only active authored content can receive a reviewed note change.']
			};
		const base = { revision: note.currentRevision, title: note.title, document: note.document };
		if (input.kind === 'replace')
			return {
				kind: 'prepared',
				change: {
					noteId: note.id,
					base,
					result: this.dependencies.markdown.read(input.markdown),
					operation: { kind: 'replace' }
				}
			};
		const patch = this.dependencies.patchPreparation.prepare(
			this.dependencies.markdown.write(note.document),
			input.edits
		);
		if (!patch.ok) return { kind: 'failure', problems: patch.problems };
		return {
			kind: 'prepared',
			change: {
				noteId: note.id,
				base,
				result: this.dependencies.markdown.read(patch.markdown),
				operation: {
					kind: 'patch',
					appliedEdits: patch.appliedEdits,
					matchedTexts: patch.matchedTexts
				}
			}
		};
	}

	async applyReviewedChange(
		change: PreparedNoteChange,
		target: NoteChangeTarget
	): Promise<ApplyReviewedNoteChangeOutput> {
		try {
			return await this.dependencies.transactionRunner.run(
				async (): Promise<ApplyReviewedNoteChangeOutput> => {
					const current = await this.dependencies.noteReader.get(change.noteId);
					if (target === 'skill' && current.kind !== 'skill')
						throw new ValidationError(
							'This tool only edits skill notes; this note is not a skill.'
						);
					if (current.archivedAt || current.kind === 'folder')
						throw new ValidationError(
							'Only active authored content can receive a reviewed note change'
						);
					if (
						current.title === change.base.title &&
						current.plainText === change.result.plainText &&
						JSON.stringify(current.document) === JSON.stringify(change.result.document)
					)
						return { kind: 'unchanged', note: current };
					if (current.currentRevision !== change.base.revision)
						return {
							kind: 'failure',
							code: 'STALE_REVIEW',
							message:
								'The note changed after this review was prepared. Read the note and request a new review.'
						};
					const saved = await this.save({ note: { ...current, ...change.result } });
					return { kind: 'saved', note: saved.note };
				}
			);
		} catch (error) {
			if (error instanceof StaleRevisionError)
				return {
					kind: 'failure',
					code: 'STALE_REVIEW',
					message:
						'The note changed while this review was being saved. Read the note and request a new review.'
				};
			throw error;
		}
	}

	private async persistEditedNote(candidate: Note): Promise<Note> {
		const current = await this.dependencies.noteEditor.getForEdit(candidate);
		const decision = this.dependencies.noteEditingRules.prepareSave(
			current,
			candidate,
			new Date().toISOString() as DateTime
		);
		return decision.kind === 'unchanged'
			? decision.note
			: this.dependencies.noteEditor.persistEdit(decision.write);
	}

	save(input: SaveNoteInput): Promise<SaveNoteOutput> {
		return this.dependencies.transactionRunner.run(async () => {
			const note = await this.persistEditedNote(input.note);
			const anchors = await this.dependencies.anchorRepairer.repairForNote(note);
			// In the same transaction as the save, beside anchor repair: the note's links are
			// derived from the document that just landed, so a committed body with stale
			// `mentions` rows would show backlinks the note no longer has.
			await this.dependencies.noteLinkReconciler.reconcile(
				note,
				this.dependencies.noteReferences.links(note.document)
			);
			await this.dependencies.noteIndexer.indexNote(note);
			return {
				note,
				etag: noteEtag(note.id, note.currentRevision),
				repairedAnchorIds: anchors.map((anchor) => anchor.id)
			};
		});
	}
	publish(input: PublishNoteInput): Promise<PublishNoteOutput> {
		return this.dependencies.transactionRunner.run(async () => {
			const note = await this.dependencies.notePublisher.getForPublication(input.noteId);
			if (noteEtag(note.id, note.currentRevision) !== input.baseEtag)
				throw new StaleRevisionError('The note has changed since it was loaded');
			const write = this.dependencies.notePublicationRules.preparePublication(
				note,
				new Date().toISOString() as DateTime
			);
			await this.dependencies.revisionRecorder.record(note);
			const published = await this.dependencies.notePublisher.persistPublication(write);
			return { note: published, etag: noteEtag(published.id, published.currentRevision) };
		});
	}
	async discardDraft(input: DiscardNoteDraftInput): Promise<DiscardNoteDraftOutput> {
		return this.dependencies.transactionRunner.run(async () => {
			const note = await this.dependencies.noteEditor.getForEdit({
				id: input.noteId,
				userId: this.actor.userId
			});
			const revision = (await this.dependencies.revisionReader.revisions(input.noteId)).find(
				(candidate) => candidate.revision === note.publishedRevision
			);
			if (!revision)
				throw new NotFoundError('No published version exists for this note', {
					noteId: input.noteId
				});
			const restored = await this.persistEditedNote({
				...note,
				title: revision.title,
				document: revision.document,
				plainText: revision.plainText
			});
			await this.dependencies.attachmentRestorer.restoreAttachments(input.noteId, revision.id);
			await this.dependencies.anchorRepairer.repairForNote(restored);
			await this.dependencies.noteLinkReconciler.reconcile(
				restored,
				this.dependencies.noteReferences.links(restored.document)
			);
			await this.dependencies.noteIndexer.indexNote(restored);
			return { note: restored, etag: noteEtag(restored.id, restored.currentRevision) };
		});
	}
	async searchText(input: SearchNoteTextInput): Promise<SearchNoteTextOutput> {
		const options = { regex: input.regex, caseSensitive: input.caseSensitive };
		assertValidSearch(this.dependencies.textSearch, input.query, options);
		const targets = await this.dependencies.noteTextSearcher.listSearchable(input.projectId);
		return { hits: this.dependencies.textSearch.search(targets, input.query, options) };
	}
	async replaceText(input: ReplaceNoteTextInput): Promise<ReplaceNoteTextOutput> {
		const options = { regex: input.regex, caseSensitive: input.caseSensitive };
		assertValidSearch(this.dependencies.textSearch, input.query, options);
		const scope = input.noteIds === undefined ? undefined : new Set(input.noteIds);
		return this.dependencies.transactionRunner.run(async () => {
			const targets = await this.dependencies.noteTextSearcher.listSearchable(input.projectId);
			const hits = this.dependencies.textSearch.search(
				scope === undefined ? targets : targets.filter((target) => scope.has(target.id)),
				input.query,
				options
			);
			let replacedNotes = 0;
			let replacedMatches = 0;
			for (const hit of hits) {
				// Title matches are display-only: replace rewrites document bodies, never titles.
				if (hit.matches.length === 0) continue;
				const note = await this.dependencies.noteReader.get(hit.noteId);
				const result = this.dependencies.textSearch.replace(
					note.document,
					input.query,
					input.replacement,
					options
				);
				if (result === undefined) continue;
				await this.save({
					note: { ...note, document: result.document, plainText: result.plainText }
				});
				replacedNotes += 1;
				replacedMatches += result.replaced;
			}
			return { replacedNotes, replacedMatches };
		});
	}
	rename(input: RenameNoteInput): Promise<RenameNoteOutput> {
		return this.dependencies.transactionRunner.run(async () => {
			const current = await this.dependencies.noteReader.get(input.noteId);
			const note = await this.persistEditedNote({
				...current,
				title: input.title
			});
			// Deliberately no revision: history is bounded, and a title correction should not
			// evict a snapshot of the body somebody may still want back.
			await this.dependencies.noteIndexer.indexNote(note);
			return { note };
		});
	}
	async archive(input: ArchiveNoteInput): Promise<ArchiveNoteOutput> {
		return this.dependencies.transactionRunner.run(async () => {
			const facts = await this.dependencies.noteTrash.archiveFacts(input.noteId);
			const decision = this.dependencies.noteTrashRules.changeTrash(
				facts.note,
				{ kind: 'archive', ...facts },
				new Date().toISOString() as DateTime
			);
			if (decision.kind === 'invalid') throw new ValidationError(decision.message);
			const note = await this.dependencies.noteTrash.persistTrash(decision.note);
			await this.dependencies.noteIndexer.indexNote(note);
			return { note };
		});
	}
	async restore(input: RestoreNoteInput): Promise<RestoreNoteOutput> {
		return this.dependencies.transactionRunner.run(async () => {
			const facts = await this.dependencies.noteTrash.restoreFacts(input.noteId);
			const decision = this.dependencies.noteTrashRules.changeTrash(
				facts.note,
				{ kind: 'restore', ...facts },
				new Date().toISOString() as DateTime
			);
			if (decision.kind === 'invalid') throw new ValidationError(decision.message);
			const note = await this.dependencies.noteTrash.persistTrash(decision.note);
			await this.dependencies.noteIndexer.indexNote(note);
			return { note };
		});
	}
	async listTrash(input: ListNoteTrashInput): Promise<ListNoteTrashOutput> {
		return { notes: await this.dependencies.noteTrashReader.listTrashed(input.projectId) };
	}
	async deleteForever(input: DeleteNoteForeverInput): Promise<DeleteNoteForeverOutput> {
		// Transactional because a folder is several deletes: a half-purged folder would
		// leave its contents at the project root with no way back to where they were.
		return this.dependencies.transactionRunner.run(async () => {
			const facts = await this.dependencies.noteDeletion.deletionFacts(input.noteId);
			const decision = this.dependencies.noteTrashRules.prepareDeletion(facts.trashed, {
				kind: 'one',
				note: facts.note
			});
			if (decision.kind === 'invalid') throw new ValidationError(decision.message);
			const deletedNotes = await this.dependencies.noteDeletion.persistDeletion(decision.notes);
			return { deletedNoteIds: deletedNotes.map((note) => note.id), deletedNotes };
		});
	}
	async emptyTrash(input: EmptyNoteTrashInput): Promise<EmptyNoteTrashOutput> {
		return this.dependencies.transactionRunner.run(async () => {
			const trashed = await this.dependencies.noteDeletion.trashForDeletion(input.projectId);
			const decision = this.dependencies.noteTrashRules.prepareDeletion(trashed, { kind: 'all' });
			if (decision.kind === 'invalid') throw new ValidationError(decision.message);
			const deletedNotes = await this.dependencies.noteDeletion.persistDeletion(decision.notes);
			return { deletedNoteIds: deletedNotes.map((note) => note.id), deletedNotes };
		});
	}
	async listRevisions(input: ListNoteRevisionsInput): Promise<ListNoteRevisionsOutput> {
		const [note, revisions] = await Promise.all([
			this.dependencies.noteReader.get(input.noteId),
			this.dependencies.revisionReader.revisions(input.noteId)
		]);
		return {
			revisions: revisions.map((revision) => ({
				id: revision.id,
				revision: revision.revision,
				title: revision.title,
				createdAt: revision.createdAt,
				isPublished: revision.revision === note.publishedRevision
			}))
		};
	}
	async getRevision(input: GetNoteRevisionInput): Promise<GetNoteRevisionOutput> {
		const revision = await this.dependencies.revisionReader.revisionById(
			input.noteId,
			input.revisionId
		);
		if (!revision)
			throw new NotFoundError('That version of the note is no longer available', {
				noteId: input.noteId,
				revisionId: input.revisionId
			});
		return { revision };
	}
	async readRevision(input: ReadNoteRevisionInput): Promise<ReadNoteRevisionOutput> {
		const [note, revision] = await Promise.all([
			this.dependencies.noteReader.get(input.noteId),
			this.dependencies.revisionReader.revisionById(input.noteId, input.revisionId)
		]);
		if (!revision)
			throw new NotFoundError('That version of the note is no longer available', {
				noteId: input.noteId,
				revisionId: input.revisionId
			});
		return {
			revision: revision.revision,
			title: revision.title,
			plainText: revision.plainText,
			createdAt: revision.createdAt,
			isPublished: revision.revision === note.publishedRevision
		};
	}
	async compareRevisions(input: CompareNoteRevisionsInput): Promise<CompareNoteRevisionsOutput> {
		const revision = await this.dependencies.revisionReader.revisionById(
			input.noteId,
			input.revisionId
		);
		if (!revision)
			throw new NotFoundError('That version of the note is no longer available', {
				noteId: input.noteId,
				revisionId: input.revisionId
			});
		let baseline: NoteRevision | undefined;
		if (input.againstRevisionId) {
			baseline = await this.dependencies.revisionReader.revisionById(
				input.noteId,
				input.againstRevisionId
			);
			if (!baseline)
				throw new NotFoundError('That version of the note is no longer available', {
					noteId: input.noteId,
					revisionId: input.againstRevisionId
				});
		} else {
			const note = await this.dependencies.noteReader.get(input.noteId);
			baseline = (await this.dependencies.revisionReader.revisions(input.noteId)).find(
				(candidate) => candidate.revision === note.publishedRevision
			);
			if (!baseline)
				throw new NotFoundError('The note has no published version to compare against', {
					noteId: input.noteId
				});
		}
		return {
			diff: this.dependencies.revisionComparison.compare(baseline, revision),
			againstRevision: baseline.revision
		};
	}
	async restoreRevision(input: RestoreNoteRevisionInput): Promise<RestoreNoteRevisionOutput> {
		return this.dependencies.transactionRunner.run(async () => {
			const [note, revision] = await Promise.all([
				this.dependencies.noteReader.get(input.noteId),
				this.dependencies.revisionReader.revisionById(input.noteId, input.revisionId)
			]);
			if (!revision)
				throw new NotFoundError('That version of the note is no longer available', {
					noteId: input.noteId,
					revisionId: input.revisionId
				});
			const restored = await this.persistEditedNote({
				...note,
				title: revision.title,
				document: revision.document,
				plainText: revision.plainText
			});
			await this.dependencies.attachmentRestorer.restoreAttachments(input.noteId, input.revisionId);
			await this.dependencies.anchorRepairer.repairForNote(restored);
			await this.dependencies.noteLinkReconciler.reconcile(
				restored,
				this.dependencies.noteReferences.links(restored.document)
			);
			await this.dependencies.noteIndexer.indexNote(restored);
			return { note: restored, etag: noteEtag(restored.id, restored.currentRevision) };
		});
	}
}

type ResolvedNoteView = NoteView<BacklinkView, ReferenceView, Diagram, TodoView, SuggestionView>;
/** A note's read model and the virtual file that carries its Markdown body. */
export interface NoteDocumentFile {
	readonly view: ResolvedNoteView;
	readonly file: AgentFile['metadata'];
}
