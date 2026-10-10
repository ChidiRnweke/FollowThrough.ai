import type { SyncResourceRules } from '$lib/services/sync/state';
import {
	defaultExportSettings,
	type ExportSettings,
	type ExportSettingsLoad,
	type ExportDownload,
	type GenerateDocumentInput,
	type GenerateBundleInput,
	type GenerateBundleOutput,
	type PreviewDocumentInput,
	type PreviewDocumentOutput
} from '$lib/models/deliverables';
import type { ProseMirrorDocument, NoteId, NoteDocument } from '$lib/models/notes';
import type { ProjectId, ProjectExportEntry } from '$lib/models/projects';
import type {
	WorkspaceSession,
	WorkspaceSessionController
} from '$lib/controllers/workspace/session';
import type { DiagramExportController } from './diagrams';
import type { DocumentExportStore } from '$lib/stores/deliverables/export.svelte';

export interface DocumentExportRemote {
	generate(input: GenerateDocumentInput): Promise<{ readonly downloadUrl: string }>;
	bundle(input: GenerateBundleInput): Promise<GenerateBundleOutput>;
	preview(input: PreviewDocumentInput): Promise<PreviewDocumentOutput>;
}
export interface DocumentPreviewUrls {
	create(data: string): string;
	release(url: string): void;
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
	readonly busy: boolean;
	readonly error: string;
	readonly result: ExportDownload | null;
	readonly previewUrl: string;
	open(projectId: string): Promise<ExportSettingsLoad>;
	inspect(documents: readonly { readonly document: ProseMirrorDocument }[]): {
		readonly hasDiagrams: boolean;
		readonly hasSelfStyledDiagrams: boolean;
	};
	documents(ids: readonly string[]): readonly NoteDocument[];
	preview(input: BrowserDocumentExportInput): Promise<void>;
	generate(input: BrowserDocumentExportInput & { readonly format: 'docx' | 'pdf' }): Promise<void>;
	bundle(input: BrowserBundleExportInput): Promise<void>;
	close(): void;
}
export class DocumentExports implements DocumentExportController {
	constructor(
		private readonly syncResourceRules: SyncResourceRules,
		private readonly state: DocumentExportStore,
		private readonly workspace: WorkspaceSessionController,
		private readonly diagrams: DiagramExportController,
		private readonly remote: DocumentExportRemote,
		private readonly urls: DocumentPreviewUrls
	) {}
	get ready(): boolean {
		return this.state.ready;
	}
	get busy(): boolean {
		return this.state.busy;
	}
	get error(): string {
		return this.state.error;
	}
	get result(): ExportDownload | null {
		return this.state.result;
	}
	get previewUrl(): string {
		return this.state.previewUrl;
	}
	private current(generation: number, session: WorkspaceSession): boolean {
		return (
			generation === this.state.generation &&
			session.resources.active &&
			this.workspace.current === session
		);
	}
	async open(projectId: string): Promise<ExportSettingsLoad> {
		this.close();
		const generation = this.state.open();
		let session: WorkspaceSession | undefined;
		try {
			session = await this.workspace.start();
			if (!this.current(generation, session)) return { kind: 'superseded' };
			const result = await session.resources.lookup({
				type: 'export_settings',
				id: [session.bootstrap.accountId, projectId]
			});
			if (!this.current(generation, session)) return { kind: 'superseded' };
			let settings: ExportSettings;
			if (result.kind === 'absent' || result.kind === 'deleted')
				settings = { ...defaultExportSettings };
			else {
				if (result.kind !== 'ready')
					throw new Error(this.syncResourceRules.accessMessage(result, 'export setting'));
				if (result.value.type !== 'export_settings')
					throw new Error('The export defaults have the wrong resource type');
				settings = { ...defaultExportSettings, ...result.value.value.settings };
			}
			this.state.loaded();
			return { kind: 'ready', settings };
		} catch (cause) {
			const message =
				cause instanceof Error ? cause.message : 'Export settings could not be loaded.';
			if (generation !== this.state.generation || (session && !this.current(generation, session)))
				return { kind: 'superseded' };
			this.state.fail(message);
			return { kind: 'failure', message };
		}
	}
	inspect(documents: readonly { readonly document: ProseMirrorDocument }[]) {
		return this.diagrams.inspect(documents);
	}
	documents(ids: readonly string[]): readonly NoteDocument[] {
		return (
			this.workspace.current?.resources.views
				.all('notes')
				.filter((note) => ids.includes(note.id)) ?? []
		);
	}
	async preview(input: BrowserDocumentExportInput): Promise<void> {
		await this.run(input.title, 'Preview failed', async (current) => {
			const renders = await this.diagrams.render(input.documents, input.diagrams, input.settings);
			if (!current()) return;
			const output = await this.remote.preview({
				projectId: input.projectId as ProjectId,
				noteIds: input.noteIds.map((id) => id as NoteId),
				title: input.title.trim(),
				settings: input.settings,
				diagramSvgs: renders.svgs,
				diagramPngs: renders.pngs,
				diagramSizes: renders.sizes
			});
			if (!current()) return;
			const url = this.urls.create(output.data);
			if (this.state.previewUrl) this.urls.release(this.state.previewUrl);
			this.state.showPreview(url);
		});
	}
	async generate(
		input: BrowserDocumentExportInput & { readonly format: 'docx' | 'pdf' }
	): Promise<void> {
		await this.run(input.title, 'Export failed', async (current) => {
			const renders = await this.diagrams.render(input.documents, input.diagrams, input.settings);
			if (!current()) return;
			const output = await this.remote.generate({
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
		await this.run(input.title, 'Export failed', async (current, session) => {
			const documents = await Promise.all(
				input.entries.map(async (entry) => {
					const result = await session.resources.open({ type: 'notes', id: [entry.id] });
					if (result.kind !== 'ready')
						throw new Error(this.syncResourceRules.accessMessage(result, 'note'));
					if (result.value.type !== 'notes') throw new Error('The selected resource is not a note');
					return result.value.value;
				})
			);
			if (!current()) return;
			const renders = await this.diagrams.render(documents, [], input.settings);
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
				const output = await this.remote.bundle({
					...common,
					entries: input.entries.map((entry) => ({ noteId: entry.id as NoteId, path: entry.path }))
				});
				if (current()) this.state.publish({ url: output.downloadUrl, fileCount: output.fileCount });
			} else {
				const output = await this.remote.generate({
					...common,
					noteIds: input.entries.map((entry) => entry.id as NoteId)
				});
				if (current()) this.state.publish({ url: output.downloadUrl, fileCount: 1 });
			}
		});
	}
	private async run(
		title: string,
		failure: string,
		operation: (current: () => boolean, session: WorkspaceSession) => Promise<void>
	): Promise<void | { readonly kind: 'failure'; readonly message: string }> {
		if (!title.trim() || !this.ready || this.busy) return;
		const session = this.workspace.current;
		if (!session?.resources.active) {
			this.state.fail('The workspace has stopped');
			return;
		}
		const generation = this.state.generation;
		const current = () => this.current(generation, session);
		this.state.begin();
		try {
			await operation(current, session);
		} catch (cause) {
			const message = cause instanceof Error ? cause.message : failure;
			if (current()) this.state.fail(message);
			return { kind: 'failure', message };
		} finally {
			if (generation === this.state.generation) this.state.finish();
		}
	}
	close(): void {
		if (this.state.previewUrl) this.urls.release(this.state.previewUrl);
		this.state.close();
	}
}
