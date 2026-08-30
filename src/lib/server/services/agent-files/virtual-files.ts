import { createHash } from 'node:crypto';
import { getEncoding } from 'js-tiktoken';
import { z } from 'zod';
import {
	RE2JS,
	RE2JSCompileException,
	RE2JSFlagsException,
	RE2JSGroupException,
	RE2JSSyntaxException
} from 're2js';
import type { ActorContext } from '$lib/models/identity';
import type { AttachmentId } from '$lib/models/attachments';
import type { DiagramId } from '$lib/models/diagrams';
import type { NoteId } from '$lib/models/notes';
import type { ProjectId } from '$lib/models/projects';
import type { AgentFileRepository } from '$lib/server/repositories/agent-files/agent-files';
import type { AttachmentRepository } from '$lib/server/repositories/attachments/attachments';
import type { DiagramRepository } from '$lib/server/repositories/diagrams/diagrams';
import type { NoteRepository } from '$lib/server/repositories/notes/notes';
import type { ProjectRepository } from '$lib/server/repositories/projects/projects';
import type {
	AgentFile,
	AgentFileError,
	AgentFileId,
	AgentFileNextAction,
	AgentGrepResult,
	AgentLsResult,
	AgentPathMetadata,
	AgentSedRange,
	AgentSedResult
} from '$lib/models/agent-files';

export interface AgentVirtualFilesDependencies {
	readonly projects: ProjectRepository;
	readonly notes: NoteRepository;
	readonly attachments: AttachmentRepository;
	readonly diagrams: DiagramRepository;
	readonly stored: AgentFileRepository;
	readonly noteMarkdown: (document: Parameters<NoteRepository['update']>[1]['document']) => string;
}

const encoding = getEncoding('cl100k_base');
const uuid = z.uuid();

const validIds = (...values: readonly (string | undefined)[]): boolean =>
	values.every((value) => value !== undefined && uuid.safeParse(value).success);

const normalizePath = (input: string): string => {
	const absolute = input === '.' ? '/' : input.startsWith('/') ? input : `/${input}`;
	const parts: string[] = [];
	for (const part of absolute.split('/')) {
		if (part === '' || part === '.') continue;
		if (part === '..') parts.pop();
		else parts.push(part);
	}
	return `/${parts.join('/')}`;
};

const lineCount = (content: string): number =>
	content.length === 0 ? 0 : content.split('\n').length;

export const agentFileOf = (path: string, mediaType: string, content: string): AgentFile => ({
	metadata: {
		kind: 'file',
		id: createHash('sha256').update(path).digest('hex') as AgentFileId,
		path,
		mediaType,
		byteSize: Buffer.byteLength(content, 'utf8'),
		tokenCount: encoding.encode(content).length,
		lineCount: lineCount(content),
		checksumSha256: createHash('sha256').update(content).digest('hex')
	},
	content
});

const lsAction = (path: string, reason: string): AgentFileNextAction => ({
	reason,
	tool: 'ls',
	arguments: { path }
});

const pathMissing = (path: string, parent: string): AgentFileError => ({
	kind: 'error',
	code: 'path_not_found',
	message: `No file or directory exists at ${path}. The path was not changed or guessed.`,
	requestedPath: path,
	nextActions: [lsAction(parent, `List ${parent} to choose an exact existing path.`)]
});

const parentOf = (path: string): string => {
	const index = path.lastIndexOf('/');
	return index <= 0 ? '/' : path.slice(0, index);
};

export class AgentVirtualFiles {
	constructor(private readonly dependencies: AgentVirtualFilesDependencies) {}

