import type { AttachmentReader } from '$lib/server/services/attachments/library';
import type { IAttachmentStorage } from '$lib/server/services/attachments/object-storage';
import type { TemplateStyleReader } from '$lib/server/services/deliverables/template-styles';
import type { PdfRendering } from '$lib/server/services/deliverables/pdf';
import type { DiagramRasterization } from '$lib/server/services/deliverables/diagram-rendering';

import type { DocumentBundlePacker } from '$lib/server/services/deliverables/bundle';
import type { DocxRenderer } from '$lib/server/services/deliverables/docx';
import type { IWidgetExportService } from '$lib/services/widgets/export-blocks';
import type { IWidgetSourceService } from '$lib/services/widgets/sources';
import type { WorkspaceCommandRules } from '$lib/services/workspace/commands';
import type { IWidgetEvaluationService } from '$lib/services/widgets/edits';

import type { Todo, TodoListFilter } from '$lib/models/todos';
import type { Widget, WidgetExport, WidgetId, WidgetSourceRows } from '$lib/models/widgets';

import { NotFoundError, ValidationError } from '$lib/errors';
import type { AttachmentId } from '$lib/models/attachments';
import type {
	Artifact,
	ArtifactId,
	ExportDiagramRaster,
	ExportDiagramSource,
	ExportSettings,
	GenerateBundleInput,
	GenerateBundleOutput,
	GenerateDocumentInput,
	GenerateDocumentOutput,
	GetArtifactDownloadOutput,
	ListArtifactsOutput,
	ListArtifactsParams,
	PreviewDocumentInput,
	PreviewDocumentOutput,
	TemplateId
} from '$lib/models/deliverables';
import { type ExportInput, type PreparedExport } from '$lib/models/deliverables';
import type { Diagram, DiagramId } from '$lib/models/diagrams';
import type { ActorContext } from '$lib/models/identity';
import type { Note, NoteId, NoteSummary } from '$lib/models/notes';
import type { ProjectId, ProjectTemplate, TemplateUpload } from '$lib/models/projects';
import type { Provenance, ProvenanceRequest } from '$lib/models/provenance';
import type {
	DateTime,
	LocalDate,
	AtomicOperation as TransactionRunner
} from '$lib/models/workspace';
import type {
	DeliverableMutationRequest,
	WorkspaceMutationResult
} from '$lib/models/workspace-mutations';
import type {
	ArtifactStore,
	ExportSettingsStore
} from '$lib/server/services/deliverables/artifacts';
import type { TemplateStore } from '$lib/server/services/deliverables/templates';
import type { WorkspaceMutationGuard } from '$lib/server/services/workspace/mutation-receipts';
import type { ArtifactFiles } from '$lib/services/deliverables/artifact-files';
import type { ExportPreparation } from '$lib/services/deliverables/export-preparation';
import type { ExportSettingsRules } from '$lib/services/deliverables/settings';
import type { MermaidThemeRules } from '$lib/services/diagrams/mermaid-theme';
import { createHash, randomUUID } from 'node:crypto';

export interface ExportObjectStorage {
	createUploadUrl(input: {
		objectKey: string;
		mediaType: string;
		byteSize: number;
		checksumSha256: string;
		expiresInSeconds: number;
	}): Promise<string>;
	createDownloadUrl(
		objectKey: string,
		expiresInSeconds: number,
		downloadFilename?: string
	): Promise<string>;
	put(objectKey: string, data: Uint8Array, mediaType: string): Promise<void>;
	read(objectKey: string, maximumBytes: number): Promise<Uint8Array>;
	remove(objectKey: string): Promise<void>;
}

/**
 * Application boundary for deliverables: document templates, generated artifacts, and
 * per-project export settings.
 *
 * Template uploads are two-phase (initiate then complete) so an abandoned upload never
 * leaves a partial template behind. Generated artifact metadata and provenance commit together.
 */
