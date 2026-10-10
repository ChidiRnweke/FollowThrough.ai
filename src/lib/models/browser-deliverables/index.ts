import type {
	CacheStorage,
	OutboxStorage,
	SyncReadTransport,
	WorkspaceLocalRepository,
	WorkspaceResourceBinding
} from '$lib/models/browser-workspace';
import type { WorkspaceCommand } from '$lib/models/workspace-mutations';
import type { WorkspaceRecord } from '$lib/models/workspace-records';
import type { SynchronizationResult } from '$lib/models/sync';
import type {
	GenerateDocumentInput,
	GenerateBundleInput,
	GenerateBundleOutput,
	PreviewDocumentInput,
	PreviewDocumentOutput,
	ArtifactId
} from '$lib/models/deliverables';
export interface DeliverableAccount {
	readonly accountId: string;
	readonly repository: WorkspaceLocalRepository<WorkspaceCommand, WorkspaceRecord>;
	readonly cacheStorage: CacheStorage<WorkspaceRecord>;
	readonly outbox: OutboxStorage<WorkspaceCommand, WorkspaceRecord>;
	readonly readTransport: SyncReadTransport<WorkspaceRecord>;
	readonly cacheState: {
		read(): { readonly stopped: boolean; readonly checking: Promise<SynchronizationResult> | null };
		update(change: { checking: Promise<SynchronizationResult> | null }): void;
	};
}
export interface DeliverableSession {
	readonly resourceBinding: WorkspaceResourceBinding | null;
	readonly generation: number;
}
export interface DeliverableEnvironment {
	readonly accountId: string | null;
	readonly online: boolean;
}
export interface DeliverableBinding {
	readonly workspace: WorkspaceResourceBinding;
	readonly projectId: string;
}
export interface DeliverableOperation {
	readonly binding: WorkspaceResourceBinding;
	readonly account: DeliverableAccount;
	readonly generation: number;
}
export interface DocumentExportRemote {
	generate(input: GenerateDocumentInput): Promise<{ readonly downloadUrl: string }>;
	bundle(input: GenerateBundleInput): Promise<GenerateBundleOutput>;
	preview(input: PreviewDocumentInput): Promise<PreviewDocumentOutput>;
}
export interface DocumentPreviewUrls {
	create(data: string): string;
	release(url: string): void;
}
export interface ExportDiagramImageAdapter {
	rasterize(svg: string): Promise<string | null>;
	hash(value: string): Promise<string>;
}
export interface ArtifactActionsRemote {
	download(id: ArtifactId): Promise<{ readonly url: string }>;
	regenerate(id: ArtifactId): Promise<{ readonly downloadUrl: string }>;
	delete(id: ArtifactId): Promise<void>;
}
export interface ArtifactDownloadNavigation {
	assign(url: string): void;
}
