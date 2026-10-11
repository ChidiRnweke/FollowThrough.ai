import { BrowserTodoBoardExport } from '$lib/client/todos/board-export';
import type { TodoBoardExportRemote } from '$lib/controllers/todos/board-export';
import type { BoardPdfExportResult, TodoListFilter } from '$lib/models/todos';
export class InMemoryBoardExportBrowser extends BrowserTodoBoardExport {
	readonly downloads: { kind: 'md' | 'pdf'; content: string; filename: string }[] = [];
	override now(): Date {
		return new Date(2026, 7, 3);
	}
	override markdown(content: string, filename: string): void {
		this.downloads.push({ kind: 'md', content, filename });
	}
	override pdf(result: BoardPdfExportResult): void {
		this.downloads.push({ kind: 'pdf', content: result.data, filename: result.filename });
	}
}
export class InMemoryBoardExportRemote implements TodoBoardExportRemote {
	readonly filters: TodoListFilter[] = [];
	failure: Error | undefined;
	private gate: { readonly entered: () => void; readonly wait: Promise<void> } | undefined;
	pause(): { started: Promise<void>; release: () => void } {
		const started = Promise.withResolvers<void>();
		const released = Promise.withResolvers<void>();
		this.gate = { entered: () => started.resolve(), wait: released.promise };
		return { started: started.promise, release: () => released.resolve() };
	}
	async pdf(filter: TodoListFilter): Promise<BoardPdfExportResult> {
		this.filters.push(filter);
		const gate = this.gate;
		this.gate = undefined;
		if (gate) {
			gate.entered();
			await gate.wait;
		}
		if (this.failure) throw this.failure;
		return { data: 'JVBERi0=', filename: 'kanban-all-2026-08-03.pdf' };
	}
}