export interface DeliverablesController {
	synchronize(input: DeliverableMutationRequest): Promise<WorkspaceMutationResult>;
	/**
	 * Begin a template upload: reserve a template record and return a presigned URL the
	 * client writes the file to. The template becomes visible only after
	 * {@link completeTemplateUpload}.
	 */
	initiateTemplateUpload(input: {
		projectId: ProjectId;
		name: string;
		mediaType: string;
		byteSize: number;
		checksumSha256: string;
	}): Promise<{
		templateId: TemplateId;
		uploadUrl: string;
		requiredHeaders: Record<string, string>;
	}>;
	/** Finalize a completed template upload and make the template usable for generation. */
	completeTemplateUpload(templateId: TemplateId): Promise<void>;
	/** List the templates available to a project, in display order. */
	listTemplates(projectId: ProjectId): Promise<readonly ProjectTemplate[]>;
	/** Permanently remove a template. */
	deleteTemplate(templateId: TemplateId): Promise<void>;
	/**
	 * Generate a finished document artifact from a template and note content.
	 *
	 * Render and upload before committing artifact metadata and provenance together.
	 * Remove the new upload if signing or persistence fails.
	 */
	generateDocument(input: GenerateDocumentInput): Promise<GenerateDocumentOutput>;
	/**
	 * Generate one document per note and return them zipped.
	 *
	 * Store an ephemeral zip without artifact metadata or provenance. The zip does not
	 * appear in the artifact library.
	 */
	generateBundle(input: GenerateBundleInput): Promise<GenerateBundleOutput>;
	/**
	 * Render a document for preview without persisting it, returning the rendered bytes
	 * as base64 so the client can show them immediately. Intentionally side-effect free.
	 */
	previewDocument(input: PreviewDocumentInput): Promise<PreviewDocumentOutput>;
	/** Read the export settings saved for a project. */
	getExportSettings(projectId: ProjectId): Promise<ExportSettings>;
	/** Persist the export settings for a project and return them as stored. */
	updateExportSettings(projectId: ProjectId, settings: ExportSettings): Promise<ExportSettings>;
	/** List the generated artifacts in a project, with paging/filtering params. */
	listArtifacts(projectId: ProjectId, params?: ListArtifactsParams): Promise<ListArtifactsOutput>;
	/** Fetch an artifact's metadata, or `undefined` when it does not exist. */
	getArtifact(artifactId: ArtifactId): Promise<Artifact | undefined>;
	/** Return a presigned URL that streams an artifact's file bytes. */
	downloadArtifact(artifactId: ArtifactId): Promise<GetArtifactDownloadOutput>;
	/** Permanently delete an artifact. */
	deleteArtifact(artifactId: ArtifactId): Promise<Pick<Artifact, 'id' | 'title'>>;
	/**
	 * Create a new artifact from the existing source identities and current note/settings
	 * state. Preserve the original artifact and its stored content.
	 */
	regenerateArtifact(artifactId: ArtifactId): Promise<GenerateDocumentOutput>;
}

/** Everything the {@link DeliverablesController} needs, injected so it can be built and tested without real stores. */
export interface DeliverablesDependencies {
	readonly exportSettingsRules: ExportSettingsRules;
	readonly artifactFiles: ArtifactFiles;
	syncMutations: WorkspaceMutationGuard;
	syncRetry: 'database-only' | 'never';
	templateStore: TemplateStore;
	templateStorage: ExportObjectStorage;
	templateStyles: TemplateStyleReader;
	noteReader: { get(id: NoteId): Promise<Note> };
	provenanceRecorder: {
		record(input: ProvenanceRequest): Promise<Provenance>;
	};
	artifactStore: ArtifactStore;
	artifactStorage: ExportObjectStorage;
	attachmentReader: Pick<AttachmentReader, 'get'>;
	attachmentStorage: Pick<IAttachmentStorage, 'createDownloadUrl'>;
	fetchImage: (url: string) => Promise<string | undefined>;
	prepareExport: ExportPreparation;
	widgetReader: { get(id: WidgetId): Promise<Widget> };
	/** The project's todos and notes, read only for a widget that shows them. */
	todoLister: { list(filter: TodoListFilter): Promise<readonly Todo[]> };
	noteLister: {
		list(projectId?: ProjectId): Promise<readonly NoteSummary[]>;
	};
	diagramReader: { get(id: DiagramId): Promise<Diagram> };
	diagramRenderer: DiagramRasterization;
	readonly mermaidThemes: MermaidThemeRules;
	readonly widgetExports: IWidgetExportService;
	readonly widgetSources: IWidgetSourceService;
	readonly widgetEvaluation: IWidgetEvaluationService;
	docxGenerator: DocxRenderer;
	pdfGenerator: PdfRendering;
	zipPacker: DocumentBundlePacker;
	exportSettings: ExportSettingsStore;
	transactionRunner: TransactionRunner;
}

export class Deliverables implements DeliverablesController {
	async synchronize(input: DeliverableMutationRequest): Promise<WorkspaceMutationResult> {
		try {
			return await this.dependencies.transactionRunner.run(
				async () => {
					const target = this.workspaceCommandRules.mutationResource(input.command);
					const prepared = await this.dependencies.syncMutations.prepare(input, {
						identity: target,
						key: this.workspaceCommandRules.workspaceResourceKey(target)
					});
					if (prepared.kind === 'finished') return prepared.result;
					await this.applySynchronizedCommand(input);
					return this.dependencies.syncMutations.complete(input, target);
				},
				{ retry: this.dependencies.syncRetry }
			);
		} catch (error) {
			if (!(error instanceof Error)) throw error;
			return this.dependencies.syncMutations.reject(error);
		}
	}