	private async exactFile(actor: ActorContext, path: string): Promise<AgentFile | undefined> {
		const stored = await this.dependencies.stored.findByPath(actor, path);
		if (stored) return stored;

		const note = path.match(/^\/projects\/([^/]+)\/notes\/([^/]+)\.md$/);
		if (note) {
			if (!validIds(note[1], note[2])) return undefined;
			const found = await this.dependencies.notes.findById(actor, note[2] as NoteId);
			if (!found || found.projectId !== (note[1] as ProjectId) || found.kind === 'folder')
				return undefined;
			return agentFileOf(path, 'text/markdown', this.dependencies.noteMarkdown(found.document));
		}

		const version = path.match(/^\/projects\/([^/]+)\/notes\/([^/]+)\/versions\/(\d+)\.md$/);
		if (version) {
			if (!validIds(version[1], version[2])) return undefined;
			const found = await this.dependencies.notes.findById(actor, version[2] as NoteId);
			if (!found || found.projectId !== (version[1] as ProjectId)) return undefined;
			const revision = (await this.dependencies.notes.listRevisions(actor, found.id)).find(
				(candidate) => candidate.revision === Number(version[3])
			);
			return revision
				? agentFileOf(path, 'text/markdown', this.dependencies.noteMarkdown(revision.document))
				: undefined;
		}

		const attachment = path.match(/^\/projects\/([^/]+)\/attachments\/([^/]+)\.txt$/);
		if (attachment) {
			if (!validIds(attachment[1], attachment[2])) return undefined;
			const found = await this.dependencies.attachments.findById(
				actor,
				attachment[2] as AttachmentId
			);
			if (
				!found ||
				found.attachment.projectId !== (attachment[1] as ProjectId) ||
				found.version.extractedText === undefined
			)
				return undefined;
			return agentFileOf(path, 'text/plain', found.version.extractedText);
		}

		const diagram = path.match(/^\/projects\/([^/]+)\/diagrams\/([^/]+)\.(mmd|drawio)$/);
		if (diagram) {
			if (!validIds(diagram[1], diagram[2])) return undefined;
			const found = await this.dependencies.diagrams.findById(actor, diagram[2] as DiagramId);
			if (
				!found ||
				found.projectId !== (diagram[1] as ProjectId) ||
				(found.kind === 'mermaid' ? 'mmd' : 'drawio') !== diagram[3]
			)
				return undefined;
			return agentFileOf(
				path,
				found.kind === 'mermaid' ? 'text/vnd.mermaid' : 'application/vnd.jgraph.mxfile+xml',
				found.source
			);
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
									agentFileOf(
										`/projects/${project.id}/notes/${note.id}/versions/${revision.revision}.md`,
										'text/markdown',
										this.dependencies.noteMarkdown(revision.document)
									)
								)
							)
					)
				).flat();
				return [
					...notes
						.filter((note) => note.kind !== 'folder')
						.map((note) =>
							agentFileOf(
								`/projects/${project.id}/notes/${note.id}.md`,
								'text/markdown',
								this.dependencies.noteMarkdown(note.document)
							)
						),
					...revisionFiles,
					...attachments.flatMap((view) => {
						const text = view.version.extractedText;
						return text === undefined
							? []
							: [
									agentFileOf(
										`/projects/${project.id}/attachments/${view.attachment.id}.txt`,
										'text/plain',
										text
									)
								];
					}),
					...diagramPage.diagrams.map((diagram) =>
						agentFileOf(
							`/projects/${project.id}/diagrams/${diagram.id}.${diagram.kind === 'mermaid' ? 'mmd' : 'drawio'}`,
							diagram.kind === 'mermaid' ? 'text/vnd.mermaid' : 'application/vnd.jgraph.mxfile+xml',
							diagram.source
						)
					)
				];
			})
		);
		return [...files.flat(), ...stored].sort((left, right) =>
			left.metadata.path.localeCompare(right.metadata.path)
		);
	}

	private directories(files: readonly AgentFile[]): ReadonlyMap<string, number> {
		const children = new Map<string, Set<string>>([['/', new Set()]]);
		for (const file of files) {
			const parts = file.metadata.path.split('/').filter(Boolean);
			let directory = '/';
			for (let index = 0; index < parts.length; index += 1) {
				const child = directory === '/' ? `/${parts[index]}` : `${directory}/${parts[index]}`;
				const entries = children.get(directory) ?? new Set<string>();
				entries.add(child);
				children.set(directory, entries);
				if (index < parts.length - 1) children.set(child, children.get(child) ?? new Set());
				directory = child;
			}
		}
		return new Map([...children].map(([path, entries]) => [path, entries.size]));
	}

	async ls(actor: ActorContext, requestedPath = '.'): Promise<AgentLsResult> {
		const path = normalizePath(requestedPath);
		const resolved = await this.exactFile(actor, path);
		if (resolved) return { kind: 'listed', path, entries: [resolved.metadata] };
		const files = await this.files(actor);
		const directories = this.directories(files);
		if (!directories.has(path)) return pathMissing(path, parentOf(path));
		const prefix = path === '/' ? '/' : `${path}/`;
		const entries: AgentPathMetadata[] = [];
		for (const [directory, childCount] of directories) {
			if (directory !== path && parentOf(directory) === path)
				entries.push({ kind: 'directory', path: directory, childCount });
		}
		for (const file of files) {
			if (file.metadata.path.startsWith(prefix) && parentOf(file.metadata.path) === path)
				entries.push(file.metadata);
		}
		return {
			kind: 'listed',
			path,
			entries: entries.sort((left, right) => left.path.localeCompare(right.path))
		};
	}

	async grep(
		actor: ActorContext,
		input: {
			readonly pattern: string;
			readonly path: string;
			readonly fixed: boolean;
			readonly ignoreCase: boolean;
		}
	): Promise<AgentGrepResult> {
		const path = normalizePath(input.path);
		const files = await this.files(actor);
		const directories = this.directories(files);
		const targets = files.filter(
			(file) => file.metadata.path === path || file.metadata.path.startsWith(`${path}/`)
		);
		if (targets.length === 0 && !directories.has(path)) return pathMissing(path, parentOf(path));
		let expression: RE2JS;
		try {
			const pattern = input.fixed ? RE2JS.quote(input.pattern) : input.pattern;
			expression = RE2JS.compile(pattern, input.ignoreCase ? RE2JS.CASE_INSENSITIVE : 0);
		} catch (error) {
			if (!(
				error instanceof RE2JSCompileException ||
				error instanceof RE2JSFlagsException ||
				error instanceof RE2JSGroupException ||
				error instanceof RE2JSSyntaxException
			))
				throw error;
			return {
				kind: 'error',
				code: 'invalid_pattern',
				message: `The RE2 pattern is invalid: ${error.message}`,
				pattern: input.pattern,
				nextActions: [
					{
						reason: 'Search for the exact text without regex syntax.',
						tool: 'grep',
						arguments: { ...input, fixed: true }
					}
				]
			};
		}
		const matches = targets.flatMap((file) =>
			file.content
				.split('\n')
				.flatMap((line, index) =>
					expression.test(line) ? [{ path: file.metadata.path, lineNumber: index + 1, line }] : []
				)
		);
		if (matches.length > 0)
			return { kind: 'matches', exitCode: 0, pattern: input.pattern, path, matches };
		return {
			kind: 'no_matches',
			exitCode: 1,
			pattern: input.pattern,
			path,
			searchedFileCount: targets.length,
			nextActions: [
				lsAction(path, 'Inspect the searched scope before choosing a different pattern.')
			]
		};
	}

	async sed(actor: ActorContext, pathInput: string, range: AgentSedRange): Promise<AgentSedResult> {
		const path = normalizePath(pathInput);
		const file = await this.exactFile(actor, path);
		if (!file) {
			const files = await this.files(actor);
			if (this.directories(files).has(path))
				return {
					kind: 'error',
					code: 'path_is_directory',
					message: `${path} is a directory; sed reads one file.`,
					requestedPath: path,
					nextActions: [lsAction(path, 'Choose an exact file from this directory.')]
				};
			return pathMissing(path, parentOf(path));
		}
		if (file.metadata.lineCount === 0)
			return {
				kind: 'error',
				code: 'empty_file',
				message: `${path} is empty; there are no lines to read.`,
				requestedPath: path,
				nextActions: [
					lsAction(
						parentOf(path),
						'Inspect sibling files; retrying sed on this file cannot return content.'
					)
				]
			};
		if (range.kind === 'lines' && range.endLine < range.startLine)
			return {
				kind: 'error',
				code: 'range_ends_before_start',
				message: `endLine ${range.endLine} is before startLine ${range.startLine}; the range was not reordered.`,
				requestedPath: path,
				nextActions: [
					{
						reason: 'Retry with an ordered inclusive range.',
						tool: 'sed',
						arguments: {
							path,
							range: { kind: 'lines', startLine: range.endLine, endLine: range.startLine }
						}
					}
				]
			};
		if (range.startLine > file.metadata.lineCount)
			return {
				kind: 'error',
				code: 'range_starts_after_eof',
				message: `${path} has ${file.metadata.lineCount} lines; startLine ${range.startLine} is after EOF. No range was clamped.`,
				requestedPath: path,
				lineCount: file.metadata.lineCount,
				nextActions: [
					{
						reason: 'Read the final available line.',
						tool: 'sed',
						arguments: {
							path,
							range: {
								kind: 'lines',
								startLine: file.metadata.lineCount,
								endLine: file.metadata.lineCount
							}
						}
					}
				]
			};
		const lines = file.content.split('\n');
		const requestedEnd = range.kind === 'lines' ? range.endLine : file.metadata.lineCount;
		const endLine = Math.min(requestedEnd, file.metadata.lineCount);
		const nextActions: AgentFileNextAction[] =
			endLine < file.metadata.lineCount
				? [
						{
							reason: `Continue at the next unread line; ${file.metadata.lineCount - endLine} lines remain.`,
							tool: 'sed',
							arguments: { path, range: { kind: 'to_end', startLine: endLine + 1 } }
						}
					]
				: [];
		return {
			kind: 'content',
			path,
			startLine: range.startLine,
			endLine,
			lineCount: file.metadata.lineCount,
			content: lines.slice(range.startLine - 1, endLine).join('\n'),
			nextActions
		};
	}
}
