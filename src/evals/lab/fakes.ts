import type { AgentModel } from '$lib/models/agent';
import type { AgentModelCatalog } from '$lib/server/services/agent/runs/preferences';
import type { IAttachmentStorage } from '$lib/server/services/attachments/object-storage';
import type { SignedObjectUpload, StoredObjectInfo } from '$lib/models/attachments';
import { createHash } from 'node:crypto';

/**
 * The real catalog lists every OpenRouter model over the network on submit.
 * Evals pin their model explicitly, so the catalog has nothing to decide.
 */
export class StubModelCatalog implements AgentModelCatalog {
	async list(): Promise<readonly AgentModel[]> {
		return [];
	}
}

/** Keeps attachment bytes in the process so the lab needs no S3/MinIO. */
export class InMemoryAttachmentStorage implements IAttachmentStorage {
	private readonly objects = new Map<string, { data: Uint8Array; mediaType: string }>();

	async createUploadUrl(input: {
		objectKey: string;
		mediaType: string;
	}): Promise<SignedObjectUpload> {
		return {
			url: `memory://upload/${input.objectKey}`,
			requiredHeaders: { 'content-type': input.mediaType }
		};
	}

	async createDownloadUrl(objectKey: string): Promise<string> {
		return `memory://download/${objectKey}`;
	}

	async put(objectKey: string, data: Uint8Array, mediaType: string): Promise<void> {
		this.objects.set(objectKey, { data, mediaType });
	}

	async stat(objectKey: string): Promise<StoredObjectInfo> {
		const object = this.require(objectKey);
		// Written by `put`, which carries no checksum, so storage holds none to report.
		return {
			byteSize: object.data.byteLength,
			mediaType: object.mediaType,
			etag: `"${createHash('md5').update(object.data).digest('hex')}"`
		};
	}

	async read(objectKey: string, maximumBytes: number): Promise<Uint8Array> {
		return this.require(objectKey).data.slice(0, maximumBytes);
	}

	async promote(input: { sourceKey: string; destinationKey: string }): Promise<void> {
		this.objects.set(input.destinationKey, this.require(input.sourceKey));
		this.objects.delete(input.sourceKey);
	}

	async remove(objectKey: string): Promise<void> {
		this.objects.delete(objectKey);
	}

	private require(objectKey: string) {
		const object = this.objects.get(objectKey);
		if (!object) throw new Error(`No stored object for "${objectKey}"`);
		return object;
	}
}