	private async applySynchronizedCommand(input: DeliverableMutationRequest): Promise<void> {
		const command = input.command;
		if (command.userId !== this.actor.userId)
			throw new ValidationError('The export settings belong to another account');
		await this.updateExportSettings(command.projectId, command.settings);
	}
	constructor(
		private readonly actor: ActorContext,
		private readonly workspaceCommandRules: WorkspaceCommandRules,
		private readonly dependencies: DeliverablesDependencies
	) {}

	async initiateTemplateUpload(input: {
		projectId: ProjectId;
		name: string;
		mediaType: string;
		byteSize: number;
		checksumSha256: string;
	}) {
		const upload = await this.dependencies.templateStore.reserveUpload(input);
		const uploadUrl = await this.dependencies.templateStorage.createUploadUrl({
			objectKey: upload.objectKey,
			mediaType: upload.mediaType,
			byteSize: upload.byteSize,
			checksumSha256: upload.checksumSha256,
			expiresInSeconds: 600
		});
		return {
			templateId: upload.id,
			uploadUrl,
			requiredHeaders: {
				'content-type': upload.mediaType,
				'x-amz-meta-sha256': upload.checksumSha256
			}
		};
	}

	async completeTemplateUpload(templateId: TemplateId): Promise<void> {
		const {
			templateStore,
			templateStorage: storage,
			templateStyles,
			transactionRunner
		} = this.dependencies;
		const stagingKey = `staging/${this.actor.userId}/templates/${templateId}`;
		if (await templateStore.find(templateId)) {
			await storage.remove(stagingKey);
			return;
		}
		let upload: TemplateUpload;
		let bytes: Uint8Array;
		try {
			upload = await templateStore.upload(templateId);
			bytes = await storage.read(upload.objectKey, upload.byteSize);
		} catch (error) {
			// Another completion may remove the reservation or staging after our initial read.
			if (await templateStore.find(templateId)) {
				await storage.remove(stagingKey);
				return;
			}
			throw error;
		}
		const styles = await templateStyles.read(upload, bytes);
		const destination = `projects/${upload.projectId}/templates/${templateId}`;
		// Write the exact bytes verified above. A signed staging URL may still accept writes.
		await storage.put(destination, bytes, upload.mediaType);
		await transactionRunner.run(async () => {
			const locked = await templateStore.lockUpload(templateId);
			if (await templateStore.find(templateId)) return;
			if (!locked) throw new NotFoundError('Template upload no longer exists');
			await templateStore.store(locked, destination, styles);
			await templateStore.finishUpload(templateId);
		});
		await storage.remove(stagingKey);
	}

	async listTemplates(projectId: ProjectId) {
		return this.dependencies.templateStore.list(projectId);
	}

	async deleteTemplate(templateId: TemplateId): Promise<void> {
		await this.dependencies.templateStore.delete(templateId);
	}

	async generateDocument(input: GenerateDocumentInput): Promise<GenerateDocumentOutput> {
		const prepared = await this.prepareDocument(input);
		const buffer = await this.renderDocument(input.format, prepared);
		const id = randomUUID() as ArtifactId;
		const objectKey = `artifacts/${this.actor.userId}/${id}.${input.format}`;
		const storage = this.dependencies.artifactStorage;
		await storage.put(
			objectKey,
			buffer,
			this.dependencies.artifactFiles.describe(input.title, input.format).mediaType
		);
		try {
			const downloadUrl = await storage.createDownloadUrl(
				objectKey,
				3600,
				this.dependencies.artifactFiles.describe(input.title, input.format).name
			);
			const artifact = await this.dependencies.transactionRunner.run(async () => {
				const provenance = await this.dependencies.provenanceRecorder.record({
					producerKind: 'user',
					producerName: 'document-export',
					metadata: {}
				});
				return this.dependencies.artifactStore.store({
					id,
					userId: this.actor.userId,
					projectId: input.projectId,
					title: input.title,
					format: input.format,
					objectKey,
					byteSize: buffer.length,
					sourceNoteIds: input.noteIds,
					templateId: input.templateId,
					provenanceId: provenance.id,
					...('runId' in provenance ? { runId: provenance.runId } : {}),
					createdAt: new Date().toISOString() as DateTime
				});
			});
			return { artifact, downloadUrl };
		} catch (error) {
			try {
				await storage.remove(objectKey);
			} catch (cleanupError) {
				throw new AggregateError(
					[error, cleanupError],
					'Export failed and its uploaded file could not be removed',
					{ cause: cleanupError }
				);
			}
			throw error;
		}
	}

