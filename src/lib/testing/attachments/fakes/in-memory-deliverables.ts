import type { ActorContext } from '$lib/models/identity';
import { NotFoundError, ValidationError } from '$lib/errors';
import type {
	Artifact,
	ArtifactId,
	ListArtifactsOutput,
	ListArtifactsParams,
	TemplateId
} from '$lib/models/deliverables';
import type { ProjectId, ProjectTemplate, TemplateUpload } from '$lib/models/projects';
import type { ArtifactRepository, TemplateRepository } from '$lib/server/repositories/deliverables';
import type {
	IAttachmentStorage,
	StoredObjectInfo
} from '$lib/server/services/attachments/storage';
import type {
	RestoreSnapshot,
	SnapshotParticipant
} from '$lib/testing/workspace/fakes/in-memory-transaction';

export class InMemoryArtifactRepository implements ArtifactRepository, SnapshotParticipant {
	artifacts: Artifact[] = [];
	insertFailure?: Error;

	async insert(_actor: ActorContext, artifact: Artifact): Promise<Artifact> {
		if (this.insertFailure) throw this.insertFailure;
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

	snapshot(): RestoreSnapshot {
		const artifacts = structuredClone(this.artifacts);
		return () => {
			this.artifacts = artifacts;
		};
	}
}

export class InMemoryTemplateRepository implements TemplateRepository, SnapshotParticipant {
	templates: ProjectTemplate[] = [];
	uploads: TemplateUpload[] = [];
	insertFailure?: Error;
	nextTemplateReadGate?: Promise<void>;
	async insertUpload(_actor: ActorContext, upload: TemplateUpload): Promise<TemplateUpload> {
		this.uploads.push(upload);
		return upload;
	}
	async findUpload(actor: ActorContext, id: TemplateId): Promise<TemplateUpload | undefined> {
		return this.uploads.find((upload) => upload.id === id && upload.userId === actor.userId);
	}
	findUploadForUpdate(actor: ActorContext, id: TemplateId) {
		return this.findUpload(actor, id);
	}
	async deleteUpload(actor: ActorContext, id: TemplateId): Promise<void> {
		this.uploads = this.uploads.filter(
			(upload) => upload.id !== id || upload.userId !== actor.userId
		);
	}

	async insert(_actor: ActorContext, template: ProjectTemplate): Promise<ProjectTemplate> {
		if (this.insertFailure) throw this.insertFailure;
		this.templates.push(template);
		return template;
	}

	async findById(actor: ActorContext, id: TemplateId): Promise<ProjectTemplate | undefined> {
		const snapshot = this.templates.find(
			(template) => template.id === id && template.userId === actor.userId
		);
		const gate = this.nextTemplateReadGate;
		this.nextTemplateReadGate = undefined;
		await gate;
		return snapshot;
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

	snapshot(): RestoreSnapshot {
		const templates = structuredClone(this.templates);
		const uploads = structuredClone(this.uploads);
		return () => {
			this.templates = templates;
			this.uploads = uploads;
		};
	}
}

export class InMemoryAttachmentStorage implements IAttachmentStorage, SnapshotParticipant {
	objects = new Map<string, { data: Uint8Array; mediaType: string; checksumSha256?: string }>();
	putFailure?: Error;
	removeFailure?: Error;
	downloadFailure?: Error;

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
		if (this.downloadFailure) throw this.downloadFailure;
		const suffix = downloadFilename ? `?filename=${encodeURIComponent(downloadFilename)}` : '';
		return `https://storage.test/download/${objectKey}${suffix}`;
	}

	async put(objectKey: string, data: Uint8Array, mediaType: string): Promise<void> {
		if (this.putFailure) throw this.putFailure;
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
		const object = this.objects.get(objectKey);
		if (!object) throw new NotFoundError('Stored object not found');
		if (object.data.byteLength > maximumBytes)
			throw new ValidationError('Stored object exceeds the read limit');
		return new Uint8Array(object.data);
	}

	async promote(sourceKey: string, destinationKey: string): Promise<void> {
		const object = this.objects.get(sourceKey);
		if (object) this.objects.set(destinationKey, object);
		this.objects.delete(sourceKey);
	}

	async remove(objectKey: string): Promise<void> {
		if (this.removeFailure) throw this.removeFailure;
		this.objects.delete(objectKey);
	}

	snapshot(): RestoreSnapshot {
		const objects = structuredClone(this.objects);
		return () => {
			this.objects = objects;
		};
	}
}
