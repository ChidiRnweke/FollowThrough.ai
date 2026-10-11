import type { DiagramRenderResources } from '$lib/models/deliverables';
import type { MermaidRenderConfig } from '$lib/models/diagrams/mermaid-theme';
import type { PdfFontResources } from '$lib/models/deliverables';
import type { ToolResultReader } from '$lib/models/agent-tool-context';
import type { AgentToolInput } from '$lib/models/agent-tool-inputs';
import type { AgentPayload } from '$lib/models/agent/payload';
import type { PdfFontCache } from '$lib/server/stores/deliverables/pdf-fonts';
import type { PdfDocumentPreparation } from '$lib/server/services/deliverables/pdf';

import type { AgentToolPresentation } from '$lib/server/services/agent/runs/tool-views';
import type { DocumentBundlePacker } from '$lib/server/services/deliverables/bundle';
import type { DocxRenderer } from '$lib/server/services/deliverables/docx';
import type { AgentPayloadInspection } from '$lib/services/agent/payload';
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
	ExtractedTemplateStyles,
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
	ArtifactDeleter,
	ArtifactLister,
	ArtifactReader,
	ExportSettingsReader,
	ExportSettingsWriter
} from '$lib/server/services/deliverables/artifacts';
import type {
	TemplateLifecycle,
	TemplateReader,
	TemplateUploadLifecycle,
	TemplateWriter
} from '$lib/server/services/deliverables/templates';
import type { WorkspaceMutationGuard } from '$lib/server/services/workspace/mutation-receipts';
import type { ArtifactFiles } from '$lib/services/deliverables/artifact-files';
import type { ExportPreparation } from '$lib/services/deliverables/export-preparation';
import type { ExportSettingsRules } from '$lib/services/deliverables/settings';
import type { MermaidThemeRules } from '$lib/services/diagrams/mermaid-theme';
import { createHash, randomUUID } from 'node:crypto';
import type { DiagramRenderCache } from '$lib/server/stores/deliverables/diagram-resources';

