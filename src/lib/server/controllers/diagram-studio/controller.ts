import type { DrawioLabelReader } from '$lib/server/services/diagrams/drawio';
import { searchableDrawioText } from '$lib/services/diagrams/labels';
import { prepareDiagramWrite } from '$lib/services/diagrams/editing';
import type { DiagramRevisionChange } from '$lib/models/diagrams';
import { decideDiagramTrash, diagramTrashChange } from '$lib/services/diagrams/trash';
import type { DiagramLibrary } from '$lib/server/services/diagrams/library';
import { mutationResource } from '$lib/services/workspace/commands';
import type { WorkspaceMutationCurrent } from '$lib/models/workspace-mutations';
import type { NoteReader } from '$lib/server/services/notes/contracts';
import type { DiagramIndexContext, IndexingResult } from '$lib/models/knowledge-search';
import type { IEmbeddings } from '$lib/server/services/knowledge-search/embeddings';
import {
	diagramIndexNoteId,
	type ContentIndex
} from '$lib/server/services/knowledge-search/indexing';
import type { WorkspaceMutationReceipts } from '$lib/server/services/workspace/mutation-receipts';
import type {
	DiagramMutationRequest,
	WorkspaceMutationResult
} from '$lib/models/workspace-mutations';
import type { ActorContext } from '$lib/models/identity';
import type {
	CountDiagramReferencesInput,
	DeleteProjectDiagramInput,
	Diagram,
	DiagramId,
	DiagramEtag,
	DiagramWriteOutcome,
	DrawioDiagram,
	FindConversationDiagramInput,
	FindConversationDiagramOutput,
	GetDiagramRevisionInput,
	GetDiagramRevisionOutput,
	GetProjectDiagramInput,
	ListProjectDiagramsInput,
	ListProjectDiagramsOutput,
	ListTrashedDiagramsInput,
	ListDiagramRevisionsInput,
	ListDiagramRevisionsOutput,
	PublishProjectDiagramInput,
	PublishProjectDiagramOutput,
	CreateDiagramInput,
	DiagramWriteOutput,
	EditDiagramInput,
	ReadCanvasDiagramInput,
	ReadCanvasDiagramOutput,
	ReadProjectDiagramInput,
	ReadProjectDiagramOutput,
	RenameProjectDiagramInput,
	RestoreDiagramRevisionInput,
	RestoreDiagramRevisionOutput,
	SaveProjectDiagramDraftInput,
	SearchDiagramIconsInput,
	SearchDiagramIconsOutput
} from '$lib/models/diagrams';
import { diagramEtag } from '$lib/models/diagrams';
import { StaleRevisionError, UnsupportedDiagramOperationError, ValidationError } from '$lib/errors';
import type { AtomicOperation as TransactionRunner, DateTime } from '$lib/models/workspace';
import type {
	DiagramConversationFinder,
	DiagramDraftWriter,
	DiagramFinder,
	DiagramIconSearch,
	DiagramIndexer,
	DiagramLister,
	DiagramReferenceCounter,
	DiagramRevisionReader,
	DiagramWriter,
	DrawioSvgPreviewSanitizer,
	DrawioXmlContentValidator
} from '$lib/server/services/diagrams/contracts';
import type { PresentedCanvasSource } from '$lib/server/services/diagrams/canvas-source';

/**
 * Application boundary for the project diagram studio: the canvas beside a
 * conversation, the diagrams a project has kept, and the gallery over them.
 *
 * Separate from `DiagramsController`, which owns the older note-inline flow —
 * generating and revising Mermaid inside a note and offering it as a suggestion.
 * The two share a repository and nothing else: one produces suggestions against a
 * note, the other produces project-owned draw.io diagrams from a conversation.
 * Held together they were one controller of twenty-two methods and twenty-seven
 * collaborators, most of which any given method had no use for.
 */
