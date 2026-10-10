import {
	defaultExportSettings,
	type ExportSettings,
	type ExportSettingsLoad,
	type ExportDownload
} from '$lib/models/deliverables';
import type { ProseMirrorDocument, NoteId, NoteDocument } from '$lib/models/notes';
import type { ProjectId, ProjectExportEntry } from '$lib/models/projects';
import type {
	DeliverableAccount,
	DeliverableSession,
	DeliverableEnvironment,
	DeliverableOperation
} from '$lib/models/browser-deliverables';
import type { WorkspaceCapabilityRegistry } from '$lib/stores/workspace/capabilities';
import type { WorkspaceLocalProjection } from '$lib/models/workspace-local';
import type { WorkspaceCommand } from '$lib/models/workspace-mutations';
import type { WorkspaceRecord } from '$lib/models/workspace-records';
import {
	initialSyncCursor,
	type SynchronizationResult,
	type SyncPage,
	type CachedRecord
} from '$lib/models/sync';
import type { ICacheCommitService, IWorkspaceProjectionService } from '$lib/services/sync/state';
import type {
	DocumentExportRemote,
	DocumentPreviewUrls,
	ExportDiagramImageAdapter
} from '$lib/models/browser-deliverables';
import type { WorkspaceEditingEnvironment } from '$lib/models/browser-workspace';
import type { ExportPreparation } from '$lib/services/deliverables/export-preparation';
import type { MermaidThemeRules } from '$lib/services/diagrams/mermaid-theme';
import type { MermaidTheme, MermaidSvgRenderer } from '$lib/models/diagrams/mermaid-theme';
import type { DiagramSize, ExportDiagramImages } from '$lib/models/deliverables';
import type { DocumentExportStore } from '$lib/stores/deliverables/export.svelte';
import { workspaceResourceKey } from '$lib/services/workspace/commands';
export type { DocumentExportRemote, DocumentPreviewUrls } from '$lib/models/browser-deliverables';
export interface DocumentExportDependencies {
	readonly session: DeliverableSession;
	readonly accounts: WorkspaceCapabilityRegistry<DeliverableAccount>;
	readonly environment: DeliverableEnvironment;
	readonly snapshots: WorkspaceEditingEnvironment;
	readonly projection: IWorkspaceProjectionService;
	readonly cacheMerge: ICacheCommitService;
	readonly preparation: ExportPreparation;
	readonly themes: MermaidThemeRules;
	readonly renderer: MermaidSvgRenderer;
	readonly images: ExportDiagramImageAdapter;
	readonly remote: DocumentExportRemote;
	readonly urls: DocumentPreviewUrls;
}
export interface BrowserDocumentExportInput {
	readonly projectId: string;
	readonly noteIds: readonly string[];
	readonly title: string;
	readonly settings: ExportSettings;
	readonly documents: readonly { readonly document: ProseMirrorDocument }[];
	readonly diagrams: readonly { readonly id: string; readonly renderedSvg?: string }[];
}
export interface BrowserBundleExportInput {
	readonly projectId: string;
	readonly entries: readonly ProjectExportEntry[];
	readonly title: string;
	readonly settings: ExportSettings;
	readonly format: 'docx' | 'pdf';
	readonly bundle: 'zip' | 'merged';
}
export interface DocumentExportController {
	readonly ready: boolean;
	readonly sessionGeneration: number;
	readonly accountId: string | null;
	readonly busy: boolean;
	readonly error: string;
	readonly result: ExportDownload | null;
	readonly previewUrl: string;
	open(projectId: string, noteIds?: readonly string[]): Promise<ExportSettingsLoad>;
	inspect(documents: readonly { readonly document: ProseMirrorDocument }[]): {
		readonly hasDiagrams: boolean;
		readonly hasSelfStyledDiagrams: boolean;
	};
	documents(ids: readonly string[]): readonly NoteDocument[];
	preview(input: BrowserDocumentExportInput): Promise<void>;
	generate(input: BrowserDocumentExportInput & { readonly format: 'docx' | 'pdf' }): Promise<void>;
	bundle(input: BrowserBundleExportInput): Promise<void>;
	dismissPreview(): void;
	close(): void;
}
export class DocumentExports implements DocumentExportController {
	constructor(
		private readonly state: DocumentExportStore,
		private readonly dependencies: DocumentExportDependencies
	) {}
	get sessionGeneration(): number {
		return this.dependencies.session.generation;
	}
	get accountId(): string | null {
		return this.dependencies.environment.accountId;
	}
	private get active(): boolean {
		const binding = this.state.binding;
		if (
			!binding ||
			this.dependencies.session.resourceBinding?.resourceKey !== binding.workspace.resourceKey
		)
			return false;
		return (
			binding !== null &&
			this.current({
				binding: binding.workspace,
				account: this.dependencies.accounts.get(binding.workspace.resourceKey),
				generation: this.state.generation
			})
		);
	}
	get ready(): boolean {
		return this.active && this.state.ready;
	}
	get busy(): boolean {
		return this.active && this.state.busy;
	}
	get error(): string {
		return this.state.binding && !this.active
			? 'The workspace changed. Close this dialog and try again.'
			: this.state.error;
	}
	get result(): ExportDownload | null {
		return this.active ? this.state.result : null;
	}
	get previewUrl(): string {
		return this.active ? this.state.previewUrl : '';
	}
	async open(projectId: string, noteIds: readonly string[] = []): Promise<ExportSettingsLoad> {
		this.close();
		const generation = this.state.open();
		let operation: DeliverableOperation | undefined;
		try {
			operation = this.capture(generation);
			this.state.bind({ workspace: operation.binding, projectId });
			const key = workspaceResourceKey({
				type: 'export_settings',
				id: [operation.binding.accountId, projectId]
			});
			const { records } = await this.readLocal(operation, key);
			const record = records.get(key);
			if (record && record.type !== 'export_settings')
				throw new Error('The export defaults have the wrong resource type');
			const settings = { ...defaultExportSettings, ...(record?.value.settings ?? {}) };
			const documents = await this.loadDocuments(operation, noteIds);
			this.requireCurrent(operation);
			this.state.setDocuments(documents);
			this.state.loaded();
			return { kind: 'ready', settings };
		} catch (error) {
			if (generation !== this.state.generation || (operation && !this.current(operation)))
				return { kind: 'superseded' };
			const message =
				error instanceof Error ? error.message : 'Export settings could not be loaded.';
			this.state.fail(message);
			return { kind: 'failure', message };
		}
	}
	documents(ids: readonly string[]): readonly NoteDocument[] {
		if (!this.ready) return [];
		return ids.map((id) => {
			const note = this.state.documents.find((note) => note.id === id);
			if (!note) throw new Error('The selected note has not been loaded for export');
			return note;
		});
	}
	private async loadDocuments(
		operation: DeliverableOperation,
		ids: readonly string[]
	): Promise<readonly NoteDocument[]> {
		return Promise.all(
			ids.map(async (id) => {
				const key = workspaceResourceKey({ type: 'notes', id: [id] });
				const records = await this.readNote(operation, key);
				const record = records.get(key);
				if (record?.type !== 'notes' || record.value.kind !== 'note')
					throw new Error('The selected note is unavailable');
				if (record.value.projectId !== this.state.binding?.projectId)
					throw new Error('The selected note belongs to another project');
				return record.value;
			})
		);
	}
	private project(local: WorkspaceLocalProjection<WorkspaceCommand, WorkspaceRecord>) {
		return this.dependencies.projection.project(
			new Map(local.cache.records.map((row) => [row.key, row.entry])),
			local.writes.entries
		);
	}
	private async readNote(
		operation: DeliverableOperation,
		key: string
	): Promise<ReadonlyMap<string, WorkspaceRecord>> {
		const { account, binding } = operation;
		const local = await account.repository.read(binding.accountId);
		this.requireCurrent(operation);
		const records = this.project(local);
		const deleted =
			local.cache.records.some((row) => row.key === key && row.entry.kind === 'deleted') ||
			local.writes.entries.some((entry) => entry.intent.key === key && entry.intent.local === null);
		if (records.has(key) || deleted) return records;
		if (!this.dependencies.environment.online)
			throw new Error('The selected note is unavailable offline');
		const resource = await account.readTransport.read(key, null);
		this.requireCurrent(operation);
		if (resource.kind !== 'found' && resource.kind !== 'deleted')
			throw new Error('The selected note is unavailable');
		const put: CachedRecord<WorkspaceRecord>[] = [
			{
				key,
				entry:
					resource.kind === 'found' ? { kind: 'present', snapshot: resource.snapshot } : resource
			}
		];
		await account.cacheStorage.transaction(binding.accountId, async (tx) => {
			this.requireCurrent(operation);
			const previous = await tx.resources([key]);
			this.requireCurrent(operation);
			const decision = this.dependencies.cacheMerge.decide(previous, null, { put, remove: [] });
			await tx.put(decision.put);
			this.requireCurrent(operation);
		});
		const updated = await account.repository.read(binding.accountId);
		this.requireCurrent(operation);
		return this.project(updated);
	}

