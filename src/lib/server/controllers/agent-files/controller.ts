import type {
	AgentGrepResult,
	AgentGrepInput,
	AgentFile,
	AgentFilePaths,
	AgentFileMaterialization,
	AgentFileCommandRules,
	AgentLsResult,
	AgentSedRange,
	AgentSedResult
} from '$lib/models/agent-files';
import type { ToolResultReader } from '$lib/models/agent-tool-context';
import type { AgentToolInput } from '$lib/models/agent-tool-inputs';
import type { AgentPayload } from '$lib/models/agent/payload';
import { toolFailure } from '$lib/models/agent/tool-failure';
import type { ActorContext } from '$lib/models/identity';
import type { AgentToolPresentation } from '$lib/server/services/agent/runs/tool-views';
import type { AgentPayloadInspection } from '$lib/services/agent/payload';

import type { NoteMarkdownWriter } from '$lib/models/note-markdown';
import type {
	AgentFileRepository,
	AgentResourcePathReading,
	AgentFileProjectReader,
	AgentFileNoteReader,
	AgentFileAttachmentReader,
	AgentFileDiagramReader
} from '$lib/models/agent-files';

export interface AgentFilesController {
	ls(actor: ActorContext, path?: string): Promise<AgentLsResult>;
	grep(actor: ActorContext, input: AgentGrepInput): Promise<AgentGrepResult>;
	sed(actor: ActorContext, path: string, range: AgentSedRange): Promise<AgentSedResult>;

	agentLs(actor: ActorContext, input: AgentToolInput<'ls'>): Promise<AgentPayload>;
	agentGrep(actor: ActorContext, input: AgentToolInput<'grep'>): Promise<AgentPayload>;
	agentSed(actor: ActorContext, input: AgentToolInput<'sed'>): Promise<AgentPayload>;
}

export interface AgentFilesDependencies {
	readonly toolPresentation: AgentToolPresentation;
	readonly toolPayloads: AgentPayloadInspection;
	readonly toolResults: ToolResultReader;

	readonly paths: AgentFilePaths;
	readonly metadata: AgentFileMaterialization;
	readonly commands: AgentFileCommandRules;
	readonly resourcePaths: AgentResourcePathReading;
	readonly projects: AgentFileProjectReader;
	readonly notes: AgentFileNoteReader;
	readonly attachments: AgentFileAttachmentReader;
	readonly diagrams: AgentFileDiagramReader;
	readonly stored: AgentFileRepository;
	readonly noteMarkdown: NoteMarkdownWriter;
}

export class AgentFiles implements AgentFilesController {
	constructor(private readonly dependencies: AgentFilesDependencies) {}

	async ls(actor: ActorContext, requestedPath = '.'): Promise<AgentLsResult> {
		const path = this.dependencies.paths.normalize(requestedPath);
		const file = await this.exactFile(actor, path);
		if (file) return { kind: 'listed', path, entries: [file.metadata] };
		return this.dependencies.commands.listDirectory(path, await this.files(actor));
	}
	async grep(actor: ActorContext, input: AgentGrepInput): Promise<AgentGrepResult> {
		const path = this.dependencies.paths.normalize(input.path);
		return this.dependencies.commands.search(path, input, await this.files(actor));
	}
	async sed(actor: ActorContext, pathInput: string, range: AgentSedRange): Promise<AgentSedResult> {
		const path = this.dependencies.paths.normalize(pathInput);
		const file = await this.exactFile(actor, path);
		if (file) return this.dependencies.commands.read(file, range);
		return this.dependencies.commands.missingRead(path, await this.files(actor));
	}
	private async exactFile(actor: ActorContext, path: string): Promise<AgentFile | undefined> {
		const stored = await this.dependencies.stored.findByPath(actor, path);
		if (stored) return stored;

		const resource = this.dependencies.resourcePaths.read(path);
		if (resource?.kind === 'note') {
			const found = await this.dependencies.notes.findById(actor, resource.noteId);
			if (!found || found.projectId !== resource.projectId || found.kind === 'folder')
				return undefined;
			return this.dependencies.metadata.file(
				path,
				'text/markdown',
				this.dependencies.noteMarkdown.write(found.document)
			);
		}

		if (resource?.kind === 'version') {
			const found = await this.dependencies.notes.findById(actor, resource.noteId);
			if (!found || found.projectId !== resource.projectId) return undefined;
			const revision = (await this.dependencies.notes.listRevisions(actor, found.id)).find(
				(candidate) => candidate.revision === resource.revision
			);
			return revision
				? this.dependencies.metadata.file(
						path,
						'text/markdown',
						this.dependencies.noteMarkdown.write(revision.document)
					)
				: undefined;
		}

		if (resource?.kind === 'attachment') {
			const found = await this.dependencies.attachments.findById(actor, resource.attachmentId);
			if (
				!found ||
				found.attachment.projectId !== resource.projectId ||
				found.version.extractedText === undefined
			)
				return undefined;
			return this.dependencies.metadata.file(path, 'text/plain', found.version.extractedText);
		}

		if (resource?.kind === 'diagram') {
			const found = await this.dependencies.diagrams.findById(actor, resource.diagramId);
			if (
				!found ||
				found.projectId !== resource.projectId ||
				this.dependencies.paths.diagram({
					projectId: resource.projectId,
					id: resource.diagramId,
					kind: found.kind
				}) !== path
			)
				return undefined;
			return this.dependencies.metadata.diagram(path, found);
		}
		return undefined;
	}