export interface DiagramStudioController {
	synchronize(actor: ActorContext, input: DiagramMutationRequest): Promise<WorkspaceMutationResult>;
	/**
	 * Put a draw.io diagram on the studio canvas.
	 *
	 * Validates and hands it straight back; it stores nothing. The canvas is what
	 * shows it and the user is who keeps it, so an abandoned conversation leaves no
	 * diagram behind.
	 */
	createDiagram(actor: ActorContext, input: CreateDiagramInput): Promise<DiagramWriteOutput>;
	/** Present a revision only after proving its replacement target exists and is editable. */
	editDiagram(actor: ActorContext, input: EditDiagramInput): Promise<DiagramWriteOutput>;
	/**
	 * Read the diagram currently on this conversation's canvas.
	 *
	 * Diagram source is elided from replayed history because it is large and rarely
	 * re-read; this is how it is recovered on the turn that revises it. It answers
	 * for a draft too, which `readProjectDiagram` cannot — a draft has no row.
	 */
	readCanvasDiagram(
		actor: ActorContext,
		input: ReadCanvasDiagramInput
	): Promise<ReadCanvasDiagramOutput>;
	/**
	 * Read a saved diagram as text the agent can reason about.
	 *
	 * Returns the labels rather than the source: draw.io XML is thousands of tokens
	 * of markup that tells a model nothing, and injecting it would crowd out the
	 * conversation it is meant to inform.
	 */
	readProjectDiagram(
		actor: ActorContext,
		input: ReadProjectDiagramInput
	): Promise<ReadProjectDiagramOutput>;
	/**
	 * Find a logo to put in a diagram.
	 *
	 * Without this the agent guesses at stencil names and draws broken boxes. The
	 * result is an https SVG URL, which is what draw.io renders through
	 * `shape=image` and the only image form the XML validator accepts.
	 */
	searchDiagramIcons(
		actor: ActorContext,
		input: SearchDiagramIconsInput
	): Promise<SearchDiagramIconsOutput>;
	/**
	 * Fetch one project diagram, for the studio canvas.
	 *
	 * Reads are scoped to the actor, so a diagram belonging to someone else is
	 * indistinguishable from one that does not exist.
	 *
	 * @throws NotFoundError if the actor has no such diagram.
	 */
	getProjectDiagram(actor: ActorContext, input: GetProjectDiagramInput): Promise<Diagram>;
	findConversationDiagram(
		actor: ActorContext,
		input: FindConversationDiagramInput
	): Promise<FindConversationDiagramOutput>;
	/** Every diagram produced in a project, oldest first. */
	listProjectDiagrams(
		actor: ActorContext,
		input: ListProjectDiagramsInput
	): Promise<ListProjectDiagramsOutput>;
	/** How many, for a screen that shows the number and none of the diagrams. */
	countProjectDiagrams(actor: ActorContext, input: ListProjectDiagramsInput): Promise<number>;
	saveProjectDiagramDraft(
		actor: ActorContext,
		input: SaveProjectDiagramDraftInput
	): Promise<PublishProjectDiagramOutput>;
	publishProjectDiagram(
		actor: ActorContext,
		input: PublishProjectDiagramInput
	): Promise<PublishProjectDiagramOutput>;
	listDiagramRevisions(
		actor: ActorContext,
		input: ListDiagramRevisionsInput
	): Promise<ListDiagramRevisionsOutput>;
	getDiagramRevision(
		actor: ActorContext,
		input: GetDiagramRevisionInput
	): Promise<GetDiagramRevisionOutput>;
	restoreDiagramRevision(
		actor: ActorContext,
		input: RestoreDiagramRevisionInput
	): Promise<RestoreDiagramRevisionOutput>;
	/** Retitle a project diagram. */
	renameProjectDiagram(
		actor: ActorContext,
		input: RenameProjectDiagramInput
	): Promise<DiagramWriteOutcome>;
	/**
	 * Move a diagram to the trash, restorable with `restoreProjectDiagram`.
	 *
	 * Permanent deletion below still means what it says. This is the reversible
	 * removal notes already have, and diagrams did not — which matters most for a
	 * diagram a conversation produced, where the cost of an unwanted one has to be
	 * recoverable.
	 */
	archiveProjectDiagram(actor: ActorContext, input: DeleteProjectDiagramInput): Promise<Diagram>;
	/** Bring a diagram back from the trash. */
	restoreProjectDiagram(actor: ActorContext, input: DeleteProjectDiagramInput): Promise<Diagram>;
	/** The diagrams in the trash, most recently discarded first. */
	listTrashedProjectDiagrams(
		actor: ActorContext,
		input: ListTrashedDiagramsInput
	): Promise<readonly Diagram[]>;
	/** Permanently delete a project diagram. Notes referencing it show it as unavailable. */
	deleteProjectDiagram(actor: ActorContext, input: DeleteProjectDiagramInput): Promise<void>;
	/** How many notes render this diagram, for the delete confirmation. */
	countDiagramReferences(actor: ActorContext, input: CountDiagramReferencesInput): Promise<number>;
}