export interface TemplateUploadProof {
	readonly byteSize: number;
	readonly checksumSha256: string;
}
export interface TemplateStyleReader {
	read(upload: TemplateUploadProof, bytes: Uint8Array): Promise<ExtractedTemplateStyles>;
}
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
	synchronize(
		actor: ActorContext,
		input: DeliverableMutationRequest
	): Promise<WorkspaceMutationResult>;
	/**
	 * Begin a template upload: reserve a template record and return a presigned URL the
	 * client writes the file to. The template becomes visible only after
	 * {@link completeTemplateUpload}.
	 */
	initiateTemplateUpload(
		actor: ActorContext,
		input: {
			projectId: ProjectId;
			name: string;
			mediaType: string;
			byteSize: number;
			checksumSha256: string;
		}
	): Promise<{
		templateId: TemplateId;
		uploadUrl: string;
		requiredHeaders: Record<string, string>;
	}>;
	/** Finalize a completed template upload and make the template usable for generation. */
	completeTemplateUpload(actor: ActorContext, templateId: TemplateId): Promise<void>;
	/** List the templates available to a project, in display order. */
	listTemplates(actor: ActorContext, projectId: ProjectId): Promise<readonly ProjectTemplate[]>;
	/** Permanently remove a template. */
	deleteTemplate(actor: ActorContext, templateId: TemplateId): Promise<void>;
	/**
	 * Generate a finished document artifact from a template and note content.
	 *
	 * Render and upload before committing artifact metadata and provenance together.
	 * Remove the new upload if signing or persistence fails.
	 */
	generateDocument(
		actor: ActorContext,
		input: GenerateDocumentInput
	): Promise<GenerateDocumentOutput>;
	/**
	 * Generate one document per note and return them zipped.
	 *
	 * Store an ephemeral zip without artifact metadata or provenance. The zip does not
	 * appear in the artifact library.
	 */
	generateBundle(actor: ActorContext, input: GenerateBundleInput): Promise<GenerateBundleOutput>;
	/**
	 * Render a document for preview without persisting it, returning the rendered bytes
	 * as base64 so the client can show them immediately. Intentionally side-effect free.
	 */
	previewDocument(actor: ActorContext, input: PreviewDocumentInput): Promise<PreviewDocumentOutput>;
	/** Read the export settings saved for a project. */
	getExportSettings(actor: ActorContext, projectId: ProjectId): Promise<ExportSettings>;
	/** Persist the export settings for a project and return them as stored. */
	updateExportSettings(
		actor: ActorContext,
		projectId: ProjectId,
		settings: ExportSettings
	): Promise<ExportSettings>;
	/** List the generated artifacts in a project, with paging/filtering params. */
	listArtifacts(
		actor: ActorContext,
		projectId: ProjectId,
		params?: ListArtifactsParams
	): Promise<ListArtifactsOutput>;
	/** Fetch an artifact's metadata, or `undefined` when it does not exist. */
	getArtifact(actor: ActorContext, artifactId: ArtifactId): Promise<Artifact | undefined>;
	/** Return a presigned URL that streams an artifact's file bytes. */
	downloadArtifact(actor: ActorContext, artifactId: ArtifactId): Promise<GetArtifactDownloadOutput>;
	/** Permanently delete an artifact. */
	deleteArtifact(
		actor: ActorContext,
		artifactId: ArtifactId
	): Promise<Pick<Artifact, 'id' | 'title'>>;
	/**
	 * Create a new artifact from the existing source identities and current note/settings
	 * state. Preserve the original artifact and its stored content.
	 */
	regenerateArtifact(actor: ActorContext, artifactId: ArtifactId): Promise<GenerateDocumentOutput>;

	agentExportDocument(
		actor: ActorContext,
		input: AgentToolInput<'export_document'>
	): Promise<AgentPayload>;
	agentListArtifacts(
		actor: ActorContext,
		input: AgentToolInput<'list_artifacts'>
	): Promise<AgentPayload>;
	agentListTemplates(
		actor: ActorContext,
		input: AgentToolInput<'list_templates'>
	): Promise<AgentPayload>;
	agentGetExportSettings(
		actor: ActorContext,
		input: AgentToolInput<'get_export_settings'>
	): Promise<AgentPayload>;
	agentUpdateExportSettings(
		actor: ActorContext,
		input: AgentToolInput<'update_export_settings'>
	): Promise<AgentPayload>;
	agentGetArtifact(
		actor: ActorContext,
		input: AgentToolInput<'get_artifact'>
	): Promise<AgentPayload>;
	agentDownloadArtifact(
		actor: ActorContext,
		input: AgentToolInput<'download_artifact'>
	): Promise<AgentPayload>;
	agentDeleteArtifact(
		actor: ActorContext,
		input: AgentToolInput<'delete_artifact'>
	): Promise<AgentPayload>;
	agentRegenerateArtifact(
		actor: ActorContext,
		input: AgentToolInput<'regenerate_artifact'>
	): Promise<AgentPayload>;
}

/** Everything the {@link DeliverablesController} needs, injected so it can be built and tested without real stores. */
export interface DeliverablesDependencies {
	readonly toolPresentation: AgentToolPresentation;
	readonly toolPayloads: AgentPayloadInspection;
	readonly toolResults: ToolResultReader;

