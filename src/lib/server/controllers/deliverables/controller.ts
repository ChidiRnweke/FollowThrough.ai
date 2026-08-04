import type { ActorContext } from '$lib/models/identity';
import type {
	Artifact,
	ArtifactId,
	ExportSettings,
	GenerateDocumentInput,
	GenerateDocumentOutput,
	GetArtifactDownloadOutput,
	ListArtifactsOutput,
	ListArtifactsParams,
	PreviewDocumentInput,
	PreviewDocumentOutput,
	TemplateId
} from '$lib/models/deliverables';
import type { ProjectId, ProjectTemplate } from '$lib/models/projects';
import type {
	ArtifactDeleter,
	ArtifactLister,
	ArtifactReader,
	ArtifactRegenerator,
	DocumentGenerator,
	DocumentPreviewer,
	ExportSettingsReader,
	ExportSettingsWriter
} from '$lib/server/services/deliverables/artifact-contracts';
import type {
	TemplateDeleter,
	TemplateLister,
	TemplateUploader
} from '$lib/server/services/deliverables/template-contracts';
import type { AtomicOperation as TransactionRunner } from '$lib/models/workspace';

/**
 * Application boundary for deliverables: document templates, generated artifacts, and
 * per-project export settings.
 *
 * Template uploads are two-phase (initiate then complete) so an abandoned upload never
 * leaves a partial template behind; document generation runs inside a transaction so an
 * artifact is never observable half-written.
 */
export interface DeliverablesController {
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
	listTemplates(
		actor: ActorContext,
		projectId: ProjectId
	): Promise<readonly ProjectTemplate[]>;
	/** Permanently remove a template. */
	deleteTemplate(actor: ActorContext, templateId: TemplateId): Promise<void>;
	/**
	 * Generate a finished document artifact from a template and note content.
	 *
	 * Runs in a transaction so the artifact record, its content, and any provenance land
	 * atomically — a failed generation leaves no half-created artifact behind.
	 */
	generateDocument(
		actor: ActorContext,
		input: GenerateDocumentInput
	): Promise<GenerateDocumentOutput>;
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
	getArtifact(
		actor: ActorContext,
		artifactId: ArtifactId
	): Promise<Artifact | undefined>;
	/** Return a presigned URL that streams an artifact's file bytes. */
	downloadArtifact(actor: ActorContext, artifactId: ArtifactId): Promise<GetArtifactDownloadOutput>;
	/** Permanently delete an artifact. */
	deleteArtifact(actor: ActorContext, artifactId: ArtifactId): Promise<void>;
	/**
	 * Re-run generation for an existing artifact, replacing its content with a fresh
	 * render of the current note state. Used to refresh a document whose source changed.
	 */
	regenerateArtifact(actor: ActorContext, artifactId: ArtifactId): Promise<GenerateDocumentOutput>;
}

/** Everything the {@link DeliverablesController} needs, injected so it can be built and tested without real stores. */
export interface DeliverablesDependencies {
	templateUploader: TemplateUploader;
	templateLister: TemplateLister;
	templateDeleter: TemplateDeleter;
	documentGenerator: DocumentGenerator;
	documentPreviewer: DocumentPreviewer;
	exportSettingsReader: ExportSettingsReader;
	exportSettingsWriter: ExportSettingsWriter;
	artifactLister: ArtifactLister;
	artifactReader: ArtifactReader;
	artifactDeleter: ArtifactDeleter;
	artifactRegenerator: ArtifactRegenerator;
	transactionRunner: TransactionRunner;
}

export class Deliverables implements DeliverablesController {
	constructor(private readonly dependencies: DeliverablesDependencies) {}

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
		return this.dependencies.templateUploader.initiateUpload(actor, input);
	}

	async completeTemplateUpload(actor: ActorContext, templateId: TemplateId): Promise<void> {
		await this.dependencies.templateUploader.completeUpload(actor, templateId);
	}

	async listTemplates(actor: ActorContext, projectId: ProjectId) {
		return this.dependencies.templateLister.list(actor, projectId);
	}

	async deleteTemplate(actor: ActorContext, templateId: TemplateId): Promise<void> {
		await this.dependencies.templateDeleter.delete(actor, templateId);
	}

	async generateDocument(
		actor: ActorContext,
		input: GenerateDocumentInput
	): Promise<GenerateDocumentOutput> {
		return this.dependencies.transactionRunner.run(async () =>
			this.dependencies.documentGenerator.generate(actor, input)
		);
	}

	async previewDocument(
		actor: ActorContext,
		input: PreviewDocumentInput
	): Promise<PreviewDocumentOutput> {
		const buffer = await this.dependencies.documentPreviewer.preview(actor, input);
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
		return this.dependencies.exportSettingsWriter.updateSettings(actor, projectId, settings);
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
		return this.dependencies.artifactReader.download(actor, artifactId);
	}

	async deleteArtifact(actor: ActorContext, artifactId: ArtifactId): Promise<void> {
		await this.dependencies.artifactDeleter.delete(actor, artifactId);
	}

	async regenerateArtifact(
		actor: ActorContext,
		artifactId: ArtifactId
	): Promise<GenerateDocumentOutput> {
		return this.dependencies.artifactRegenerator.regenerate(actor, artifactId);
	}
}