export interface DiagramStudioDependencies {
	syncMutations: Pick<WorkspaceMutationReceipts, 'prepare' | 'complete' | 'reject'>;
	syncRetry: 'database-only' | 'never';
	transactionRunner: TransactionRunner;
	diagramFinder: DiagramFinder;
	diagramLister: DiagramLister;
	diagramConversations: DiagramConversationFinder;
	diagramReferences: DiagramReferenceCounter;
	diagramDraftWriter: DiagramDraftWriter;
	diagramRevisionReader: DiagramRevisionReader;
	diagramTrash: Pick<
		DiagramLibrary,
		'getForWrite' | 'persistTrash' | 'deleteArchived' | 'listArchived'
	>;
	diagramWriter: Pick<DiagramWriter, 'create'>;
	diagramSourceNotes: NoteReader;
	indexEmbeddings: IEmbeddings;
	indexWriter: Pick<ContentIndex, 'complete'>;
	diagramIndexer: DiagramIndexer;
	drawioXmlValidator: DrawioXmlContentValidator;
	drawioSvgSanitizer: DrawioSvgPreviewSanitizer;
	drawioLabels: Pick<DrawioLabelReader, 'read'>;
	iconSearch: DiagramIconSearch;
	canvasSource: PresentedCanvasSource;
	/** Injected so the write path has one clock, the way the services do. */
	now: () => DateTime;
}

export class DiagramStudio implements DiagramStudioController {
	async synchronize(
		actor: ActorContext,
		input: DiagramMutationRequest
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
		input: DiagramMutationRequest,
		current: WorkspaceMutationCurrent
	): Promise<void> {
		const command = input.command;
		if (command.kind === 'archiveDiagram') {
			await this.archiveProjectDiagram(actor, command);
			return;
		}
		if (command.kind === 'restoreDiagram') {
			await this.restoreProjectDiagram(actor, command);
			return;
		}
		if (command.kind === 'deleteDiagram') {
			await this.deleteProjectDiagram(actor, command);
			return;
		}
		if (
			current.kind !== 'found' ||
			current.snapshot.value.type !== 'diagrams' ||
			current.snapshot.value.value.kind !== 'drawio'
		)
			throw new UnsupportedDiagramOperationError('Only an existing draw.io diagram can be edited');
		const baseEtag = diagramEtag(current.snapshot.value.value);
		let result: DiagramWriteOutcome;
		switch (command.kind) {
			case 'saveDiagram':
				result = await this.saveProjectDiagramDraft(actor, { ...command, baseEtag });
				break;
			case 'renameDiagram':
				result = await this.renameProjectDiagram(actor, { ...command, baseEtag });
				break;
			case 'publishDiagram':
				result = await this.publishProjectDiagram(actor, { ...command, baseEtag });
				break;
		}
		if (result.outcome !== 'saved')
			throw new StaleRevisionError('The diagram changed during the guarded write');
	}

	constructor(private readonly dependencies: DiagramStudioDependencies) {}

	/**
	 * Create a diagram, the way `create_note` creates a note.
	 *
	 * It used to store nothing and hand the XML back for a canvas to show, with a
	 * Save button as the only approval. That made a diagram the one agent output
	 * that could vanish when a chat closed, and put its consent somewhere the
	 * approval boundary could not see. Now the tool is a mutation: the boundary
	 * asks, and approving writes the row.
	 *
	 * Created unpublished — `publishedRevision` 0, no `publishedAt` — exactly as a
	 * note is. Publishing is still the user's decision, and until they make it the
	 * diagram is a working revision nobody else sees.
	 */
	async createDiagram(actor: ActorContext, input: CreateDiagramInput): Promise<DiagramWriteOutput> {
		const source = this.dependencies.drawioXmlValidator.validate(input.source);
		const timestamp = this.dependencies.now();
		const diagram = await this.dependencies.diagramWriter.create(actor, {
			id: crypto.randomUUID() as Diagram['id'],
			userId: actor.userId,
			projectId: input.projectId,
			conversationId: input.conversationId,
			kind: 'drawio',
			title: input.title,
			source,
			// No preview yet. Only the draw.io embed can draw one, so the gallery says
			// "No preview yet" until the canvas opens this and exports it.
			searchableText: searchableDrawioText(this.dependencies.drawioLabels.read(source)),
			currentRevision: 1,
			publishedRevision: 0,
			createdAt: timestamp,
			updatedAt: timestamp
		});
		await this.indexDiagram(actor, diagram);
		return { diagramId: diagram.id, ...(input.title ? { title: input.title } : {}) };
	}