	private async prepareDocument(
		input: PreviewDocumentInput & { templateId?: TemplateId }
	): Promise<PreparedExport> {
		const sourceNotes = await Promise.all(
			input.noteIds.map(async (id) => {
				const note = await this.dependencies.noteReader.get(id);
				return note;
			})
		);
		const notes = sourceNotes.map((note) => ({ title: note.title, document: note.document }));
		const assets = new Map(
			sourceNotes.map((note) => [note, this.dependencies.prepareExport.assets(note.document)])
		);
		const settings = input.settings
			? this.dependencies.exportSettingsRules.validate(input.settings)
			: await this.getExportSettings(input.projectId);
		const styles = input.templateId
			? await this.dependencies.templateStore.styles(input.templateId, input.projectId)
			: undefined;
		const images = new Map<string, string>();
		const pendingDiagrams = new Map<string, ExportDiagramSource>();
		for (const note of sourceNotes) {
			for (const reference of assets.get(note)!.diagrams) {
				if (reference.kind === 'mermaid') {
					const key = createHash('sha256').update(reference.source, 'utf8').digest('hex');
					if (!input.diagramPngs?.[key]) pendingDiagrams.set(key, { ...reference, key });
				} else {
					const diagram = await this.dependencies.diagramReader.get(
						reference.diagramId as DiagramId
					);
					if (
						diagram.projectId !== note.projectId ||
						diagram.kind !== 'drawio' ||
						diagram.archivedAt
					)
						throw new ValidationError(
							'An exported draw.io diagram is unavailable in the source note’s project'
						);
					if (diagram.currentRevision !== diagram.publishedRevision)
						throw new ValidationError(
							'Publish the current draw.io diagram before exporting it; its preview is out of date'
						);
					if (input.diagramPngs?.[diagram.id]) continue;
					if (!diagram.renderedSvg)
						throw new ValidationError(
							'Open and save the draw.io diagram before exporting it; its preview is missing'
						);
					pendingDiagrams.set(diagram.id, {
						kind: 'svg',
						key: diagram.id,
						source: diagram.renderedSvg
					});
				}
			}
		}
		const renderedDiagrams = pendingDiagrams.size
			? await this.dependencies.diagramRenderer.render(
					[...pendingDiagrams.values()],
					this.dependencies.mermaidThemes.resolve({
						base: settings.diagramTheme?.base ?? 'light',
						...(settings.diagramTheme?.colors ? { palette: settings.diagramTheme.colors } : {})
					}).config
				)
			: new Map<string, ExportDiagramRaster>();
		const diagramPngs = { ...input.diagramPngs };
		const diagramSizes = { ...input.diagramSizes };
		for (const [key, rendered] of renderedDiagrams) {
			diagramPngs[key] = rendered.png;
			diagramSizes[key] = rendered.size;
		}

		const imageReferences = new Map(
			[...assets.values()].flatMap((asset) =>
				asset.images.map((image) => [image.source, image] as const)
			)
		);
		for (const imageReference of imageReferences.values()) {
			if (imageReference.kind !== 'attachment') continue;
			const attachment = await this.dependencies.attachmentReader.get(
				imageReference.id as AttachmentId
			);
			const url = await this.dependencies.attachmentStorage.createDownloadUrl(
				attachment.version.objectKey,
				300
			);
			const image = await this.dependencies.fetchImage(url);
			if (image) images.set(imageReference.source, image);
		}

		// A widget the note embeds must be a live widget of the same project, as a diagram must;
		// an export that silently left one out would misrepresent the note.
		const widgets = new Map<string, WidgetExport>();
		for (const note of sourceNotes)
			for (const widgetId of assets.get(note)!.widgets) {
				if (widgets.has(widgetId)) continue;
				const widget = await this.dependencies.widgetReader.get(widgetId as WidgetId);
				if (widget.projectId !== note.projectId || widget.archivedAt)
					throw new ValidationError(
						'An exported widget is unavailable in the source note’s project. Restore it or remove it from the note.'
					);
				const sources = await this.widgetSources(widget);
				widgets.set(
					widgetId,
					this.dependencies.widgetExports.prepare(
						widget,
						this.dependencies.widgetEvaluation.resolve(widget.layout, widget.data, sources).state
					)
				);
			}
		const exportInput: ExportInput = {
			...input,
			notes,
			settings,
			images,
			widgets,
			diagramPngs,
			diagramSizes,
			...(styles ? { styles } : {})
		};
		return this.dependencies.prepareExport.prepare(exportInput);
	}

