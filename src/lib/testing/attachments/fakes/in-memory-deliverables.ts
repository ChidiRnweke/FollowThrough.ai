import type { ActorContext } from '$lib/models/identity';
import { ConflictError, ExternalServiceError, NotFoundError, ValidationError } from '$lib/errors';
import type {
	Artifact,
	ArtifactId,
	ListArtifactsOutput,
	ListArtifactsParams,
	TemplateId
} from '$lib/models/deliverables';
import type { ProjectId, ProjectTemplate, TemplateUpload } from '$lib/models/projects';
import type { ArtifactRepository, TemplateRepository } from '$lib/server/repositories/deliverables';
import type { IAttachmentStorage } from '$lib/server/services/attachments/object-storage';
import type { SignedObjectUpload, StoredObjectInfo } from '$lib/models/attachments';
import { createHash } from 'node:crypto';
import type {
	RestoreSnapshot,
	SnapshotParticipant
} from '$lib/testing/workspace/fakes/in-memory-transaction';

export class InMemoryArtifactRepository implements ArtifactRepository, SnapshotParticipant {
	constructor(private readonly actor: ActorContext) {}
	artifacts: Artifact[] = [];
	insertFailure?: Error;

	async insert(artifact: Artifact): Promise<Artifact> {
		if (this.insertFailure) throw this.insertFailure;
		this.artifacts.push(artifact);
		return artifact;
	}

	async listByProject(
		projectId: ProjectId,
		params: ListArtifactsParams = {}
	): Promise<ListArtifactsOutput> {
		const artifacts = this.artifacts.filter(
			(artifact) => artifact.userId === this.actor.userId && artifact.projectId === projectId
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

	async findById(id: ArtifactId): Promise<Artifact | undefined> {
		return this.artifacts.find(
			(artifact) => artifact.id === id && artifact.userId === this.actor.userId
		);
	}

	async delete(id: ArtifactId): Promise<void> {
		this.artifacts = this.artifacts.filter(
			(artifact) => artifact.id !== id || artifact.userId !== this.actor.userId
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
	constructor(private readonly actor: ActorContext) {}
	templates: ProjectTemplate[] = [];
	uploads: TemplateUpload[] = [];
	insertFailure?: Error;
	nextTemplateReadGate?: Promise<void>;
	async insertUpload(upload: TemplateUpload): Promise<TemplateUpload> {
		this.uploads.push(upload);
		return upload;
	}
	async findUpload(id: TemplateId): Promise<TemplateUpload | undefined> {
		return this.uploads.find((upload) => upload.id === id && upload.userId === this.actor.userId);
	}
	findUploadForUpdate(id: TemplateId) {
		return this.findUpload(id);
	}
	async deleteUpload(id: TemplateId): Promise<void> {
		this.uploads = this.uploads.filter(
			(upload) => upload.id !== id || upload.userId !== this.actor.userId
		);
	}

	async insert(template: ProjectTemplate): Promise<ProjectTemplate> {
		if (this.insertFailure) throw this.insertFailure;
		this.templates.push(template);
		return template;
	}

	async findById(id: TemplateId): Promise<ProjectTemplate | undefined> {
		const snapshot = this.templates.find(
			(template) => template.id === id && template.userId === this.actor.userId
		);
		const gate = this.nextTemplateReadGate;
		this.nextTemplateReadGate = undefined;
		await gate;
		return snapshot;
	}

	async listByProject(projectId: ProjectId): Promise<readonly ProjectTemplate[]> {
		return this.templates.filter(
			(template) => template.userId === this.actor.userId && template.projectId === projectId
		);
	}

	async update(template: ProjectTemplate): Promise<ProjectTemplate> {
		this.templates = this.templates.map((candidate) =>
			candidate.id === template.id ? template : candidate
		);
		return template;
	}

	async delete(id: TemplateId): Promise<void> {
		this.templates = this.templates.filter(
			(template) => template.id !== id || template.userId !== this.actor.userId
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

/** What storage holds for one key: the bytes, and what it computed while receiving them. */
interface StoredObject {
	readonly data: Uint8Array;
	readonly mediaType: string;
	readonly etag: string;
	/** Present only for a write that carried a checksum, which storage verified. */
	readonly checksumSha256?: string;
}

const digest = (algorithm: 'md5' | 'sha256', data: Uint8Array) =>
	createHash(algorithm).update(data).digest('hex');

/**
 * Object storage in memory. As in S3, every write gets a new entity tag; only a signed upload,
 * which carries a checksum, leaves a verified SHA-256 behind. Server-side `put` carries none.
 */
export class InMemoryAttachmentStorage implements IAttachmentStorage, SnapshotParticipant {
	objects = new Map<string, StoredObject>();
	putFailure?: Error;
	removeFailure?: Error;
	downloadFailure?: Error;
	/** Runs as promotion starts, before the copy: a write here lands after the caller's stat. */
	beforePromote: () => Promise<void> = async () => {};

	async createUploadUrl(input: {
		objectKey: string;
		mediaType: string;
		byteSize: number;
		checksumSha256: string;
		expiresInSeconds: number;
	}): Promise<SignedObjectUpload> {
		return {
			url: `https://storage.test/upload/${input.objectKey}`,
			requiredHeaders: {
				'content-type': input.mediaType,
				'x-amz-checksum-sha256': Buffer.from(input.checksumSha256, 'hex').toString('base64')
			}
		};
	}

	/** The bytes a client sent to a signed upload URL; storage records their checksum. */
	async upload(objectKey: string, data: Uint8Array, mediaType: string): Promise<void> {
		this.objects.set(objectKey, {
			data: new Uint8Array(data),
			mediaType,
			etag: `"${digest('md5', data)}"`,
			checksumSha256: digest('sha256', data)
		});
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
		this.objects.set(objectKey, {
			data: new Uint8Array(data),
			mediaType,
			etag: `"${digest('md5', data)}"`
		});
	}

	async stat(objectKey: string): Promise<StoredObjectInfo> {
		const object = this.objects.get(objectKey);
		if (!object) throw new ExternalServiceError('Attachment object could not be verified');
		return {
			byteSize: object.data.byteLength,
			etag: object.etag,
			mediaType: object.mediaType,
			...(object.checksumSha256 ? { checksumSha256: object.checksumSha256 } : {})
		};
	}

	async read(objectKey: string, maximumBytes: number): Promise<Uint8Array> {
		const object = this.objects.get(objectKey);
		if (!object) throw new NotFoundError('Stored object not found');
		if (object.data.byteLength > maximumBytes)
			throw new ValidationError('Stored object exceeds the read limit');
		return new Uint8Array(object.data);
	}

	async promote(input: {
		sourceKey: string;
		sourceEtag: string;
		destinationKey: string;
	}): Promise<void> {
		await this.beforePromote();
		const object = this.objects.get(input.sourceKey);
		if (!object) throw new ExternalServiceError('Attachment object could not be committed');
		if (object.etag !== input.sourceEtag)
			throw new ConflictError(
				'The uploaded file changed after it was verified, so it was not saved. Upload it again.'
			);
		this.objects.set(input.destinationKey, object);
		this.objects.delete(input.sourceKey);
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
