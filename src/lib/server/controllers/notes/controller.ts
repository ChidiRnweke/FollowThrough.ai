import { mutationResource } from '$lib/services/workspace/commands';
import { assembleSuggestionView } from '$lib/services/suggestions/presentation';
import { provenanceOrigin } from '$lib/services/provenance/presentation';
import type { WorkspaceMutationCurrent } from '$lib/models/workspace-mutations';
import type { IndexingResult } from '$lib/models/knowledge-search';
import type { IEmbeddings } from '$lib/server/services/knowledge-search/embeddings';
import type { ContentIndex } from '$lib/server/services/knowledge-search/indexing';
import {
	assembleNoteView,
	applyNotePatch,
	describeNotePatchFailure,
	type NoteChangeRequest,
	type NoteChangeTarget,
	type NoteChangeReview,
	type PreparedNoteChange,
	type ApplyReviewedNoteChangeOutput
} from '$lib/models/notes';
import type { NoteMarkdown } from '$lib/server/services/notes/contracts';
import { applyNoteDraftEdit } from '$lib/models/notes';
import type { BacklinkView } from '$lib/models/relationships';
import type { ReferenceView } from '$lib/models/references';
import type { Diagram } from '$lib/models/diagrams';
import type { TodoView } from '$lib/models/todos';
import type { SuggestionView } from '$lib/models/suggestions';
import type { NoteMutationRequest, WorkspaceMutationResult } from '$lib/models/workspace-mutations';
import type { WorkspaceMutationReceipts } from '$lib/server/services/workspace/mutation-receipts';
import type { ActorContext } from '$lib/models/identity';
import type {
	ImportMarkdownArchiveInput,
	ImportMarkdownArchiveOutput,
	ArchiveNoteReference,
	ArchiveLinkIssue,
	ParsedMarkdownNote
} from '$lib/models/projects';
import {
	resolveArchiveLinks,
	indexArchiveReferences,
	uniqueTitleIn,
	unmappedFrontmatterKeys
} from '$lib/server/services/notes/import';
import type { FolderCreator } from '$lib/server/services/projects/contracts';
import type {
	ArchiveNoteInput,
	ArchiveNoteOutput,
	CompareNoteRevisionsInput,
	CompareNoteRevisionsOutput,
	CreateNoteInput,
	CreateNoteOutput,
	DiscardNoteDraftInput,
	DiscardNoteDraftOutput,
	GetNoteRevisionInput,
	GetNoteRevisionOutput,
	GetNoteViewInput,
	ListNoteDocumentsInput,
	ListNoteRevisionsInput,
	ListNoteRevisionsOutput,
	ListNoteTrashInput,
	ListNoteTrashOutput,
	DeleteNoteForeverInput,
	DeleteNoteForeverOutput,
	EmptyNoteTrashInput,
	EmptyNoteTrashOutput,
	RestoreNoteInput,
	RestoreNoteOutput,
	RestoreNoteRevisionInput,
	RestoreNoteRevisionOutput,
	Note,
	NoteId,
	NoteDocument,
	NoteRevision,
	NoteSearchOptions,
	NoteView,
	PublishNoteInput,
	PublishNoteOutput,
	RenameNoteInput,
	RenameNoteOutput,
	ReadNoteRevisionInput,
	ReadNoteRevisionOutput,
	SaveNoteInput,
	SaveNoteOutput,
	SearchNoteTextInput,
	SearchNoteTextOutput,
	SectionNumberingView,
	SetNoteSectionNumberingInput,
	SetNoteSectionNumberingOutput,
	ReplaceNoteTextInput,
	ReplaceNoteTextOutput
} from '$lib/models/notes';
import {
	MAX_NOTE_DOCUMENTS,
	collectNoteLinkTargets,
	diffNoteRevisionTexts,
	noteEtag,
	noteMatchesEtag,
	sectionNumberingView
} from '$lib/models/notes';
import { NotFoundError, StaleRevisionError, ValidationError } from '$lib/errors';
import {
	buildNoteSearchPattern,
	replaceInNoteDocument,
	searchNoteTargets
} from '$lib/services/notes/text-search';
import type { AtomicOperation as TransactionRunner } from '$lib/models/workspace';
import type { ProjectReader } from '$lib/server/services/projects/contracts';
import type { UserPreferencesReader } from '$lib/server/services/identity/user-preferences';
import type {
	BacklinkViewAssembler,
	NoteLinkReconciler,
	RelationshipFinder
} from '$lib/server/services/relationships/contracts';
import type { DiagramLister } from '$lib/server/services/diagrams/contracts';
import type {
	NoteCreator,
	NoteReader,
	NoteTextSearcher,
	NoteTreeReader
} from '$lib/server/services/notes/contracts';
import type {
	ReferenceLister,
	ReferenceViewAssembler
} from '$lib/server/services/references/contracts';
import type {
	SuggestionLister,
	SuggestionExpirer,
	SuggestionContextReader
} from '$lib/server/services/suggestions/contracts';
import type { TodoLister, TodoViewAssembler } from '$lib/server/services/todos/contracts';
import type {
	NoteArchiver,
	NoteAttachmentRestorer,
	NoteEditor,
	NoteIndexer,
	NotePublisher,
	NotePurger,
	NoteRevisionRecorder,
	NoteRevisionReader,
	NoteSectionNumberingEditor,
	NoteTrashReader,
	SourceAnchorRepairer
} from '$lib/server/services/notes/contracts';

