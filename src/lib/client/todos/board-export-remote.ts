import { exportBoardPdf } from '$lib/remote/todos/todos.remote';
import type { TodoListFilter, BoardPdfExportResult } from '$lib/models/todos';
import type { TodoBoardExportRemote } from '$lib/controllers/todos/board-export';
export class RemoteTodoBoardExport implements TodoBoardExportRemote {
	pdf(filter: TodoListFilter): Promise<BoardPdfExportResult> {
		return exportBoardPdf(filter);
	}
}
