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
	ListDiagramRevisionsInput,
	ListDiagramRevisionsOutput,
	PublishProjectDiagramInput,
	PublishProjectDiagramOutput,
	PresentDiagramInput,
	PresentDiagramOutput,
	PresentDiagramRevisionInput,
	PresentDiagramRevisionOutput,
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
	presentDiagram(actor: ActorContext, input: PresentDiagramInput): Promise<PresentDiagramOutput>;
	/** Present a revision only after proving its replacement target exists and is editable. */
	presentDiagramRevision(
		actor: ActorContext,
		input: PresentDiagramRevisionInput
	): Promise<PresentDiagramRevisionOutput>;
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
	 * Turn what the canvas is showing into a durable project diagram.
	 *
	 * The one way a studio diagram comes into being. A presented draft lives in the
	 * conversation and is never persisted, so this has no ancestor diagram to
	 * supersede — it creates the row. Idempotent on `conversationId`, so a replayed
	 * event cannot produce two diagrams.
	 */
	keepStudioDiagram(
		actor: ActorContext,
		input: KeepStudioDiagramInput
	): Promise<KeepStudioDiagramOutput>;
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

	// `presentDiagram` and `searchDiagramIcons` cross no service seam — they
	// validate, or they ask one collaborator and hand the answer back. They live
	// here because the agent's tools are bound to controllers, not because there is
	// orchestration to do; hence the `void actor` in both.
	async presentDiagram(
		actor: ActorContext,
		input: PresentDiagramInput
	): Promise<PresentDiagramOutput> {
		void actor;
		// Validated even though nothing is stored: the canvas is about to load this
		// into a draw.io embed, and a malformed source would fail there, in front of
		// the user, rather than here.
		const source = this.dependencies.drawioXmlValidator.validate(input.source);
		return {
			source,
			...(input.title ? { title: input.title } : {})
		};
	}

	/**
	 * A revision lands on the row it names, as a working revision.
	 *
	 * It used to only validate and echo, leaving the version to be applied by a
	 * button in the draft canvas. That canvas is a tab of its own, and a
	 * conversation whose diagram was already kept opens the *saved* diagram's tab
	 * instead — so the button was unreachable and the agent could report a diagram
	 * changed while the user looked at the version before it.
	 *
	 * Saving here does not decide anything for the user (ADR 0003): the write is a
	 * working revision, `publishedRevision` is untouched, and History and Publish
	 * remain how a version is accepted or abandoned. The approval boundary asks
	 * before the call, which is where consent belongs — the tool is classified a
	 * mutation for exactly that reason.
	 */
	async presentDiagramRevision(
		actor: ActorContext,
		input: PresentDiagramRevisionInput
	): Promise<PresentDiagramRevisionOutput> {
		const target = await this.dependencies.diagramFinder.get(actor, input.diagramId);
		if (target.kind !== 'drawio')
			throw new UnsupportedDiagramOperationError('Only draw.io diagrams can be revised here');
		const presented = await this.presentDiagram(actor, input);
		// Base version sent with the write, so a diagram the user edited meanwhile
		// reports a conflict instead of being overwritten (ADR 0010).
		await this.saveProjectDiagramDraft(actor, {
			diagramId: target.id,
			source: presented.source,
			baseEtag: diagramEtag(target)
		});
		return { ...presented, diagramId: target.id };
	}

	async readCanvasDiagram(
		actor: ActorContext,
		input: ReadCanvasDiagramInput
	): Promise<ReadCanvasDiagramOutput> {
		const presented = await this.dependencies.canvasSource.latest(actor, input.conversationId);
		return presented
			? presented
			: {
					kind: 'empty',
					message: 'This conversation has not presented a diagram on its canvas.',
					nextActions: [
						{
							tool: 'present_diagram',
							reason: 'Present a new diagram only if the user asked to create one.'
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

	keepStudioDiagram(
		actor: ActorContext,
		input: KeepStudioDiagramInput
	): Promise<KeepStudioDiagramOutput> {
		return this.dependencies.transactionRunner.run(async () => {
			// One conversation owns one diagram, so the conversation is the idempotency
			// key a replayed keep collides on. Returning the existing diagram is what
			// keeps a reconnect from producing a second artifact.
			const existing = await this.dependencies.diagramConversations.findByConversation(
				actor,
				input.conversationId
			);
			if (existing) return { diagram: existing, created: false };
			const source = this.dependencies.drawioXmlValidator.validate(input.source);
			// The preview comes from the embed's own export, which is the only thing
			// that can draw draw.io. The sanitizer throws on empty input, so a diagram
			// can never be stored with a blank preview it could never recover from.
			const renderedSvg = this.dependencies.drawioSvgSanitizer.sanitize(input.renderedSvg);
			const timestamp = this.dependencies.now();
			const diagram = await this.dependencies.diagramWriter.create(actor, {
				id: crypto.randomUUID() as Diagram['id'],
				userId: actor.userId,
				projectId: input.projectId,
				conversationId: input.conversationId,
				kind: 'drawio',
				title: input.title,
				source,
				renderedSvg,
				searchableText: await this.dependencies.drawioTextExtractor.extract({ source }),
				currentRevision: 1,
				publishedRevision: 1,
				publishedAt: timestamp,
				createdAt: timestamp,
				updatedAt: timestamp
			});
			await this.dependencies.diagramIndexer.index(actor, diagram);
			if (diagram.kind === 'drawio')
				await this.dependencies.diagramDraftWriter.recordRevision(actor, diagram);
			return { diagram, created: true };
		});
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

	countDiagramReferences(actor: ActorContext, input: CountDiagramReferencesInput): Promise<number> {
		return this.dependencies.diagramReferences.countReferencingNotes(actor, input.diagramId);
	}
}