	readonly exportSettingsRules: ExportSettingsRules;
	readonly artifactFiles: ArtifactFiles;
	syncMutations: WorkspaceMutationGuard;
	syncRetry: 'database-only' | 'never';
	templateUploads: TemplateUploadLifecycle;
	templateReader: TemplateReader;
	templateWriter: TemplateWriter;
	templateLifecycle: TemplateLifecycle;
	templateStorage: ExportObjectStorage;
	templateStyles: TemplateStyleReader;
	noteReader: { get(actor: ActorContext, id: NoteId): Promise<Note> };
	provenanceRecorder: {
		record(actor: ActorContext, input: ProvenanceRequest): Promise<Provenance>;
	};
	artifactWriter: { store(actor: ActorContext, artifact: Artifact): Promise<Artifact> };
	artifactStorage: ExportObjectStorage;
	attachmentDownloader: {
		downloadById(actor: ActorContext, id: AttachmentId): Promise<{ url: string }>;
	};
	fetchImage: (url: string) => Promise<string | undefined>;
	prepareExport: ExportPreparation;
	widgetReader: { get(actor: ActorContext, id: WidgetId): Promise<Widget> };
	/** The project's todos and notes, read only for a widget that shows them. */
	todoLister: { list(actor: ActorContext, filter: TodoListFilter): Promise<readonly Todo[]> };
	noteLister: {
		list(actor: ActorContext, projectId?: ProjectId): Promise<readonly NoteSummary[]>;
	};
	diagramReader: { get(actor: ActorContext, id: DiagramId): Promise<Diagram> };
	diagramRenderer: {
		state: DiagramRenderCache;
		reader: DiagramRenderResourceReader;
		renderer: DiagramRasterRendering;
	};
	readonly mermaidThemes: MermaidThemeRules;
	readonly widgetExports: IWidgetExportService;
	readonly widgetSources: IWidgetSourceService;
	readonly widgetEvaluation: IWidgetEvaluationService;
	docxGenerator: DocxRenderer;
	pdfGenerator: {
		state: PdfFontCache;
		fonts: PdfFontReader;
		preparation: PdfDocumentPreparation;
		writer: PdfDocumentWriter;
	};
	zipPacker: DocumentBundlePacker;
	exportSettingsReader: ExportSettingsReader;
	exportSettingsWriter: ExportSettingsWriter;
	artifactLister: ArtifactLister;
	artifactReader: ArtifactReader;
	artifactDeleter: ArtifactDeleter;
	transactionRunner: TransactionRunner;
}