	async preview(input: BrowserDocumentExportInput): Promise<void> {
		input = this.dependencies.snapshots.snapshot(input);
		const previewGeneration = this.state.previewGeneration;
		await this.run(input.projectId, input.title, 'Preview failed', async (current) => {
			const renders = await this.renderDiagrams(input.documents, input.diagrams, input.settings);
			if (!current()) return;
			const output = await this.dependencies.remote.preview({
				projectId: input.projectId as ProjectId,
				noteIds: input.noteIds.map((id) => id as NoteId),
				title: input.title.trim(),
				settings: input.settings,
				diagramSvgs: renders.svgs,
				diagramPngs: renders.pngs,
				diagramSizes: renders.sizes
			});
			if (!current()) return;
			if (previewGeneration !== this.state.previewGeneration) return;
			const url = this.dependencies.urls.create(output.data);
			if (this.state.previewUrl) this.dependencies.urls.release(this.state.previewUrl);
			this.state.showPreview(url);
		});
	}
	async generate(
		input: BrowserDocumentExportInput & { readonly format: 'docx' | 'pdf' }
	): Promise<void> {
		input = this.dependencies.snapshots.snapshot(input);
		await this.run(input.projectId, input.title, 'Export failed', async (current) => {
			const renders = await this.renderDiagrams(input.documents, input.diagrams, input.settings);
			if (!current()) return;
			const output = await this.dependencies.remote.generate({
				projectId: input.projectId as ProjectId,
				noteIds: input.noteIds.map((id) => id as NoteId),
				title: input.title.trim(),
				format: input.format,
				settings: input.settings,
				diagramSvgs: renders.svgs,
				diagramPngs: renders.pngs,
				diagramSizes: renders.sizes
			});
			if (current()) this.state.publish({ url: output.downloadUrl, fileCount: 1 });
		});
	}
	async bundle(input: BrowserBundleExportInput): Promise<void> {
		if (!input.entries.length) return;
		input = this.dependencies.snapshots.snapshot(input);
		await this.run(input.projectId, input.title, 'Export failed', async (current, session) => {
			const documents = await this.loadDocuments(
				session,
				input.entries.map((entry) => entry.id)
			);
			if (!current()) return;
			const renders = await this.renderDiagrams(documents, [], input.settings);
			if (!current()) return;
			const common = {
				projectId: input.projectId as ProjectId,
				title: input.title.trim(),
				format: input.format,
				settings: input.settings,
				diagramSvgs: renders.svgs,
				diagramPngs: renders.pngs,
				diagramSizes: renders.sizes
			};
			if (input.bundle === 'zip') {
				const output = await this.dependencies.remote.bundle({
					...common,
					entries: input.entries.map((entry) => ({ noteId: entry.id as NoteId, path: entry.path }))
				});
				if (current()) this.state.publish({ url: output.downloadUrl, fileCount: output.fileCount });
			} else {
				const output = await this.dependencies.remote.generate({
					...common,
					noteIds: input.entries.map((entry) => entry.id as NoteId)
				});
				if (current()) this.state.publish({ url: output.downloadUrl, fileCount: 1 });
			}
		});
	}

