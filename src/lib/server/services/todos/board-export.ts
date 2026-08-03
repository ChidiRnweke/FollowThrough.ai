import type { ActorContext } from '$lib/models/identity';
import type { ProseMirrorDocument } from '$lib/models/notes';
import type { Project } from '$lib/models/projects';
import { defaultExportSettings, type ExportSettings } from '$lib/models/deliverables';
import {
	boardExportDate,
	boardExportSlug,
	boardMarkdown,
	type BoardPdfExportResult,
	type Todo,
	type TodoListFilter,
	type TodoView
} from '$lib/models/todos';

/* Ports mirrored locally: chisel forbids a service importing any other service module —
   even the contracts of its own capability — so this service declares the exact shapes
   it consumes and the composition root wires the catalogs in structurally. The pdfmake
   input mirrors GeneratePdfInput for the same reason — see deliverables/artifacts.ts. */
export interface BoardExportTodoLister {
	list(actor: ActorContext, filter: TodoListFilter): Promise<readonly Todo[]>;
}

export interface BoardExportTodoViewAssembler {
	assemble(actor: ActorContext, todos: readonly Todo[]): Promise<readonly TodoView[]>;
}

export interface BoardExportProjectLister {
	list(actor: ActorContext): Promise<readonly Project[]>;
}

/** The editor-schema markdown converter, injected so the service never reaches across
    layers into components/edra. */
export type MarkdownToDocument = (source: string) => ProseMirrorDocument;

interface BoardPdfInput {
	readonly notes: readonly { title: string; document: ProseMirrorDocument }[];
	readonly title: string;
	readonly settings?: ExportSettings;
}

export type BoardPdfGenerator = (input: BoardPdfInput) => Promise<Buffer>;

/**
 * Renders the kanban board matching a filter as a one-off PDF: the board's own Markdown
 * export, converted back into a note document so the deliverables PDF pipeline typesets
 * it. Ephemeral by design — the bytes stream straight to the download as base64, with no
 * artifact record.
 */
export class BoardPdfExport {
	constructor(
		private readonly todoLister: BoardExportTodoLister,
		private readonly todoViewAssembler: BoardExportTodoViewAssembler,
		private readonly projectLister: BoardExportProjectLister,
		private readonly markdownToDocument: MarkdownToDocument,
		private readonly pdfGenerator: BoardPdfGenerator
	) {}

	async exportBoardPdf(actor: ActorContext, filter: TodoListFilter): Promise<BoardPdfExportResult> {
		const [todos, projects] = await Promise.all([
			this.todoLister.list(actor, filter),
			this.projectLister.list(actor)
		]);
		const views = await this.todoViewAssembler.assemble(actor, todos);
		const projectNames = new Map(projects.map((project) => [project.id, project.name]));
		const generatedAt = new Date();
		const projectName = filter.projectId ? projectNames.get(filter.projectId) : undefined;
		const title = projectName ? `${projectName} todos` : 'Todos';
		const document = this.markdownToDocument(
			boardMarkdown(views, { title, generatedAt, projectNames })
		);
		const pdf = await this.pdfGenerator({
			title,
			notes: [{ title, document }],
			settings: { ...defaultExportSettings, includeTitle: true }
		});
		return {
			data: pdf.toString('base64'),
			filename: `kanban-${boardExportSlug(projectName ?? 'all')}-${boardExportDate(generatedAt)}.pdf`
		};
	}
}