export class Deliverables implements DeliverablesController {
	async synchronize(
		actor: ActorContext,
		input: DeliverableMutationRequest
	): Promise<WorkspaceMutationResult> {
		try {
			return await this.dependencies.transactionRunner.run(
				async () => {
					const target = this.workspaceCommandRules.mutationResource(input.command);
					const prepared = await this.dependencies.syncMutations.prepare(actor, input, {
						identity: target,
						key: this.workspaceCommandRules.workspaceResourceKey(target)
					});
					if (prepared.kind === 'finished') return prepared.result;
					await this.applySynchronizedCommand(actor, input);
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
		input: DeliverableMutationRequest
	): Promise<void> {
		const command = input.command;
		if (command.userId !== actor.userId)
			throw new ValidationError('The export settings belong to another account');
		await this.updateExportSettings(actor, command.projectId, command.settings);
	}
	constructor(
		private readonly workspaceCommandRules: WorkspaceCommandRules,
		private readonly dependencies: DeliverablesDependencies
	) {}

	async initiateTemplateUpload(
		actor: ActorContext,
		input: {
			projectId: ProjectId;
			name: string;
			mediaType: string;
			byteSize: number;
			checksumSha256: string;
		}
	) {
		const upload = await this.dependencies.templateUploads.reserveUpload(actor, input);
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

	async completeTemplateUpload(actor: ActorContext, templateId: TemplateId): Promise<void> {
		const {
			templateUploads,
			templateReader,
			templateWriter,
			templateStorage: storage,
			templateStyles,
			transactionRunner
		} = this.dependencies;
		const stagingKey = `staging/${actor.userId}/templates/${templateId}`;
		if (await templateReader.find(actor, templateId)) {
			await storage.remove(stagingKey);
			return;
		}
		let upload: TemplateUpload;
		let bytes: Uint8Array;
		try {
			upload = await templateUploads.upload(actor, templateId);
			bytes = await storage.read(upload.objectKey, upload.byteSize);
		} catch (error) {
			// Another completion may remove the reservation or staging after our initial read.
			if (await templateReader.find(actor, templateId)) {
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
			const locked = await templateUploads.lockUpload(actor, templateId);
			if (await templateReader.find(actor, templateId)) return;
			if (!locked) throw new NotFoundError('Template upload no longer exists');
			await templateWriter.store(actor, locked, destination, styles);
			await templateUploads.finishUpload(actor, templateId);
		});
		await storage.remove(stagingKey);
	}

	async listTemplates(actor: ActorContext, projectId: ProjectId) {
		return this.dependencies.templateReader.list(actor, projectId);
	}

	async deleteTemplate(actor: ActorContext, templateId: TemplateId): Promise<void> {
		await this.dependencies.templateLifecycle.delete(actor, templateId);
	}

	async generateDocument(
		actor: ActorContext,
		input: GenerateDocumentInput
	): Promise<GenerateDocumentOutput> {
		const prepared = await this.prepareDocument(actor, input);
		const buffer = await this.renderDocument(input.format, prepared);
		const id = randomUUID() as ArtifactId;
		const objectKey = `artifacts/${actor.userId}/${id}.${input.format}`;
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
				const provenance = await this.dependencies.provenanceRecorder.record(actor, {
					producerKind: 'user',
					producerName: 'document-export',
					metadata: {}
				});
				return this.dependencies.artifactWriter.store(actor, {
					id,
					userId: actor.userId,
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
		actor: ActorContext,
		input: PreviewDocumentInput & { templateId?: TemplateId }
	): Promise<PreparedExport> {
		const sourceNotes = await Promise.all(
			input.noteIds.map(async (id) => {
				const note = await this.dependencies.noteReader.get(actor, id);
				return note;
			})
		);
		const notes = sourceNotes.map((note) => ({ title: note.title, document: note.document }));
		const assets = new Map(
			sourceNotes.map((note) => [note, this.dependencies.prepareExport.assets(note.document)])
		);
		const settings = input.settings
			? this.dependencies.exportSettingsRules.validate(input.settings)
			: await this.getExportSettings(actor, input.projectId);
		const styles = input.templateId
			? await this.dependencies.templateReader.styles(actor, input.templateId, input.projectId)
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
						actor,
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
			? await this.renderDiagrams(
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
			const { url } = await this.dependencies.attachmentDownloader.downloadById(
				actor,
				imageReference.id as AttachmentId
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
				const widget = await this.dependencies.widgetReader.get(actor, widgetId as WidgetId);
				if (widget.projectId !== note.projectId || widget.archivedAt)
					throw new ValidationError(
						'An exported widget is unavailable in the source note’s project. Restore it or remove it from the note.'
					);
				const sources = await this.widgetSources(actor, widget);
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
		return format === 'pdf' ? this.renderPdf(input) : this.dependencies.docxGenerator.render(input);
	}

	async generateBundle(
		actor: ActorContext,
		input: GenerateBundleInput
	): Promise<GenerateBundleOutput> {
		if (!input.entries.length) throw new ValidationError('Select at least one document.');
		const files: { path: string; bytes: Uint8Array }[] = [];
		for (const entry of input.entries) {
			const prepared = await this.prepareDocument(actor, { ...input, noteIds: [entry.noteId] });
			const note = prepared.notes[0];
			if (!note) throw new NotFoundError(`Note ${entry.noteId} not found`);
			const bytes = await this.renderDocument(input.format, { ...prepared, title: note.title });
			files.push({ path: `${entry.path}.${input.format}`, bytes });
		}
		const buffer = this.dependencies.zipPacker.pack(files);
		const objectKey = `bundles/${actor.userId}/${randomUUID()}.zip`;
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

	async previewDocument(
		actor: ActorContext,
		input: PreviewDocumentInput
	): Promise<PreviewDocumentOutput> {
		const buffer = await this.renderPdf(await this.prepareDocument(actor, input));
		return { data: buffer.toString('base64') };
	}

	async getExportSettings(actor: ActorContext, projectId: ProjectId): Promise<ExportSettings> {
		return this.dependencies.exportSettingsReader.getSettings(actor, projectId);
	}

	async updateExportSettings(
		actor: ActorContext,
		projectId: ProjectId,
		settings: ExportSettings
	): Promise<ExportSettings> {
		return this.dependencies.exportSettingsWriter.updateSettings(
			actor,
			projectId,
			this.dependencies.exportSettingsRules.validate(settings)
		);
	}

	async listArtifacts(
		actor: ActorContext,
		projectId: ProjectId,
		params?: ListArtifactsParams
	): Promise<ListArtifactsOutput> {
		return this.dependencies.artifactLister.list(actor, projectId, params);
	}

	async getArtifact(actor: ActorContext, artifactId: ArtifactId) {
		return this.dependencies.artifactReader.get(actor, artifactId);
	}

	async downloadArtifact(
		actor: ActorContext,
		artifactId: ArtifactId
	): Promise<GetArtifactDownloadOutput> {
		const artifact = await this.getArtifact(actor, artifactId);
		if (!artifact) throw new NotFoundError('Artifact not found');
		return {
			url: await this.dependencies.artifactStorage.createDownloadUrl(
				artifact.objectKey,
				3600,
				this.dependencies.artifactFiles.describe(artifact.title, artifact.format).name
			)
		};
	}

	async deleteArtifact(
		actor: ActorContext,
		artifactId: ArtifactId
	): Promise<Pick<Artifact, 'id' | 'title'>> {
		return this.dependencies.artifactDeleter.delete(actor, artifactId);
	}

	async regenerateArtifact(
		actor: ActorContext,
		artifactId: ArtifactId
	): Promise<GenerateDocumentOutput> {
		const existing = await this.getArtifact(actor, artifactId);
		if (!existing) throw new NotFoundError('Artifact not found');
		return this.generateDocument(actor, {
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
	private async widgetSources(actor: ActorContext, widget: Widget): Promise<WidgetSourceRows> {
		if (!widget.layout.sources) return {};
		const [todos, notes] = await Promise.all([
			this.dependencies.todoLister.list(actor, { projectId: widget.projectId }),
			this.dependencies.noteLister.list(actor, widget.projectId)
		]);
		return this.dependencies.widgetSources.rows(widget.layout.sources, {
			projectId: widget.projectId,
			today: new Date().toISOString().slice(0, 10) as LocalDate,
			todos,
			notes
		});
	}

	async agentExportDocument(
		actor: ActorContext,
		input: AgentToolInput<'export_document'>
	): Promise<AgentPayload> {
		const result = await (async () => {
			return this.generateDocument(actor, {
				projectId: input.projectId as ProjectId,
				noteIds: input.noteIds.map((noteId) => noteId as NoteId),
				title: input.title,
				format: input.format,
				...(input.templateId ? { templateId: input.templateId as TemplateId } : {})
			});
		})();
		const payload = this.dependencies.toolResults.read(result);
		return this.dependencies.toolPayloads.filterResult(
			payload,
			this.dependencies.toolResults.arguments(input)
		);
	}
	async agentListArtifacts(
		actor: ActorContext,
		input: AgentToolInput<'list_artifacts'>
	): Promise<AgentPayload> {
		const result = await (async () => {
			return this.listArtifacts(actor, input.projectId);
		})();
		const payload = this.dependencies.toolResults.read(result);
		return this.dependencies.toolPayloads.filterResult(
			payload,
			this.dependencies.toolResults.arguments(input)
		);
	}
	async agentListTemplates(
		actor: ActorContext,
		input: AgentToolInput<'list_templates'>
	): Promise<AgentPayload> {
		const result = await (async () => {
			return this.listTemplates(actor, input.projectId);
		})();
		const payload = this.dependencies.toolResults.read(result);
		return this.dependencies.toolPayloads.filterResult(
			payload,
			this.dependencies.toolResults.arguments(input)
		);
	}
	async agentGetExportSettings(
		actor: ActorContext,
		input: AgentToolInput<'get_export_settings'>
	): Promise<AgentPayload> {
		const result = await (async () => {
			return this.getExportSettings(actor, input.projectId);
		})();
		const payload = this.dependencies.toolResults.read(result);
		return this.dependencies.toolPayloads.filterResult(
			payload,
			this.dependencies.toolResults.arguments(input)
		);
	}
	async agentUpdateExportSettings(
		actor: ActorContext,
		input: AgentToolInput<'update_export_settings'>
	): Promise<AgentPayload> {
		const result = await (async () => {
			const { projectId, ...settings } = input;

			return this.updateExportSettings(actor, projectId, settings);
		})();
		const payload = this.dependencies.toolResults.read(result);
		return this.dependencies.toolPayloads.filterResult(
			payload,
			this.dependencies.toolResults.arguments(input)
		);
	}
	async agentGetArtifact(
		actor: ActorContext,
		input: AgentToolInput<'get_artifact'>
	): Promise<AgentPayload> {
		const result = await (async () => {
			const artifact = await this.getArtifact(actor, input.artifactId);
			if (!artifact) throw new NotFoundError('Artifact not found');
			return artifact;
		})();
		const payload = this.dependencies.toolResults.read(result);
		return this.dependencies.toolPayloads.filterResult(
			payload,
			this.dependencies.toolResults.arguments(input)
		);
	}
	async agentDownloadArtifact(
		actor: ActorContext,
		input: AgentToolInput<'download_artifact'>
	): Promise<AgentPayload> {
		const result = await (async () => {
			return this.downloadArtifact(actor, input.artifactId);
		})();
		const payload = this.dependencies.toolResults.read(result);
		return this.dependencies.toolPayloads.filterResult(
			payload,
			this.dependencies.toolResults.arguments(input)
		);
	}
	async agentDeleteArtifact(
		actor: ActorContext,
		input: AgentToolInput<'delete_artifact'>
	): Promise<AgentPayload> {
		const result = await (async () => {
			const deleted = await this.deleteArtifact(actor, input.artifactId);
			return { artifactId: deleted.id, title: deleted.title, deleted: true as const };
		})();
		const payload = this.dependencies.toolResults.read(result);
		return this.dependencies.toolPayloads.filterResult(
			payload,
			this.dependencies.toolResults.arguments(input)
		);
	}
	async agentRegenerateArtifact(
		actor: ActorContext,
		input: AgentToolInput<'regenerate_artifact'>
	): Promise<AgentPayload> {
		const result = await (async () => {
			return this.regenerateArtifact(actor, input.artifactId);
		})();
		const payload = this.dependencies.toolResults.read(result);
		return this.dependencies.toolPayloads.filterResult(
			payload,
			this.dependencies.toolResults.arguments(input)
		);
	}
	private async renderPdf(input: PreparedExport): Promise<Buffer> {
		const resources = await this.pdfResources();
		const document = this.dependencies.pdfGenerator.preparation.prepare(input, resources);
		return this.dependencies.pdfGenerator.writer.write(document, resources);
	}
	private async pdfResources(): Promise<PdfFontResources> {
		const state = this.dependencies.pdfGenerator.state.current;
		if (state.kind === 'ready') return state.resources;
		if (state.kind === 'loading') return state.pending;
		const pending = this.dependencies.pdfGenerator.fonts.read().then(
			(resources) => {
				this.dependencies.pdfGenerator.state.setReady(resources);
				return resources;
			},
			(error) => {
				this.dependencies.pdfGenerator.state.clear();
				throw error;
			}
		);
		this.dependencies.pdfGenerator.state.setLoading(pending);
		return pending;
	}
	private async renderDiagrams(
		sources: readonly ExportDiagramSource[],
		config: MermaidRenderConfig
	): Promise<ReadonlyMap<string, ExportDiagramRaster>> {
		if (!sources.length) return new Map();
		const resources = await this.diagramResources();
		return this.dependencies.diagramRenderer.renderer.render(sources, config, resources);
	}
	private async diagramResources(): Promise<DiagramRenderResources> {
		const state = this.dependencies.diagramRenderer.state.current;
		if (state.kind === 'ready') return state.resources;
		if (state.kind === 'loading') return state.pending;
		const pending = this.dependencies.diagramRenderer.reader.read().then(
			(resources) => {
				this.dependencies.diagramRenderer.state.setReady(resources);
				return resources;
			},
			(error) => {
				this.dependencies.diagramRenderer.state.clear();
				throw new Error('A diagram could not be rendered for export', { cause: error });
			}
		);
		this.dependencies.diagramRenderer.state.setLoading(pending);
		return pending;
	}
}

/** Low-level adapter contract; the owning controller coordinates the application operation. */
export interface PdfFontReader {
	read(): Promise<PdfFontResources>;
}
export interface PdfDocumentWriter {
	write(
		document: import('pdfmake').PdfDocumentDefinition,
		resources: PdfFontResources
	): Promise<Buffer>;
}
export interface DiagramRenderResourceReader {
	read(): Promise<DiagramRenderResources>;
}
export interface DiagramRasterRendering {
	render(
		sources: readonly ExportDiagramSource[],
		config: MermaidRenderConfig,
		resources: DiagramRenderResources
	): Promise<ReadonlyMap<string, ExportDiagramRaster>>;
}