	/**
	 * Edit a diagram, the way `edit_note` edits a note.
	 *
	 * The write is a working revision: `publishedRevision` is untouched, and
	 * History and Publish remain how a version is accepted or abandoned (ADR 0003).
	 * The base version goes with it, so a diagram the user changed meanwhile
	 * reports a conflict instead of being overwritten (ADR 0010).
	 */
	async editDiagram(actor: ActorContext, input: EditDiagramInput): Promise<DiagramWriteOutput> {
		const target = await this.dependencies.diagramFinder.get(actor, input.diagramId);
		if (target.kind !== 'drawio')
			throw new UnsupportedDiagramOperationError('Only draw.io diagrams can be edited here');
		const source = this.dependencies.drawioXmlValidator.validate(input.source);
		const result = await this.saveProjectDiagramDraft(actor, {
			diagramId: target.id,
			source,
			baseEtag: diagramEtag(target)
		});
		if (result.outcome === 'conflict')
			throw new StaleRevisionError('The diagram changed while it was being edited');
		return { diagramId: target.id, ...(input.title ? { title: input.title } : {}) };
	}

	async readCanvasDiagram(
		actor: ActorContext,
		input: ReadCanvasDiagramInput
	): Promise<ReadCanvasDiagramOutput> {
		const diagramId = await this.dependencies.canvasSource.latest(actor, input.conversationId);
		// Read from the row rather than the transcript: the agent gets what is
		// stored, which is what the user is looking at, not what was last sent.
		const diagram = diagramId
			? await this.dependencies.diagramFinder.get(actor, diagramId)
			: undefined;
		return diagram
			? {
					kind: 'present',
					diagramId: diagram.id,
					source: diagram.source,
					...(diagram.title ? { title: diagram.title } : {})
				}
			: {
					kind: 'empty',
					message: 'This conversation has no diagram on its canvas.',
					nextActions: [
						{
							tool: 'create_diagram',
							reason: 'Create a diagram only if the user asked for one.'
						}
					]
				};
	}

	async readProjectDiagram(
		actor: ActorContext,
		input: ReadProjectDiagramInput
	): Promise<ReadProjectDiagramOutput> {
		const diagram = await this.dependencies.diagramFinder.get(actor, input.diagramId);
		return {
			id: diagram.id,
			projectId: diagram.projectId,
			kind: diagram.kind,
			...(diagram.title ? { title: diagram.title } : {}),
			labels:
				diagram.kind === 'drawio'
					? searchableDrawioText(this.dependencies.drawioLabels.read(diagram.source))
					: diagram.source
		};
	}

	async searchDiagramIcons(
		actor: ActorContext,
		input: SearchDiagramIconsInput
	): Promise<SearchDiagramIconsOutput> {
		void actor;
		const icons = await this.dependencies.iconSearch.search(input.query, input.limit);
		return { icons };
	}

	getProjectDiagram(actor: ActorContext, input: GetProjectDiagramInput): Promise<Diagram> {
		return this.dependencies.diagramFinder.get(actor, input.diagramId);
	}

	async findConversationDiagram(
		actor: ActorContext,
		input: FindConversationDiagramInput
	): Promise<FindConversationDiagramOutput> {
		const diagram = await this.dependencies.diagramConversations.findByConversation(
			actor,
			input.conversationId
		);
		return diagram ? { diagram } : {};
	}

	listProjectDiagrams(
		actor: ActorContext,
		input: ListProjectDiagramsInput
	): Promise<ListProjectDiagramsOutput> {
		const { projectId, ...params } = input;
		return this.dependencies.diagramLister.listForProject(actor, projectId, params);
	}

