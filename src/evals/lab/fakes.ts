import type { AgentModel } from '$lib/models/agent';
import type { AgentModelCatalog } from '$lib/server/services/agent/runs/preferences';
import type {
	IAttachmentStorage,
	StoredObjectInfo
} from '$lib/server/services/attachments/storage';

/**
 * The real catalog lists every OpenRouter model over the network on submit.
 * Evals pin their model explicitly, so the catalog has nothing to decide.
 */
export class StubModelCatalog implements AgentModelCatalog {
	async list(): Promise<readonly AgentModel[]> {
		return [];
	}

	async assertSelectable(): Promise<void> {}
}

/** Keeps attachment bytes in the process so the lab needs no S3/MinIO. */
export class InMemoryAttachmentStorage implements IAttachmentStorage {
	private readonly objects = new Map<string, { data: Uint8Array; mediaType: string }>();

	async createUploadUrl(input: { objectKey: string }): Promise<string> {
		return `memory://upload/${input.objectKey}`;
	}

	async createDownloadUrl(objectKey: string): Promise<string> {
		return `memory://download/${objectKey}`;
	}

	async put(objectKey: string, data: Uint8Array, mediaType: string): Promise<void> {
		this.objects.set(objectKey, { data, mediaType });
	}

	async stat(objectKey: string): Promise<StoredObjectInfo> {
		const object = this.require(objectKey);
		return { byteSize: object.data.byteLength, mediaType: object.mediaType };
	}

	async read(objectKey: string, maximumBytes: number): Promise<Uint8Array> {
		return this.require(objectKey).data.slice(0, maximumBytes);
	}

	async promote(sourceKey: string, destinationKey: string): Promise<void> {
		this.objects.set(destinationKey, this.require(sourceKey));
		this.objects.delete(sourceKey);
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
