import type { ActorContext } from '$lib/models/identity';
import type {
	Artifact,
	ArtifactId,
	ExportSettings,
	GenerateBundleInput,
	GenerateBundleOutput,
	GenerateDocumentInput,
	PreviewDocumentInput,
	ListArtifactsOutput,
	ListArtifactsParams
} from '$lib/models/deliverables';
import type { ProjectId } from '$lib/models/projects';

export interface DocumentGenerator {
	generate(
		actor: ActorContext,
		input: GenerateDocumentInput
	): Promise<{ artifact: Artifact; downloadUrl: string }>;
}

export interface BundleGenerator {
	generateBundle(actor: ActorContext, input: GenerateBundleInput): Promise<GenerateBundleOutput>;
}

export interface ArtifactLister {
	list(
		actor: ActorContext,
		projectId: ProjectId,
		params?: ListArtifactsParams
	): Promise<ListArtifactsOutput>;
}

export interface ArtifactReader {
	get(actor: ActorContext, artifactId: ArtifactId): Promise<Artifact | undefined>;
	download(actor: ActorContext, artifactId: ArtifactId): Promise<{ url: string }>;
}

export interface ArtifactDeleter {
	delete(actor: ActorContext, artifactId: ArtifactId): Promise<void>;
}

export interface ArtifactRegenerator {
	regenerate(
		actor: ActorContext,
		artifactId: ArtifactId
	): Promise<{ artifact: Artifact; downloadUrl: string }>;
}

export interface DocumentPreviewer {
	preview(actor: ActorContext, input: PreviewDocumentInput): Promise<Buffer>;
}

export interface ExportSettingsReader {
	getSettings(actor: ActorContext, projectId: ProjectId): Promise<ExportSettings>;
}

export interface ExportSettingsWriter {
	updateSettings(
		actor: ActorContext,
		projectId: ProjectId,
		settings: ExportSettings
	): Promise<ExportSettings>;
}
