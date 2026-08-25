import type { ActorContext } from '$lib/models/identity';
import type {
	CountDiagramReferencesInput,
	DeleteProjectDiagramInput,
	Diagram,
	DrawioDiagram,
	FindConversationDiagramInput,
	FindConversationDiagramOutput,
	GetDiagramRevisionInput,
	GetDiagramRevisionOutput,
	GetProjectDiagramInput,
	KeepStudioDiagramInput,
	KeepStudioDiagramOutput,
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
	SaveDrawioDiagramOutput,
	SaveProjectDrawioInput,
	SearchDiagramIconsInput,
	SearchDiagramIconsOutput
} from '$lib/models/diagrams';
import { diagramEtag } from '$lib/models/diagrams';
import { UnsupportedDiagramOperationError } from '$lib/errors';
import type { AtomicOperation as TransactionRunner, DateTime } from '$lib/models/workspace';
import type {
	DiagramConversationFinder,
	DiagramArchiver,
	DiagramDeleter,
	DiagramDraftWriter,
	DiagramFinder,
	DiagramIconSearch,
	DiagramIndexer,
	DiagramLister,
	DiagramReferenceCounter,
	DiagramRevisionReader,
	DiagramRenamer,
	DiagramTextExtractor,
	DiagramWriter,
	DrawioSvgPreviewSanitizer,
	DrawioXmlContentValidator
} from '$lib/server/services/diagrams/contracts';
import type { PresentedCanvasSource } from '$lib/server/services/diagrams/canvas-source';
import type { DrawioWrites } from '$lib/server/services/diagrams/drawio-writes';

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
	/**
	 * Persist an edited studio diagram, which need not sit in any note.
	 *
	 * @throws NotFoundError if the actor has no such diagram; throws
	 * UnsupportedDiagramOperationError if it is not draw.io.
	 */
	saveProjectDrawio(
		actor: ActorContext,
		input: SaveProjectDrawioInput
	): Promise<SaveDrawioDiagramOutput>;
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
	): Promise<DrawioDiagram>;
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
	transactionRunner: TransactionRunner;
	diagramFinder: DiagramFinder;
	diagramLister: DiagramLister;
	diagramConversations: DiagramConversationFinder;
	diagramReferences: DiagramReferenceCounter;
	diagramRenamer: DiagramRenamer;
	diagramDraftWriter: DiagramDraftWriter;
	diagramRevisionReader: DiagramRevisionReader;
	diagramDeleter: DiagramDeleter;
	diagramArchiver: DiagramArchiver;
	diagramWriter: DiagramWriter;
	diagramIndexer: DiagramIndexer;
	drawioWrites: DrawioWrites;
	drawioXmlValidator: DrawioXmlContentValidator;
	drawioSvgSanitizer: DrawioSvgPreviewSanitizer;
	drawioTextExtractor: DiagramTextExtractor;
	iconSearch: DiagramIconSearch;
	canvasSource: PresentedCanvasSource;
	/** Injected so the write path has one clock, the way the services do. */
	now: () => DateTime;
}

export class DiagramStudio implements DiagramStudioController {
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
			searchableText: await this.dependencies.drawioTextExtractor.extract({ source }),
			currentRevision: 1,
			publishedRevision: 0,
			createdAt: timestamp,
			updatedAt: timestamp
		});
		await this.dependencies.diagramIndexer.index(actor, diagram);
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
		await this.saveProjectDiagramDraft(actor, {
			diagramId: target.id,
			source,
			baseEtag: diagramEtag(target)
		});
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
					? await this.dependencies.drawioTextExtractor.extract(diagram)
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

	saveProjectDrawio(
		actor: ActorContext,
		input: SaveProjectDrawioInput
	): Promise<SaveDrawioDiagramOutput> {
		return this.dependencies.transactionRunner.run(async () => {
			const current = await this.dependencies.diagramFinder.get(actor, input.diagramId);
			if (current.kind !== 'drawio')
				throw new UnsupportedDiagramOperationError('Only draw.io diagrams can be edited here');
			return { diagram: await this.dependencies.drawioWrites.write(actor, current, input) };
		});
	}

	async saveProjectDiagramDraft(
		actor: ActorContext,
		input: SaveProjectDiagramDraftInput
	): Promise<PublishProjectDiagramOutput> {
		const source = this.dependencies.drawioXmlValidator.validate(input.source);
		const searchableText = await this.dependencies.drawioTextExtractor.extract({ source });
		const diagram = await this.dependencies.diagramDraftWriter.saveDraftSource(
			actor,
			input.diagramId,
			source,
			searchableText,
			input.baseEtag
		);
		await this.dependencies.diagramIndexer.index(actor, diagram);
		return { diagram, etag: diagramEtag(diagram) };
	}

	publishProjectDiagram(
		actor: ActorContext,
		input: PublishProjectDiagramInput
	): Promise<PublishProjectDiagramOutput> {
		return this.dependencies.transactionRunner.run(async () => {
			const source = this.dependencies.drawioXmlValidator.validate(input.source);
			const renderedSvg = this.dependencies.drawioSvgSanitizer.sanitize(input.renderedSvg);
			const searchableText = await this.dependencies.drawioTextExtractor.extract({ source });
			const diagram = await this.dependencies.diagramDraftWriter.publish(
				actor,
				input.diagramId,
				source,
				renderedSvg,
				searchableText,
				input.baseEtag
			);
			await this.dependencies.diagramIndexer.index(actor, diagram);
			return { diagram, etag: diagramEtag(diagram) };
		});
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
		return this.dependencies.transactionRunner.run(async () => {
			const diagram = await this.dependencies.diagramDraftWriter.restore(
				actor,
				input.diagramId,
				input.revisionId,
				input.baseEtag
			);
			await this.dependencies.diagramIndexer.index(actor, diagram);
			return { diagram, etag: diagramEtag(diagram) };
		});
	}

	renameProjectDiagram(
		actor: ActorContext,
		input: RenameProjectDiagramInput
	): Promise<DrawioDiagram> {
		return this.dependencies.diagramRenamer.rename(
			actor,
			input.diagramId,
			input.title,
			input.baseEtag
		);
	}

	deleteProjectDiagram(actor: ActorContext, input: DeleteProjectDiagramInput): Promise<void> {
		return this.dependencies.diagramDeleter.delete(actor, input.diagramId);
	}

	async archiveProjectDiagram(
		actor: ActorContext,
		input: DeleteProjectDiagramInput
	): Promise<Diagram> {
		const archived = await this.dependencies.diagramArchiver.archive(actor, input.diagramId);
		// Re-indexed rather than left alone: a diagram in the trash is out of the
		// project, and a search that still returns it offers the user something they
		// cannot open.
		await this.dependencies.diagramIndexer.index(actor, archived);
		return archived;
	}

	async restoreProjectDiagram(
		actor: ActorContext,
		input: DeleteProjectDiagramInput
	): Promise<Diagram> {
		const restored = await this.dependencies.diagramArchiver.unarchive(actor, input.diagramId);
		await this.dependencies.diagramIndexer.index(actor, restored);
		return restored;
	}

	listTrashedProjectDiagrams(
		actor: ActorContext,
		input: ListTrashedDiagramsInput
	): Promise<readonly Diagram[]> {
		return this.dependencies.diagramArchiver.listArchived(actor, input.projectId);
	}

	countDiagramReferences(actor: ActorContext, input: CountDiagramReferencesInput): Promise<number> {
		return this.dependencies.diagramReferences.countReferencingNotes(actor, input.diagramId);
	}
}
