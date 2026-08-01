import type { ActorContext } from '$lib/models/identity';
import type {
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
import type { ProjectId } from '$lib/models/projects';
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

export interface DeliverablesController {
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
	completeTemplateUpload(actor: ActorContext, templateId: TemplateId): Promise<void>;
	listTemplates(
		actor: ActorContext,
		projectId: ProjectId
	): Promise<readonly import('$lib/models/projects').ProjectTemplate[]>;
	deleteTemplate(actor: ActorContext, templateId: TemplateId): Promise<void>;
	generateDocument(
		actor: ActorContext,
		input: GenerateDocumentInput
	): Promise<GenerateDocumentOutput>;
	previewDocument(actor: ActorContext, input: PreviewDocumentInput): Promise<PreviewDocumentOutput>;
	getExportSettings(actor: ActorContext, projectId: ProjectId): Promise<ExportSettings>;
	updateExportSettings(
		actor: ActorContext,
		projectId: ProjectId,
		settings: ExportSettings
	): Promise<ExportSettings>;
	listArtifacts(
		actor: ActorContext,
		projectId: ProjectId,
		params?: ListArtifactsParams
	): Promise<ListArtifactsOutput>;
	getArtifact(
		actor: ActorContext,
		artifactId: ArtifactId
	): Promise<import('$lib/models/deliverables').Artifact | undefined>;
	downloadArtifact(actor: ActorContext, artifactId: ArtifactId): Promise<GetArtifactDownloadOutput>;
	deleteArtifact(actor: ActorContext, artifactId: ArtifactId): Promise<void>;
	regenerateArtifact(actor: ActorContext, artifactId: ArtifactId): Promise<GenerateDocumentOutput>;
}

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
