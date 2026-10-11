import {
	TodoBoardExports,
	type TodoBoardExportsController
} from '$lib/controllers/todos/board-export';
import { TodoBoardExportStore } from '$lib/stores/todos/board-export.svelte';
import { TodoBoardExportService } from '$lib/services/todos/board-export';
import { RemoteTodoBoardExport } from '$lib/client/todos/board-export-remote';
import { BrowserTodoBoardExport } from '$lib/client/todos/board-export';
import { workspaceSession } from '$lib/factories/workspace/session';
export const createTodoBoardExports = (): TodoBoardExportsController =>
	new TodoBoardExports(
		new TodoBoardExportStore(),
		new TodoBoardExportService(),
		new RemoteTodoBoardExport(),
		new BrowserTodoBoardExport(),
		() => workspaceSession.current?.resources
	);