	private async run(
		projectId: string,
		title: string,
		failure: string,
		work: (current: () => boolean, operation: DeliverableOperation) => Promise<void>
	): Promise<void | { kind: 'failure'; message: string }> {
		if (!title.trim() || !this.ready || this.busy) return;
		if (projectId !== this.state.binding?.projectId) {
			this.state.fail('The export belongs to another project');
			return;
		}
		const operation = this.capture(this.state.generation);
		this.state.begin();
		try {
			await work(() => this.current(operation), operation);
		} catch (error) {
			const message = error instanceof Error ? error.message : failure;
			if (this.current(operation)) this.state.fail(message);
			return { kind: 'failure', message };
		} finally {
			if (operation.generation === this.state.generation) this.state.finish();
		}
	}
	dismissPreview(): void {
		this.state.advancePreview();
		if (this.state.previewUrl) this.dependencies.urls.release(this.state.previewUrl);
		this.state.showPreview('');
	}
	close(): void {
		this.dismissPreview();
		this.state.close();
	}

	private capture(generation: number): DeliverableOperation {
		const binding = this.dependencies.session.resourceBinding;
		if (!binding) throw new Error('The workspace is not open.');
		const operation = {
			binding,
			account: this.dependencies.accounts.get(binding.resourceKey),
			generation
		};
		this.requireCurrent(operation);
		return operation;
	}
	private current(operation: DeliverableOperation): boolean {
		const binding = this.dependencies.session.resourceBinding;
		return (
			operation.generation === this.state.generation &&
			binding !== null &&
			binding.accountId === operation.binding.accountId &&
			binding.resourceKey === operation.binding.resourceKey &&
			binding.generation === operation.binding.generation &&
			this.dependencies.environment.accountId === binding.accountId &&
			operation.account.accountId === binding.accountId &&
			!operation.account.cacheState.read().stopped
		);
	}
	private requireCurrent(operation: DeliverableOperation): void {
		if (!this.current(operation))
			throw new Error('The workspace or view changed. Close this view and try again.');
	}
	private async synchronize(operation: DeliverableOperation): Promise<void> {
		this.requireCurrent(operation);
		const { cacheState } = operation.account;
		const previous = cacheState.read().checking;
		if (previous) {
			await previous;
			this.requireCurrent(operation);
		}
		// A pass started before the mutation cannot establish its result. Join only a subsequent pass.
		let checking = cacheState.read().checking;
		if (!checking || checking === previous) {
			checking = this.pull(operation).finally(() => {
				if (cacheState.read().checking === checking) cacheState.update({ checking: null });
			});
			cacheState.update({ checking });
		}
		const result = await checking;
		this.requireCurrent(operation);
		if (result.kind !== 'complete')
			throw new Error(
				result.kind === 'failure' ? result.message : `Workspace synchronization is ${result.kind}.`
			);
	}
	private async pull(operation: DeliverableOperation): Promise<SynchronizationResult> {
		try {
			if (!this.dependencies.environment.online) return { kind: 'offline' };
			const { account, binding } = operation;
			let stored = await account.cacheStorage.load(binding.accountId);
			this.requireCurrent(operation);
			let more: boolean;
			do {
				this.requireCurrent(operation);
				if (!this.dependencies.environment.online) return { kind: 'offline' };
				const before = stored.cursor ?? initialSyncCursor;
				const page = await account.readTransport.pull(before);
				this.requireCurrent(operation);
				if (
					BigInt(page.cursor) < BigInt(before) ||
					(page.hasMore && BigInt(page.cursor) === BigInt(before))
				)
					throw new Error('The server page did not advance its checkpoint');
				await this.commitPage(operation, page);
				stored = await account.cacheStorage.load(binding.accountId);
				this.requireCurrent(operation);
				more = page.hasMore;
			} while (more);
			return { kind: 'complete' };
		} catch (error) {
			return {
				kind: 'failure',
				message: error instanceof Error ? error.message : 'Workspace synchronization failed'
			};
		}
	}
	private async commitPage(
		operation: DeliverableOperation,
		page: SyncPage<WorkspaceRecord>
	): Promise<void> {
		const put: CachedRecord<WorkspaceRecord>[] = page.records.map(({ key, resource }) => ({
			key,
			entry: resource.kind === 'found' ? { kind: 'present', snapshot: resource.snapshot } : resource
		}));
		await operation.account.cacheStorage.transaction(operation.binding.accountId, async (tx) => {
			this.requireCurrent(operation);
			const previous = await tx.resources(put.map((row) => row.key));
			const checkpoint = await tx.checkpoint();
			this.requireCurrent(operation);
			const decision = this.dependencies.cacheMerge.decide(previous, checkpoint, {
				put,
				remove: [],
				cursor: page.cursor,
				inventoryComplete: !page.hasMore
			});
			await tx.put(decision.put);
			if (decision.checkpoint) await tx.putCheckpoint(decision.checkpoint);
			this.requireCurrent(operation);
		});
	}