	private renderDocument(format: 'pdf' | 'docx', input: PreparedExport): Promise<Buffer> {
		return format === 'pdf'
			? this.dependencies.pdfGenerator.render(input)
			: this.dependencies.docxGenerator.render(input);
	}

	async generateBundle(input: GenerateBundleInput): Promise<GenerateBundleOutput> {
		if (!input.entries.length) throw new ValidationError('Select at least one document.');
		const files: { path: string; bytes: Uint8Array }[] = [];
		for (const entry of input.entries) {
			const prepared = await this.prepareDocument({ ...input, noteIds: [entry.noteId] });
			const note = prepared.notes[0];
			if (!note) throw new NotFoundError(`Note ${entry.noteId} not found`);
			const bytes = await this.renderDocument(input.format, { ...prepared, title: note.title });
			files.push({ path: `${entry.path}.${input.format}`, bytes });
		}
		const buffer = this.dependencies.zipPacker.pack(files);
		const objectKey = `bundles/${this.actor.userId}/${randomUUID()}.zip`;
		await this.dependencies.artifactStorage.put(objectKey, buffer, 'application/zip');
		try {
			const downloadUrl = await this.dependencies.artifactStorage.createDownloadUrl(
				objectKey,
				3600,
				this.dependencies.artifactFiles.describe(input.title, 'zip').name
			);
			return { downloadUrl, fileCount: files.length, byteSize: buffer.length };
		} catch (error) {
			try {
				await this.dependencies.artifactStorage.remove(objectKey);
			} catch (cleanupError) {
				throw new AggregateError(
					[error, cleanupError],
					'Bundle export failed and its uploaded file could not be removed',
					{ cause: cleanupError }
				);
			}
			throw error;
		}
	}

	async previewDocument(input: PreviewDocumentInput): Promise<PreviewDocumentOutput> {
		const buffer = await this.dependencies.pdfGenerator.render(await this.prepareDocument(input));
		return { data: buffer.toString('base64') };
	}

	async getExportSettings(projectId: ProjectId): Promise<ExportSettings> {
		return this.dependencies.exportSettings.getSettings(projectId);
	}

	async updateExportSettings(
		projectId: ProjectId,
		settings: ExportSettings
	): Promise<ExportSettings> {
		return this.dependencies.exportSettings.updateSettings(
			projectId,
			this.dependencies.exportSettingsRules.validate(settings)
		);
	}

	async listArtifacts(
		projectId: ProjectId,
		params?: ListArtifactsParams
	): Promise<ListArtifactsOutput> {
		return this.dependencies.artifactStore.list(projectId, params);
	}

	async getArtifact(artifactId: ArtifactId) {
		return this.dependencies.artifactStore.get(artifactId);
	}

	async downloadArtifact(artifactId: ArtifactId): Promise<GetArtifactDownloadOutput> {
		const artifact = await this.getArtifact(artifactId);
		if (!artifact) throw new NotFoundError('Artifact not found');
		return {
			url: await this.dependencies.artifactStorage.createDownloadUrl(
				artifact.objectKey,
				3600,
				this.dependencies.artifactFiles.describe(artifact.title, artifact.format).name
			)
		};
	}

	async deleteArtifact(artifactId: ArtifactId): Promise<Pick<Artifact, 'id' | 'title'>> {
		return this.dependencies.artifactStore.delete(artifactId);
	}

	async regenerateArtifact(artifactId: ArtifactId): Promise<GenerateDocumentOutput> {
		const existing = await this.getArtifact(artifactId);
		if (!existing) throw new NotFoundError('Artifact not found');
		return this.generateDocument({
			projectId: existing.projectId,
			noteIds: existing.sourceNoteIds,
			title: existing.title,
			format: existing.format,
			templateId: existing.templateId
		});
	}

	/**
	 * The rows a widget's sources show, as of the export. Today is the server's UTC date, so a
	 * todo due today reads as overdue only once that day has passed everywhere.
	 */
	private async widgetSources(widget: Widget): Promise<WidgetSourceRows> {
		if (!widget.layout.sources) return {};
		const [todos, notes] = await Promise.all([
			this.dependencies.todoLister.list({ projectId: widget.projectId }),
			this.dependencies.noteLister.list(widget.projectId)
		]);
		return this.dependencies.widgetSources.rows(widget.layout.sources, {
			projectId: widget.projectId,
			today: new Date().toISOString().slice(0, 10) as LocalDate,
			todos,
			notes
		});
	}
}