	countProjectDiagrams(actor: ActorContext, input: ListProjectDiagramsInput): Promise<number> {
		const { projectId, ...params } = input;
		return this.dependencies.diagramLister.countForProject(actor, projectId, params);
	}

	async saveProjectDiagramDraft(
		actor: ActorContext,
		input: SaveProjectDiagramDraftInput
	): Promise<PublishProjectDiagramOutput> {
		return this.writeOutcome(actor, input.diagramId, input.baseEtag, () =>
			this.dependencies.transactionRunner.run(async () => {
				const source = this.dependencies.drawioXmlValidator.validate(input.source);
				const searchableText = searchableDrawioText(this.dependencies.drawioLabels.read(source));
				const diagram = await this.writeRevision(actor, input.diagramId, input.baseEtag, {
					kind: 'save',
					source,
					searchableText
				});
				await this.indexDiagram(actor, diagram);
				return diagram;
			})
		);
	}

	publishProjectDiagram(
		actor: ActorContext,
		input: PublishProjectDiagramInput
	): Promise<PublishProjectDiagramOutput> {
		return this.writeOutcome(actor, input.diagramId, input.baseEtag, () =>
			this.dependencies.transactionRunner.run(async () => {
				const source = this.dependencies.drawioXmlValidator.validate(input.source);
				const renderedSvg = this.dependencies.drawioSvgSanitizer.sanitize(input.renderedSvg);
				const searchableText = searchableDrawioText(this.dependencies.drawioLabels.read(source));
				const diagram = await this.writeRevision(actor, input.diagramId, input.baseEtag, {
					kind: 'publish',
					source,
					renderedSvg,
					searchableText
				});
				await this.indexDiagram(actor, diagram);
				return diagram;
			})
		);
	}

	async listDiagramRevisions(
		actor: ActorContext,
		input: ListDiagramRevisionsInput
	): Promise<ListDiagramRevisionsOutput> {
		const diagram = await this.dependencies.diagramFinder.get(actor, input.diagramId);
		if (diagram.kind !== 'drawio')
			throw new UnsupportedDiagramOperationError('Only draw.io diagrams have publication history');
		return {
			revisions: (await this.dependencies.diagramRevisionReader.revisions(actor, diagram.id)).map(
				(revision) => ({
					id: revision.id,
					revision: revision.revision,
					title: revision.title,
					createdAt: revision.createdAt,
					isPublished: revision.revision === diagram.publishedRevision
				})
			)
		};
	}

	async getDiagramRevision(
		actor: ActorContext,
		input: GetDiagramRevisionInput
	): Promise<GetDiagramRevisionOutput> {
		return {
			revision: await this.dependencies.diagramRevisionReader.revision(
				actor,
				input.diagramId,
				input.revisionId
			)
		};
	}

	restoreDiagramRevision(
		actor: ActorContext,
		input: RestoreDiagramRevisionInput
	): Promise<RestoreDiagramRevisionOutput> {
		return this.writeOutcome(actor, input.diagramId, input.baseEtag, () =>
			this.dependencies.transactionRunner.run(async () => {
				const revision = await this.dependencies.diagramRevisionReader.revision(
					actor,
					input.diagramId,
					input.revisionId
				);
				const diagram = await this.writeRevision(actor, input.diagramId, input.baseEtag, {
					kind: 'restore',
					revision
				});
				await this.indexDiagram(actor, diagram);
				return diagram;
			})
		);
	}

	renameProjectDiagram(
		actor: ActorContext,
		input: RenameProjectDiagramInput
	): Promise<DiagramWriteOutcome> {
		return this.writeOutcome(actor, input.diagramId, input.baseEtag, () =>
			this.dependencies.transactionRunner.run(async () => {
				const diagram = await this.writeRevision(actor, input.diagramId, input.baseEtag, {
					kind: 'rename',
					title: input.title
				});
				await this.indexDiagram(actor, diagram);
				return diagram;
			})
		);
	}