/**
 * Application boundary for notes: the read model, editing and publishing, offline sync,
 * and archival.
 *
 * Reads are assembled in parallel from many sources; writes go through the transaction
 * runner so a save and its link/index side effects commit atomically.
 */
export interface NotesController {
	importMarkdownArchive(
		actor: ActorContext,
		input: ImportMarkdownArchiveInput
	): Promise<ImportMarkdownArchiveOutput>;
	prepareChange(
		actor: ActorContext,
		input: NoteChangeRequest,
		target: NoteChangeTarget
	): Promise<NoteChangeReview>;
	applyReviewedChange(
		actor: ActorContext,
		change: PreparedNoteChange,
		target: NoteChangeTarget
	): Promise<ApplyReviewedNoteChangeOutput>;
	synchronize(actor: ActorContext, input: NoteMutationRequest): Promise<WorkspaceMutationResult>;
	/**
	 * Load the full read model for one note: the document, its ETag, backlinks,
	 * references, diagrams, todos, and pending suggestions.
	 *
	 * The pieces are fetched in parallel because nothing depends on another's result.
	 */
	get(actor: ActorContext, input: GetNoteViewInput): Promise<ResolvedNoteView>;
	/**
	 * Pin or clear the note's own section-numbering choice, returning the resolved
	 * cascade so the caller sees the effect of its write without a second read.
	 */
	setSectionNumbering(
		actor: ActorContext,
		input: SetNoteSectionNumberingInput
	): Promise<SetNoteSectionNumberingOutput>;
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
	listDocuments(
		actor: ActorContext,
		input: ListNoteDocumentsInput
	): Promise<readonly NoteDocument[]>;
	/** Create a new, empty note. */
	create(actor: ActorContext, input: CreateNoteInput): Promise<CreateNoteOutput>;
	/**
	 * Persist a note body and, in the same transaction, repair its anchors, reconcile its
	 * links, and re-index it.
	 *
	 * Link reconciliation is deliberately in the transaction: the note's links are
	 * derived from the document that just landed, so committing the body without the
	 * derived `mentions` rows would show backlinks the note no longer has.
	 */
	save(actor: ActorContext, input: SaveNoteInput): Promise<SaveNoteOutput>;
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
	publish(actor: ActorContext, input: PublishNoteInput): Promise<PublishNoteOutput>;
	/**
	 * Discard the unpublished draft by restoring the latest published revision.
	 *
	 * @throws NotFoundError if no published revision exists yet — there is nothing to
	 * fall back to.
	 */
	discardDraft(actor: ActorContext, input: DiscardNoteDraftInput): Promise<DiscardNoteDraftOutput>;
	/**
	 * Exact or regex search across the title and plain text of every active note,
	 * optionally scoped to one project. Title matches are reported for display but are
	 * not replaceable — {@link replaceText} rewrites document bodies only.
	 *
	 * @throws ValidationError if the query is empty or the regex is invalid.
	 */
	searchText(actor: ActorContext, input: SearchNoteTextInput): Promise<SearchNoteTextOutput>;
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
	replaceText(actor: ActorContext, input: ReplaceNoteTextInput): Promise<ReplaceNoteTextOutput>;
	/** Change a note's title, recording a revision and re-indexing in the same transaction. */
	rename(actor: ActorContext, input: RenameNoteInput): Promise<RenameNoteOutput>;
	/** Archive a note and re-index it so archived notes drop out of search results. */
	archive(actor: ActorContext, input: ArchiveNoteInput): Promise<ArchiveNoteOutput>;
	/**
	 * Bring an archived note back and re-index it so it is findable again.
	 *
	 * @throws ValidationError if the note is not archived.
	 */
	restore(actor: ActorContext, input: RestoreNoteInput): Promise<RestoreNoteOutput>;
	/** List the archived notes a reader can still bring back, most recently archived first. */
	listTrash(actor: ActorContext, input: ListNoteTrashInput): Promise<ListNoteTrashOutput>;
	/**
	 * Destroy an archived note for good, taking the archived notes inside a folder with it.
	 * Unlike {@link archive} this cannot be undone.
	 *
	 * @throws ValidationError if the note is not archived.
	 */
	deleteForever(
		actor: ActorContext,
		input: DeleteNoteForeverInput
	): Promise<DeleteNoteForeverOutput>;
	/** Destroy every archived note the trash listing shows, optionally within one project. */
	emptyTrash(actor: ActorContext, input: EmptyNoteTrashInput): Promise<EmptyNoteTrashOutput>;
	/**
	 * List the note's kept snapshots, newest first, marking the one currently published.
	 *
	 * Bodies are omitted; {@link getRevision} fetches one at a time, because a history list
	 * of a long note would otherwise ship twenty full documents to render a sidebar.
	 */
	listRevisions(
		actor: ActorContext,
		input: ListNoteRevisionsInput
	): Promise<ListNoteRevisionsOutput>;
	/**
	 * Read one snapshot in full, so a reader can diff it against the note as it stands.
	 *
	 * @throws NotFoundError if the revision does not belong to the note or has been pruned.
	 */
	getRevision(actor: ActorContext, input: GetNoteRevisionInput): Promise<GetNoteRevisionOutput>;
	/**
	 * Read one snapshot's plain text without its ProseMirror document — the cheap way to
	 * see an old version in full when {@link compareRevisions}' diff is not enough.
	 *
	 * @throws NotFoundError if the revision does not belong to the note or has been pruned.
	 */
	readRevision(actor: ActorContext, input: ReadNoteRevisionInput): Promise<ReadNoteRevisionOutput>;
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
	compareRevisions(
		actor: ActorContext,
		input: CompareNoteRevisionsInput
	): Promise<CompareNoteRevisionsOutput>;
	/**
	 * Roll the note back to a snapshot by copying it forward as a new current revision,
	 * restoring the attachments that snapshot was taken with.
	 *
	 * History stays append-only: nothing between the snapshot and now is rewritten, so the
	 * rollback is itself undoable from the same list.
	 *
	 * @throws NotFoundError if the revision does not belong to the note or has been pruned.
	 */
	restoreRevision(
		actor: ActorContext,
		input: RestoreNoteRevisionInput
	): Promise<RestoreNoteRevisionOutput>;
}
/** Everything the {@link NotesController} needs, injected so it can be built and tested without real stores. */
export interface NotesDependencies {
	folderCreator: FolderCreator;
	markdown: NoteMarkdown;
	syncMutations: Pick<WorkspaceMutationReceipts, 'prepare' | 'complete' | 'reject'>;
	syncRetry: 'database-only' | 'never';
	noteReader: NoteReader;
	noteTreeReader: NoteTreeReader;
	noteTextSearcher: NoteTextSearcher;
	noteCreator: NoteCreator;
	noteSectionNumbering: NoteSectionNumberingEditor;
	projectReader: ProjectReader;
	userPreferences: UserPreferencesReader;
	relationshipFinder: RelationshipFinder;
	backlinkViewAssembler: BacklinkViewAssembler;
	referenceLister: ReferenceLister;
	referenceViewAssembler: ReferenceViewAssembler;
	diagramLister: DiagramLister;
	todoLister: TodoLister;
	todoViewAssembler: TodoViewAssembler;
	suggestionLister: SuggestionLister;
	suggestionExpirer: SuggestionExpirer;
	suggestionContextReader: SuggestionContextReader;
	noteEditor: NoteEditor;
	noteLinkReconciler: NoteLinkReconciler;
	noteArchiver: NoteArchiver;
	noteTrashReader: NoteTrashReader;
	notePurger: NotePurger;
	notePublisher: NotePublisher;
	revisionRecorder: NoteRevisionRecorder;
	revisionReader: NoteRevisionReader;
	attachmentRestorer: NoteAttachmentRestorer;
	anchorRepairer: SourceAnchorRepairer;
	indexEmbeddings: IEmbeddings;
	indexWriter: Pick<ContentIndex, 'complete'>;
	noteIndexer: NoteIndexer;
	transactionRunner: TransactionRunner;
}

