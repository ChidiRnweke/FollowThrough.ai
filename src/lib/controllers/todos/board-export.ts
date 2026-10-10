import type { ProjectId } from '$lib/models/projects';
import type {
	TodoView,
	TodoListFilter,
	BoardPdfExportResult,
	BoardDownloadOutcome
} from '$lib/models/todos';
import type { TodoBoardExport } from '$lib/services/todos/board-export';
import type { TodoBoardExportStore } from '$lib/stores/todos/board-export.svelte';
export interface TodoBoardExportRemote {
	pdf(filter: TodoListFilter): Promise<BoardPdfExportResult>;
}
export interface TodoBoardExportBrowser {
	now(): Date;
	filter(url: URL, projectId?: ProjectId): TodoListFilter;
	markdown(content: string, filename: string): void;
	pdf(result: BoardPdfExportResult): void;
}
export interface TodoBoardExportAccount {
	readonly active: boolean;
}
export interface TodoBoardExportsController {
	readonly generatingPdf: boolean;
	markdown(
		todos: readonly TodoView[],
		projectId?: ProjectId,
		projectNames?: ReadonlyMap<ProjectId, string>
	): void;
	pdf(url: URL, projectId?: ProjectId): Promise<BoardDownloadOutcome>;
	close(): void;
}
export class TodoBoardExports implements TodoBoardExportsController {
	constructor(
		private readonly state: TodoBoardExportStore,
		private readonly rules: TodoBoardExport,
		private readonly remote: TodoBoardExportRemote,
		private readonly browser: TodoBoardExportBrowser,
		private readonly workspace: () => TodoBoardExportAccount | undefined
	) {}
	get generatingPdf(): boolean {
		return this.state.busy;
	}
	markdown(
		todos: readonly TodoView[],
		projectId?: ProjectId,
		projectNames?: ReadonlyMap<ProjectId, string>
	): void {
		if (this.state.closed || !this.workspace()?.active)
			throw new Error('The workspace has stopped');
		const prepared = this.rules.prepare(
			todos,
			{
				title: 'Todos',
				generatedAt: this.browser.now(),
				...(projectNames ? { projectNames } : {})
			},
			projectId ? 'project' : 'all',
			'md'
		);
		this.browser.markdown(prepared.markdown, prepared.filename);
	}
	async pdf(url: URL, projectId?: ProjectId): Promise<BoardDownloadOutcome> {
		const account = this.workspace();
		if (this.state.closed || !account?.active)
			return { kind: 'failure', message: 'The workspace has stopped' };
		this.state.begin();
		try {
			const result = await this.remote.pdf(this.browser.filter(url, projectId));
			if (this.state.closed || !account.active || this.workspace() !== account)
				return { kind: 'superseded' };
			this.browser.pdf(result);
			return { kind: 'downloaded' };
		} catch {
			if (this.state.closed || !account.active || this.workspace() !== account)
				return { kind: 'superseded' };
			return { kind: 'failure', message: 'Could not generate the PDF. Try again.' };
		} finally {
			this.state.finish();
		}
	}
	close(): void {
		this.state.close();
	}
}
