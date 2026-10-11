import {
	todoBoardFilterSchema,
	type TodoListFilter,
	type BoardPdfExportResult
} from '$lib/models/todos';
import type { ProjectId } from '$lib/models/projects';
import type { TodoBoardExportBrowser } from '$lib/controllers/todos/board-export';
const download = (content: Blob, filename: string): void => {
	const url = URL.createObjectURL(content);
	const anchor = document.createElement('a');
	anchor.href = url;
	anchor.download = filename;
	try {
		document.body.appendChild(anchor);
		anchor.click();
	} finally {
		anchor.remove();
		URL.revokeObjectURL(url);
	}
};
export class BrowserTodoBoardExport implements TodoBoardExportBrowser {
	now(): Date {
		return new Date();
	}
	filter(url: URL, projectId?: ProjectId): TodoListFilter {
		const responsibility = url.searchParams.get('responsibility');
		const category = url.searchParams.get('category');
		const selectedProject = projectId ?? url.searchParams.get('projectId');
		return todoBoardFilterSchema.parse({
			...(selectedProject ? { projectId: selectedProject } : {}),
			...(responsibility === 'mine' || responsibility === 'waiting_on' ? { responsibility } : {}),
			...(category ? { category } : {})
		});
	}
	markdown(content: string, filename: string): void {
		download(new Blob([content], { type: 'text/markdown;charset=utf-8' }), filename);
	}
	pdf(result: BoardPdfExportResult): void {
		const bytes = Uint8Array.from(atob(result.data), (char) => char.charCodeAt(0));
		download(new Blob([bytes], { type: 'application/pdf' }), result.filename);
	}
}