	private async readLocal(operation: DeliverableOperation, key: string) {
		let local = await operation.account.repository.read(operation.binding.accountId);
		this.requireCurrent(operation);
		let records = this.dependencies.projection.project(
			new Map(local.cache.records.map((row) => [row.key, row.entry])),
			local.writes.entries
		);
		if (
			!records.has(key) &&
			!local.cache.inventoryComplete &&
			!local.cache.records.some((row) => row.key === key && row.entry.kind === 'deleted')
		) {
			await this.synchronize(operation);
			local = await operation.account.repository.read(operation.binding.accountId);
			this.requireCurrent(operation);
			records = this.dependencies.projection.project(
				new Map(local.cache.records.map((row) => [row.key, row.entry])),
				local.writes.entries
			);
			if (!records.has(key) && !local.cache.inventoryComplete)
				throw new Error('Required workspace data is unavailable. Reconnect and retry.');
		}
		return { local, records };
	}
	private sources(documents: readonly { document: ProseMirrorDocument }[]): string[] {
		return documents.flatMap(({ document }) =>
			this.dependencies.preparation
				.assets(document)
				.diagrams.flatMap((diagram) => (diagram.kind === 'mermaid' ? [diagram.source] : []))
		);
	}
	inspect(documents: readonly { document: ProseMirrorDocument }[]) {
		const sources = this.sources(documents);
		return {
			hasDiagrams: sources.length > 0,
			hasSelfStyledDiagrams: sources.some((source) =>
				this.dependencies.themes.keepsOwnColours(source)
			)
		};
	}
	private async renderDiagrams(
		documents: readonly { document: ProseMirrorDocument }[],
		diagrams: readonly { readonly id: string; readonly renderedSvg?: string }[],
		settings: ExportSettings
	): Promise<ExportDiagramImages> {
		const ids = new Set(
			documents.flatMap(({ document }) =>
				this.dependencies.preparation
					.assets(document)
					.diagrams.flatMap((diagram) => (diagram.kind === 'drawio' ? [diagram.diagramId] : []))
			)
		);
		const referenced = [...ids].flatMap((id) => {
			const diagram = diagrams.find((diagram) => diagram.id === id);
			return diagram ? [diagram] : [];
		});
		const [mermaid, drawio] = await Promise.all([
			this.renderMermaid(this.sources(documents), settings),
			this.renderDrawio(referenced)
		]);
		return {
			svgs: { ...mermaid.svgs, ...drawio.svgs },
			pngs: { ...mermaid.pngs, ...drawio.pngs },
			sizes: { ...mermaid.sizes, ...drawio.sizes }
		};
	}
	private async renderDrawio(
		diagrams: readonly { readonly id: string; readonly renderedSvg?: string }[]
	): Promise<ExportDiagramImages> {
		const svgs: Record<string, string> = {};
		const pngs: Record<string, string> = {};
		const sizes: Record<string, DiagramSize> = {};
		// Rasterized together: each diagram's SVG is already laid out, so they have no
		// bearing on each other and a serial loop just waited on each in turn.
		const rendered = await Promise.all(
			diagrams
				.filter((diagram) => diagram.renderedSvg)
				.map(async (diagram) => ({
					diagram,
					png: await this.dependencies.images.rasterize(diagram.renderedSvg!)
				}))
		);
		for (const { diagram, png } of rendered) {
			const size = this.dependencies.preparation.diagramSize(diagram.renderedSvg!);
			if (size) sizes[diagram.id] = size;
			if (png) pngs[diagram.id] = png;
			else svgs[diagram.id] = diagram.renderedSvg!;
		}
		return { svgs, pngs, sizes };
	}