	private async writeRevision(
		actor: ActorContext,
		diagramId: DiagramId,
		baseEtag: DiagramEtag,
		change: DiagramRevisionChange
	): Promise<DrawioDiagram> {
		const current = await this.dependencies.diagramDraftWriter.getForWrite(actor, diagramId);
		const decision = prepareDiagramWrite(current, change, baseEtag, this.dependencies.now());
		if (decision.kind === 'unchanged') return decision.diagram;
		const saved = await this.dependencies.diagramDraftWriter.persistEdit(actor, decision.write);
		if (!saved) throw new StaleRevisionError('The diagram changed while it was being saved');
		if (change.kind === 'publish')
			await this.dependencies.diagramDraftWriter.recordRevision(actor, saved);
		return saved;
	}

	private async writeOutcome(
		actor: ActorContext,
		diagramId: DiagramId,
		baseEtag: DiagramEtag,
		write: () => Promise<DrawioDiagram>
	): Promise<DiagramWriteOutcome> {
		try {
			const diagram = await write();
			return { outcome: 'saved', diagram, etag: diagramEtag(diagram) };
		} catch (error) {
			if (!(error instanceof StaleRevisionError)) throw error;
			const diagram = await this.dependencies.diagramFinder.get(actor, diagramId);
			if (diagram.kind !== 'drawio') throw error;
			return { outcome: 'conflict', baseEtag, remote: { diagram, etag: diagramEtag(diagram) } };
		}
	}

	deleteProjectDiagram(actor: ActorContext, input: DeleteProjectDiagramInput): Promise<void> {
		return this.dependencies.transactionRunner.run(async () => {
			const current = await this.dependencies.diagramTrash.getForWrite(actor, input.diagramId);
			const decision = decideDiagramTrash('delete', current);
			if (decision.kind === 'invalid') throw new ValidationError(decision.message);
			await this.dependencies.diagramTrash.deleteArchived(actor, current.id);
		});
	}

	async archiveProjectDiagram(
		actor: ActorContext,
		input: DeleteProjectDiagramInput
	): Promise<Diagram> {
		return this.dependencies.transactionRunner.run(async () => {
			const current = await this.dependencies.diagramTrash.getForWrite(actor, input.diagramId);
			const decision = diagramTrashChange('archive', current, this.dependencies.now());
			if (decision.kind === 'invalid') throw new ValidationError(decision.message);
			const archived = await this.dependencies.diagramTrash.persistTrash(actor, decision.diagram);
			await this.indexDiagram(actor, archived);
			return archived;
		});
	}

	async restoreProjectDiagram(
		actor: ActorContext,
		input: DeleteProjectDiagramInput
	): Promise<Diagram> {
		return this.dependencies.transactionRunner.run(async () => {
			const current = await this.dependencies.diagramTrash.getForWrite(actor, input.diagramId);
			const decision = diagramTrashChange('restore', current, this.dependencies.now());
			if (decision.kind === 'invalid') throw new ValidationError(decision.message);
			const restored = await this.dependencies.diagramTrash.persistTrash(actor, decision.diagram);
			await this.indexDiagram(actor, restored);
			return restored;
		});
	}

	listTrashedProjectDiagrams(
		actor: ActorContext,
		input: ListTrashedDiagramsInput
	): Promise<readonly Diagram[]> {
		return this.dependencies.diagramTrash.listArchived(actor, input.projectId);
	}

	countDiagramReferences(actor: ActorContext, input: CountDiagramReferencesInput): Promise<number> {
		return this.dependencies.diagramReferences.countReferencingNotes(actor, input.diagramId);
	}
	private async indexDiagram(actor: ActorContext, diagram: Diagram): Promise<void> {
		const noteId = diagramIndexNoteId(diagram);
		const context: DiagramIndexContext =
			noteId === undefined
				? { kind: 'standalone' }
				: {
						kind: 'note',
						title: (await this.dependencies.diagramSourceNotes.get(actor, noteId)).title
					};
		await this.finishIndex(
			actor,
			await this.dependencies.diagramIndexer.index(actor, diagram, context)
		);
	}

	private async finishIndex(actor: ActorContext, result: IndexingResult): Promise<void> {
		if (result.kind === 'stored') return;
		const batch = await this.dependencies.indexEmbeddings.embed(
			result.missing.map((chunk) => chunk.input)
		);
		await this.dependencies.indexWriter.complete(actor, result, batch);
	}
}