	private async files(actor: ActorContext): Promise<readonly AgentFile[]> {
		const [projects, stored] = await Promise.all([
			this.dependencies.projects.listActive(actor),
			this.dependencies.stored.list(actor)
		]);
		const files = await Promise.all(
			projects.map(async (project) => {
				const [notes, attachments, diagramPage] = await Promise.all([
					this.dependencies.notes.listActive(actor, project.id),
					this.dependencies.attachments.listForProject(actor, project.id),
					this.dependencies.diagrams.listForProject(actor, project.id)
				]);
				const revisionFiles = (
					await Promise.all(
						notes
							.filter((note) => note.kind !== 'folder')
							.map(async (note) =>
								(await this.dependencies.notes.listRevisions(actor, note.id)).map((revision) =>
									this.dependencies.metadata.file(
										this.dependencies.paths.revision(project.id, note.id, revision.revision),
										'text/markdown',
										this.dependencies.noteMarkdown.write(revision.document)
									)
								)
							)
					)
				).flat();
				return [
					...notes
						.filter((note) => note.kind !== 'folder')
						.map((note) =>
							this.dependencies.metadata.file(
								this.dependencies.paths.note(project.id, note.id),
								'text/markdown',
								this.dependencies.noteMarkdown.write(note.document)
							)
						),
					...revisionFiles,
					...attachments.flatMap((view) => {
						const text = view.version.extractedText;
						return text === undefined
							? []
							: [
									this.dependencies.metadata.file(
										this.dependencies.paths.attachment(project.id, view.attachment.id),
										'text/plain',
										text
									)
								];
					}),
					...diagramPage.diagrams.map((diagram) =>
						this.dependencies.metadata.diagram(this.dependencies.paths.diagram(diagram), diagram)
					)
				];
			})
		);
		return [...files.flat(), ...stored];
	}

	async agentLs(actor: ActorContext, input: AgentToolInput<'ls'>): Promise<AgentPayload> {
		const result = await (async () => {
			return this.projectToolFile(await this.ls(actor, input.path));
		})();
		const payload = this.dependencies.toolResults.read(result);
		return this.dependencies.toolPayloads.filterResult(
			payload,
			this.dependencies.toolResults.arguments(input)
		);
	}
	async agentGrep(actor: ActorContext, input: AgentToolInput<'grep'>): Promise<AgentPayload> {
		const result = await (async () => {
			return this.projectToolFile(
				await this.grep(actor, {
					pattern: input.pattern,
					path: input.path,
					fixed: input.fixed ?? false,
					ignoreCase: input.ignoreCase ?? false
				})
			);
		})();
		const payload = this.dependencies.toolResults.read(result);
		return this.dependencies.toolPayloads.filterResult(
			payload,
			this.dependencies.toolResults.arguments(input)
		);
	}
	async agentSed(actor: ActorContext, input: AgentToolInput<'sed'>): Promise<AgentPayload> {
		const result = await (async () => {
			return this.projectToolFile(await this.sed(actor, input.path, input.range));
		})();
		const payload = this.dependencies.toolResults.read(result);
		return this.dependencies.toolPayloads.filterResult(
			payload,
			this.dependencies.toolResults.arguments(input)
		);
	}

	private projectToolFile(result: AgentLsResult | AgentGrepResult | AgentSedResult) {
		if (result.kind !== 'error') return result;
		return toolFailure(result.code, result.message, 'Follow the exact nextActions below.', {
			...('requestedPath' in result
				? { requestedPath: result.requestedPath }
				: { pattern: result.pattern }),
			...('lineCount' in result ? { lineCount: result.lineCount } : {}),
			nextActions: result.nextActions.map((action) => ({
				reason: action.reason,
				tool: action.tool,
				arguments: this.dependencies.toolResults.json(action.arguments)
			}))
		});
	}
}