	private async renderMermaid(
		sources: readonly string[],
		settings: ExportSettings
	): Promise<ExportDiagramImages> {
		if (sources.length === 0) return { svgs: {}, pngs: {}, sizes: {} };
		const svgs: Record<string, string> = {};
		const pngs: Record<string, string> = {};
		const sizes: Record<string, DiagramSize> = {};
		// Diagrams follow the export's own palette, never the reader's colour mode: the
		// document lands somewhere we do not control, and a dark-mode render is unusable
		// on paper. Defaults to light for the same reason.
		const theme: MermaidTheme = {
			base: settings.diagramTheme?.base ?? 'light',
			...(settings.diagramTheme?.colors ? { palette: settings.diagramTheme.colors } : {})
		};
		for (const source of sources) {
			try {
				const markup = await this.dependencies.renderer.render(
					`export-diagram-${crypto.randomUUID()}`,
					source,
					this.dependencies.themes.resolve(theme).config,
					'document'
				);
				const hash = await this.dependencies.images.hash(source);
				const size = this.dependencies.preparation.diagramSize(markup);
				if (size) sizes[hash] = size;
				const png = await this.dependencies.images.rasterize(markup);
				if (png) pngs[hash] = png;
				else svgs[hash] = markup;
			} catch (error) {
				throw new Error('A diagram could not be rendered for export', { cause: error });
			}
		}
		return { svgs, pngs, sizes };
	}
}