/** Both text-search entry points reject a pattern they cannot run before touching any state. */
const assertValidSearch = (query: string, options: NoteSearchOptions): void => {
	if (buildNoteSearchPattern(query, options) !== undefined) return;
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
		actor: ActorContext,
		input: ImportMarkdownArchiveInput
	): Promise<ImportMarkdownArchiveOutput> {
		const failed: { path: string; message: string }[] = [];
		const folders = new Map<string, NoteId>();
		const blocked = new Set<string>();
		const paths = new Set<string>();
		for (const note of input.notes)
			for (let depth = 1; depth <= note.folders.length; depth++)
				paths.add(note.folders.slice(0, depth).join('/'));
		for (const path of [...paths].sort((a, b) => a.split('/').length - b.split('/').length)) {
			const parts = path.split('/');
			const parentPath = parts.slice(0, -1).join('/');
			if (blocked.has(parentPath)) {
				blocked.add(path);
				failed.push({ path, message: `Parent folder ${parentPath} could not be imported.` });
				continue;
			}
			const parentId = parentPath ? importedFolderId(folders, parentPath) : input.parentId;
			const result = await importAttempt(() =>
				this.dependencies.folderCreator.createFolder(actor, {
					projectId: input.projectId,
					name: parts.at(-1)!,
					...(parentId ? { parentId } : {})
				})
			);
			if (result.kind === 'failure') {
				blocked.add(path);
				failed.push({ path, message: result.message });
			} else folders.set(path, result.value.id);
		}

		const takenByFolder = new Map<string, Set<string>>();
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
			const taken = takenByFolder.get(folderPath) ?? new Set<string>();
			takenByFolder.set(folderPath, taken);
			const result = await importAttempt(() =>
				this.create(actor, {
					projectId: input.projectId,
					title: uniqueTitleIn(taken, note.title),
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
		const referenceIndex = indexArchiveReferences(references);
		for (const { note, created } of pending) {
			if (!note.markdown.trim()) continue;
			const resolved = resolveArchiveLinks(note, referenceIndex);
			unresolvedLinks.push(...resolved.issues);
			const result = await importAttempt(() =>
				this.save(actor, {
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
			unmappedFrontmatterKeys: unmappedFrontmatterKeys(input.notes),
			unresolvedLinks
		};
	}
	async synchronize(
		actor: ActorContext,
		input: NoteMutationRequest
	): Promise<WorkspaceMutationResult> {
		try {
			return await this.dependencies.transactionRunner.run(
				async () => {
					const target = mutationResource(input.command);
					const prepared = await this.dependencies.syncMutations.prepare(actor, input, target);
					if (prepared.kind === 'finished') return prepared.result;
					await this.applySynchronizedCommand(actor, input, prepared.current);
					return this.dependencies.syncMutations.complete(actor, input, target);
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
		input: NoteMutationRequest,
		current: WorkspaceMutationCurrent
	): Promise<void> {
		const command = input.command;
		switch (command.kind) {
			case 'createNote':
				await this.create(actor, command);
				break;
			case 'renameNote':
				await this.rename(actor, command);
				break;
			case 'archiveNote':
				await this.archive(actor, command);
				break;
			case 'restoreNote':
				await this.restore(actor, command);
				break;
			case 'publishNote':
				if (current.kind !== 'found' || current.snapshot.value.type !== 'notes')
					throw new ValidationError('The note no longer exists');
				await this.publish(actor, {
					noteId: command.noteId,
					baseEtag: noteEtag(current.snapshot.value.value)
				});
				break;
			case 'discardNoteDraft':
				await this.discardDraft(actor, command);
				break;
			case 'noteNumbering':
				await this.setSectionNumbering(actor, command);
				break;
			case 'saveNote': {
				if (current.kind !== 'found' || current.snapshot.value.type !== 'notes')
					throw new ValidationError('The note no longer exists');
				await this.save(actor, {
					note: applyNoteDraftEdit(
						current.snapshot.value.value,
						command,
						current.snapshot.value.value.updatedAt
					)
				});
				if (command.sectionNumbering !== undefined)
					await this.dependencies.noteSectionNumbering.setSectionNumbering(actor, {
						noteId: command.noteId,
						enabled: command.sectionNumbering ?? undefined
					});
				break;
			}
		}
	}

	constructor(private readonly dependencies: NotesDependencies) {}
	async get(actor: ActorContext, input: GetNoteViewInput): Promise<ResolvedNoteView> {
		await this.dependencies.suggestionExpirer.expire(actor);
		const [note, relationships, references, diagrams, todos, pending] = await Promise.all([
			this.dependencies.noteReader.get(actor, input.noteId),
			this.dependencies.relationshipFinder.findForNote(actor, input.noteId),
			this.dependencies.referenceLister.listForNote(actor, input.noteId),
			this.dependencies.diagramLister.listForNote(actor, input.noteId),
			this.dependencies.todoLister.list(actor, { noteId: input.noteId }),
			this.dependencies.suggestionLister.listByStatus(actor, 'proposed', input.noteId)
		]);
		const [backlinks, referenceViews, todoViews, pendingContexts, sectionNumbering] =
			await Promise.all([
				this.dependencies.backlinkViewAssembler.assemble(actor, relationships),
				this.dependencies.referenceViewAssembler.assemble(actor, references),
				this.dependencies.todoViewAssembler.assemble(actor, todos),
				this.dependencies.suggestionContextReader.readContexts(actor, pending),
				this.resolveSectionNumbering(actor, note)
			]);
		return assembleNoteView({
			note,
			backlinks,
			references: referenceViews,
			diagrams,
			todos: todoViews,
			pendingSuggestions: pendingContexts.map(({ suggestion, note, anchor, provenance }) =>
				assembleSuggestionView(suggestion, { note, anchor, origin: provenanceOrigin(provenance) })
			),
			sectionNumbering
		});
	}

	async setSectionNumbering(
		actor: ActorContext,
		input: SetNoteSectionNumberingInput
	): Promise<SetNoteSectionNumberingOutput> {
		const note = await this.dependencies.noteSectionNumbering.setSectionNumbering(actor, input);
		// The resolved view is returned so the caller sees the effect of its own
		// write without a second round trip.
		return { sectionNumbering: await this.resolveSectionNumbering(actor, note) };
	}

	/** The note's cascade resolved across the note, its project and the app default. */
	private async resolveSectionNumbering(
		actor: ActorContext,
		note: Note
	): Promise<SectionNumberingView> {
		const [project, preferences] = await Promise.all([
			this.dependencies.projectReader.get(actor, note.projectId),
			this.dependencies.userPreferences.get(actor)
		]);
		return sectionNumberingView(
			note.sectionNumbering,
			project.sectionNumberingDefault,
			preferences.sectionNumberingDefault
		);
	}

	async listDocuments(
		actor: ActorContext,
		input: ListNoteDocumentsInput
	): Promise<readonly NoteDocument[]> {
		if (input.noteIds.length > MAX_NOTE_DOCUMENTS) {
			throw new ValidationError(`Read up to ${MAX_NOTE_DOCUMENTS} notes at a time.`);
		}
		return Promise.all(
			input.noteIds.map(async (noteId) => {
				const note = await this.dependencies.noteReader.get(actor, noteId);
				return { id: note.id, title: note.title, document: note.document };
			})
		);
	}
	async create(actor: ActorContext, input: CreateNoteInput): Promise<CreateNoteOutput> {
		return { note: await this.dependencies.noteCreator.create(actor, input) };
	}
	/** Resolve a body proposal once; later approval never reruns the requested patch. */
	async prepareChange(
		actor: ActorContext,
		input: NoteChangeRequest,
		target: NoteChangeTarget
	): Promise<NoteChangeReview> {
		const note = await this.dependencies.noteReader.get(actor, input.noteId);
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
		const patch = applyNotePatch(this.dependencies.markdown.write(note.document), input.edits);
		if (!patch.ok)
			return { kind: 'failure', problems: patch.failures.map(describeNotePatchFailure) };
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
		actor: ActorContext,
		change: PreparedNoteChange,
		target: NoteChangeTarget
	): Promise<ApplyReviewedNoteChangeOutput> {
		try {
			return await this.dependencies.transactionRunner.run(
				async (): Promise<ApplyReviewedNoteChangeOutput> => {
					const current = await this.dependencies.noteReader.get(actor, change.noteId);
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
					const saved = await this.save(actor, { note: { ...current, ...change.result } });
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

	save(actor: ActorContext, input: SaveNoteInput): Promise<SaveNoteOutput> {
		return this.dependencies.transactionRunner.run(async () => {
			const note = await this.dependencies.noteEditor.save(actor, input.note);
			const anchors = await this.dependencies.anchorRepairer.repairForNote(actor, note);
			// In the same transaction as the save, beside anchor repair: the note's links are
			// derived from the document that just landed, so a committed body with stale
			// `mentions` rows would show backlinks the note no longer has.
			await this.dependencies.noteLinkReconciler.reconcile(
				actor,
				note,
				collectNoteLinkTargets(note.document)
			);
			await this.finishIndex(actor, await this.dependencies.noteIndexer.index(actor, note));
			return { note, etag: noteEtag(note), repairedAnchorIds: anchors.map((anchor) => anchor.id) };
		});
	}
	publish(actor: ActorContext, input: PublishNoteInput): Promise<PublishNoteOutput> {
		return this.dependencies.transactionRunner.run(async () => {
			const note = await this.dependencies.noteReader.get(actor, input.noteId);
			if (!noteMatchesEtag(note, input.baseEtag))
				throw new StaleRevisionError('The note has changed since it was loaded');
			await this.dependencies.revisionRecorder.record(actor, note);
			const published = await this.dependencies.notePublisher.markPublished(actor, note.id);
			return { note: published, etag: noteEtag(published) };
		});
	}
	async discardDraft(
		actor: ActorContext,
		input: DiscardNoteDraftInput
	): Promise<DiscardNoteDraftOutput> {
		return this.dependencies.transactionRunner.run(async () => {
			const note = await this.dependencies.noteReader.get(actor, input.noteId);
			const revision = (await this.dependencies.revisionReader.revisions(actor, input.noteId)).find(
				(candidate) => candidate.revision === note.publishedRevision
			);
			if (!revision)
				throw new NotFoundError('No published version exists for this note', {
					noteId: input.noteId
				});
			const restored = await this.dependencies.noteEditor.save(actor, {
				...note,
				title: revision.title,
				document: revision.document,
				plainText: revision.plainText
			});
			await this.dependencies.attachmentRestorer.restoreAttachments(
				actor,
				input.noteId,
				revision.id
			);
			await this.dependencies.anchorRepairer.repairForNote(actor, restored);
			await this.dependencies.noteLinkReconciler.reconcile(
				actor,
				restored,
				collectNoteLinkTargets(restored.document)
			);
			await this.finishIndex(actor, await this.dependencies.noteIndexer.index(actor, restored));
			return { note: restored, etag: noteEtag(restored) };
		});
	}
	async searchText(actor: ActorContext, input: SearchNoteTextInput): Promise<SearchNoteTextOutput> {
		const options = { regex: input.regex, caseSensitive: input.caseSensitive };
		assertValidSearch(input.query, options);
		const targets = await this.dependencies.noteTextSearcher.listSearchable(actor, input.projectId);
		return { hits: searchNoteTargets(targets, input.query, options) };
	}
	async replaceText(
		actor: ActorContext,
		input: ReplaceNoteTextInput
	): Promise<ReplaceNoteTextOutput> {
		const options = { regex: input.regex, caseSensitive: input.caseSensitive };
		assertValidSearch(input.query, options);
		const scope = input.noteIds === undefined ? undefined : new Set(input.noteIds);
		return this.dependencies.transactionRunner.run(async () => {
			const targets = await this.dependencies.noteTextSearcher.listSearchable(
				actor,
				input.projectId
			);
			const hits = searchNoteTargets(
				scope === undefined ? targets : targets.filter((target) => scope.has(target.id)),
				input.query,
				options
			);
			let replacedNotes = 0;
			let replacedMatches = 0;
			for (const hit of hits) {
				// Title matches are display-only: replace rewrites document bodies, never titles.
				if (hit.matches.length === 0) continue;
				const note = await this.dependencies.noteReader.get(actor, hit.noteId);
				const result = replaceInNoteDocument(
					note.document,
					input.query,
					input.replacement,
					options
				);
				if (result === undefined) continue;
				await this.save(actor, {
					note: { ...note, document: result.document, plainText: result.plainText }
				});
				replacedNotes += 1;
				replacedMatches += result.replaced;
			}
			return { replacedNotes, replacedMatches };
		});
	}
	rename(actor: ActorContext, input: RenameNoteInput): Promise<RenameNoteOutput> {
		return this.dependencies.transactionRunner.run(async () => {
			const current = await this.dependencies.noteReader.get(actor, input.noteId);
			const note = await this.dependencies.noteEditor.save(actor, {
				...current,
				title: input.title
			});
			// Deliberately no revision: history is bounded, and a title correction should not
			// evict a snapshot of the body somebody may still want back.
			await this.finishIndex(actor, await this.dependencies.noteIndexer.index(actor, note));
			return { note };
		});
	}
	async archive(actor: ActorContext, input: ArchiveNoteInput): Promise<ArchiveNoteOutput> {
		return this.dependencies.transactionRunner.run(async () => {
			const note = await this.dependencies.noteArchiver.archive(actor, input.noteId);
			await this.finishIndex(actor, await this.dependencies.noteIndexer.index(actor, note));
			return { note };
		});
	}
	async restore(actor: ActorContext, input: RestoreNoteInput): Promise<RestoreNoteOutput> {
		return this.dependencies.transactionRunner.run(async () => {
			const note = await this.dependencies.noteArchiver.restore(actor, input.noteId);
			await this.finishIndex(actor, await this.dependencies.noteIndexer.index(actor, note));
			return { note };
		});
	}
	async listTrash(actor: ActorContext, input: ListNoteTrashInput): Promise<ListNoteTrashOutput> {
		return { notes: await this.dependencies.noteTrashReader.listTrashed(actor, input.projectId) };
	}
	async deleteForever(
		actor: ActorContext,
		input: DeleteNoteForeverInput
	): Promise<DeleteNoteForeverOutput> {
		// Transactional because a folder is several deletes: a half-purged folder would
		// leave its contents at the project root with no way back to where they were.
		return this.dependencies.transactionRunner.run(async () => {
			const deletedNotes = await this.dependencies.notePurger.deleteForever(actor, input.noteId);
			return { deletedNoteIds: deletedNotes.map((note) => note.id), deletedNotes };
		});
	}
	async emptyTrash(actor: ActorContext, input: EmptyNoteTrashInput): Promise<EmptyNoteTrashOutput> {
		return this.dependencies.transactionRunner.run(async () => {
			const deletedNotes = await this.dependencies.notePurger.emptyTrash(actor, input.projectId);
			return { deletedNoteIds: deletedNotes.map((note) => note.id), deletedNotes };
		});
	}
	async listRevisions(
		actor: ActorContext,
		input: ListNoteRevisionsInput
	): Promise<ListNoteRevisionsOutput> {
		const [note, revisions] = await Promise.all([
			this.dependencies.noteReader.get(actor, input.noteId),
			this.dependencies.revisionReader.revisions(actor, input.noteId)
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
	async getRevision(
		actor: ActorContext,
		input: GetNoteRevisionInput
	): Promise<GetNoteRevisionOutput> {
		const revision = await this.dependencies.revisionReader.revisionById(
			actor,
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
	async readRevision(
		actor: ActorContext,
		input: ReadNoteRevisionInput
	): Promise<ReadNoteRevisionOutput> {
		const [note, revision] = await Promise.all([
			this.dependencies.noteReader.get(actor, input.noteId),
			this.dependencies.revisionReader.revisionById(actor, input.noteId, input.revisionId)
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
	async compareRevisions(
		actor: ActorContext,
		input: CompareNoteRevisionsInput
	): Promise<CompareNoteRevisionsOutput> {
		const revision = await this.dependencies.revisionReader.revisionById(
			actor,
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
				actor,
				input.noteId,
				input.againstRevisionId
			);
			if (!baseline)
				throw new NotFoundError('That version of the note is no longer available', {
					noteId: input.noteId,
					revisionId: input.againstRevisionId
				});
		} else {
			const note = await this.dependencies.noteReader.get(actor, input.noteId);
			baseline = (await this.dependencies.revisionReader.revisions(actor, input.noteId)).find(
				(candidate) => candidate.revision === note.publishedRevision
			);
			if (!baseline)
				throw new NotFoundError('The note has no published version to compare against', {
					noteId: input.noteId
				});
		}
		return { diff: diffNoteRevisionTexts(baseline, revision), againstRevision: baseline.revision };
	}
	async restoreRevision(
		actor: ActorContext,
		input: RestoreNoteRevisionInput
	): Promise<RestoreNoteRevisionOutput> {
		return this.dependencies.transactionRunner.run(async () => {
			const [note, revision] = await Promise.all([
				this.dependencies.noteReader.get(actor, input.noteId),
				this.dependencies.revisionReader.revisionById(actor, input.noteId, input.revisionId)
			]);
			if (!revision)
				throw new NotFoundError('That version of the note is no longer available', {
					noteId: input.noteId,
					revisionId: input.revisionId
				});
			const restored = await this.dependencies.noteEditor.save(actor, {
				...note,
				title: revision.title,
				document: revision.document,
				plainText: revision.plainText
			});
			await this.dependencies.attachmentRestorer.restoreAttachments(
				actor,
				input.noteId,
				input.revisionId
			);
			await this.dependencies.anchorRepairer.repairForNote(actor, restored);
			await this.dependencies.noteLinkReconciler.reconcile(
				actor,
				restored,
				collectNoteLinkTargets(restored.document)
			);
			await this.finishIndex(actor, await this.dependencies.noteIndexer.index(actor, restored));
			return { note: restored, etag: noteEtag(restored) };
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

type ResolvedNoteView = NoteView<BacklinkView, ReferenceView, Diagram, TodoView, SuggestionView>;
