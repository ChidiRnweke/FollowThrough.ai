import type {
	ActorContext,
	ArtifactId,
	GenerateDocumentInput,
	GenerateDocumentOutput,
	GetArtifactDownloadOutput,
	ListArtifactsOutput,
	ProjectId,
	TemplateId
} from '$lib/models';
import type {
	ArtifactDeleter,
	ArtifactLister,
	ArtifactReader,
	ArtifactRegenerator,
	DocumentGenerator,
	TemplateDeleter,
	TemplateLister,
	TemplateUploader
} from '$lib/services';
import type { TransactionRunner } from '$lib/repositories';

export interface DeliverablesController {
	initiateTemplateUpload(
		actor: ActorContext,
		input: { projectId: ProjectId; name: string; mediaType: string; byteSize: number; checksumSha256: string }
	): Promise<{ templateId: TemplateId; uploadUrl: string; requiredHeaders: Record<string, string> }>;
	completeTemplateUpload(actor: ActorContext, templateId: TemplateId): Promise<void>;
	listTemplates(actor: ActorContext, projectId: ProjectId): Promise<readonly import('$lib/models').ProjectTemplate[]>;
	deleteTemplate(actor: ActorContext, templateId: TemplateId): Promise<void>;
	generateDocument(actor: ActorContext, input: GenerateDocumentInput): Promise<GenerateDocumentOutput>;
	listArtifacts(actor: ActorContext, projectId: ProjectId): Promise<ListArtifactsOutput>;
	getArtifact(actor: ActorContext, artifactId: ArtifactId): Promise<import('$lib/models').Artifact | undefined>;
	downloadArtifact(actor: ActorContext, artifactId: ArtifactId): Promise<GetArtifactDownloadOutput>;
	deleteArtifact(actor: ActorContext, artifactId: ArtifactId): Promise<void>;
	regenerateArtifact(actor: ActorContext, artifactId: ArtifactId): Promise<GenerateDocumentOutput>;
}

export interface DeliverablesDependencies {
	templateUploader: TemplateUploader;
	templateLister: TemplateLister;
	templateDeleter: TemplateDeleter;
	documentGenerator: DocumentGenerator;
	artifactLister: ArtifactLister;
	artifactReader: ArtifactReader;
	artifactDeleter: ArtifactDeleter;
	artifactRegenerator: ArtifactRegenerator;
	transactionRunner: TransactionRunner;
}

export class DefaultDeliverablesController implements DeliverablesController {
	constructor(private readonly dependencies: DeliverablesDependencies) {}

	async initiateTemplateUpload(
		actor: ActorContext,
		input: { projectId: ProjectId; name: string; mediaType: string; byteSize: number; checksumSha256: string }
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

	async generateDocument(actor: ActorContext, input: GenerateDocumentInput): Promise<GenerateDocumentOutput> {
		return this.dependencies.transactionRunner.run(async () =>
			this.dependencies.documentGenerator.generate(actor, input)
		);
	}

	async listArtifacts(actor: ActorContext, projectId: ProjectId): Promise<ListArtifactsOutput> {
		return { artifacts: await this.dependencies.artifactLister.list(actor, projectId) };
	}

	async getArtifact(actor: ActorContext, artifactId: ArtifactId) {
		return this.dependencies.artifactReader.get(actor, artifactId);
	}

	async downloadArtifact(actor: ActorContext, artifactId: ArtifactId): Promise<GetArtifactDownloadOutput> {
		return this.dependencies.artifactReader.download(actor, artifactId);
	}

	async deleteArtifact(actor: ActorContext, artifactId: ArtifactId): Promise<void> {
		await this.dependencies.artifactDeleter.delete(actor, artifactId);
	}

	async regenerateArtifact(actor: ActorContext, artifactId: ArtifactId): Promise<GenerateDocumentOutput> {
		return this.dependencies.artifactRegenerator.regenerate(actor, artifactId);
	}
}
