import type {
	ActorContext,
	Artifact,
	ArtifactId,
	ListArtifactsOutput,
	ListArtifactsParams,
	ProjectId,
	ProjectTemplate,
	TemplateId
} from '$lib/models';
import type { ArtifactRepository, TemplateRepository } from '$lib/repositories';
import type { AttachmentStorage, StoredObjectInfo } from '$lib/server/domain/attachment-storage';
import type { SnapshotParticipant } from './in-memory-transaction';

export class InMemoryArtifactRepository implements ArtifactRepository, SnapshotParticipant {
	artifacts: Artifact[] = [];

	async insert(_actor: ActorContext, artifact: Artifact): Promise<Artifact> {
		this.artifacts.push(artifact);
		return artifact;
	}

	async listByProject(
		actor: ActorContext,
		projectId: ProjectId,
		params: ListArtifactsParams = {}
	): Promise<ListArtifactsOutput> {
		const artifacts = this.artifacts.filter(
			(artifact) => artifact.userId === actor.userId && artifact.projectId === projectId
		);
		const offset = params.offset ?? 0;
		const limit = params.limit ?? artifacts.length;
		return {
			artifacts: artifacts.slice(offset, offset + limit).map((artifact) => ({
				...artifact,
				projectName: 'Test project',
				stale: false
			})),
			total: artifacts.length
		};
	}

	async findById(actor: ActorContext, id: ArtifactId): Promise<Artifact | undefined> {
		return this.artifacts.find(
			(artifact) => artifact.id === id && artifact.userId === actor.userId
		);
	}

	async delete(actor: ActorContext, id: ArtifactId): Promise<void> {
		this.artifacts = this.artifacts.filter(
			(artifact) => artifact.id !== id || artifact.userId !== actor.userId
		);
	}

	snapshot(): unknown {
		return structuredClone(this.artifacts);
	}

	restore(snapshot: unknown): void {
		this.artifacts = snapshot as Artifact[];
	}
}

export class InMemoryTemplateRepository implements TemplateRepository, SnapshotParticipant {
	templates: ProjectTemplate[] = [];

	async insert(_actor: ActorContext, template: ProjectTemplate): Promise<ProjectTemplate> {
		this.templates.push(template);
		return template;
	}

	async findById(actor: ActorContext, id: TemplateId): Promise<ProjectTemplate | undefined> {
		return this.templates.find(
			(template) => template.id === id && template.userId === actor.userId
		);
	}

	async listByProject(
		actor: ActorContext,
		projectId: ProjectId
	): Promise<readonly ProjectTemplate[]> {
		return this.templates.filter(
			(template) => template.userId === actor.userId && template.projectId === projectId
		);
	}

	async update(_actor: ActorContext, template: ProjectTemplate): Promise<ProjectTemplate> {
		this.templates = this.templates.map((candidate) =>
			candidate.id === template.id ? template : candidate
		);
		return template;
	}

	async delete(actor: ActorContext, id: TemplateId): Promise<void> {
		this.templates = this.templates.filter(
			(template) => template.id !== id || template.userId !== actor.userId
		);
	}

	snapshot(): unknown {
		return structuredClone(this.templates);
	}

	restore(snapshot: unknown): void {
		this.templates = snapshot as ProjectTemplate[];
	}
}

export class InMemoryAttachmentStorage implements AttachmentStorage, SnapshotParticipant {
	objects = new Map<string, { data: Uint8Array; mediaType: string; checksumSha256?: string }>();

	async createUploadUrl(input: {
		objectKey: string;
		mediaType: string;
		byteSize: number;
		checksumSha256: string;
		expiresInSeconds: number;
	}): Promise<string> {
		return `https://storage.test/upload/${input.objectKey}`;
	}

	async createDownloadUrl(
		objectKey: string,
		_expiresInSeconds: number,
		downloadFilename?: string
	): Promise<string> {
		const suffix = downloadFilename ? `?filename=${encodeURIComponent(downloadFilename)}` : '';
		return `https://storage.test/download/${objectKey}${suffix}`;
	}

	async put(objectKey: string, data: Uint8Array, mediaType: string): Promise<void> {
		this.objects.set(objectKey, { data: new Uint8Array(data), mediaType });
	}

	async stat(objectKey: string): Promise<StoredObjectInfo> {
		const object = this.objects.get(objectKey);
		return {
			byteSize: object?.data.byteLength ?? 0,
			...(object?.mediaType ? { mediaType: object.mediaType } : {}),
			...(object?.checksumSha256 ? { checksumSha256: object.checksumSha256 } : {})
		};
	}

	async read(objectKey: string, maximumBytes: number): Promise<Uint8Array> {
		return (this.objects.get(objectKey)?.data ?? new Uint8Array()).slice(0, maximumBytes);
	}

	async promote(sourceKey: string, destinationKey: string): Promise<void> {
		const object = this.objects.get(sourceKey);
		if (object) this.objects.set(destinationKey, object);
		this.objects.delete(sourceKey);
	}

	async remove(objectKey: string): Promise<void> {
		this.objects.delete(objectKey);
	}

	snapshot(): unknown {
		return structuredClone(this.objects);
	}

	restore(snapshot: unknown): void {
		this.objects = snapshot as typeof this.objects;
	}
}
