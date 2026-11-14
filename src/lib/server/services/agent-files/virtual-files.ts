import type { TokenCounter } from '$lib/models/tokenization';
import { createHash } from 'node:crypto';
import { readAgentResourcePath } from '$lib/server/repositories/agent-files/agent-files';
import {
	RE2JS,
	RE2JSCompileException,
	RE2JSFlagsException,
	RE2JSGroupException,
	RE2JSSyntaxException
} from 're2js';
import type { AttachmentId } from '$lib/models/attachments';
import type { Diagram } from '$lib/models/diagrams';
import type { Note } from '$lib/models/notes';
import type { KnowledgeSearchSource } from '$lib/models/knowledge-search';
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
	AgentFileWindow,
	AgentLsResult,
	AgentPassage,
	AgentPathMetadata,
	AgentSedRange,
	AgentSedResult
} from '$lib/models/agent-files';

export interface AgentNoteMarkdownWriter {
	write(document: Note['document']): string;
}
export interface AgentVirtualFilesDependencies {
	readonly tokens: TokenCounter;
	readonly projects: ProjectRepository;
	readonly notes: NoteRepository;
	readonly attachments: AttachmentRepository;
	readonly diagrams: DiagramRepository;
	readonly stored: AgentFileRepository;
	readonly noteMarkdown: AgentNoteMarkdownWriter;
}

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

/** Where an attachment's extracted text is mounted. */
const attachmentFilePath = (projectId: ProjectId, attachmentId: AttachmentId): string =>
	`/projects/${projectId}/attachments/${attachmentId}.txt`;

/** Where a diagram's source is mounted; the extension says which language it is. */
const diagramFilePath = (diagram: Pick<Diagram, 'projectId' | 'id' | 'kind'>): string =>
	`/projects/${diagram.projectId}/diagrams/${diagram.id}.${diagram.kind === 'mermaid' ? 'mmd' : 'drawio'}`;

const noteFilePath = (note: Pick<Note, 'projectId' | 'id'>): string =>
	`/projects/${note.projectId}/notes/${note.id}.md`;

const agentFileOf = (
	tokens: TokenCounter,
	path: string,
	mediaType: string,
	content: string
): AgentFile => ({
	metadata: {
		kind: 'file',
		id: createHash('sha256').update(path).digest('hex') as AgentFileId,
		path,
		mediaType,
		byteSize: Buffer.byteLength(content, 'utf8'),
		tokenCount: tokens.count(content),
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

/**
 * How much of a note body `get_note` returns. Measured on 2026-11-14 against a real workspace
 * over MCP: the descriptor-only reply was about 220 tokens, and ten sampled note bodies were 9,
 * 24, 43, 308, 395, 649, 660, 1013, 1176 and 6840 tokens. At 1,000 tokens seven of the ten come
 * back whole in the call that already pays for the descriptor; the rest arrive as a first page
 * with the `sed` call that continues them, instead of costing a second round trip to start.
 */
export const NOTE_BODY_TOKEN_BUDGET = 1000;

/**
 * How much of one retrieved chunk `search` returns. Measured on 2026-11-14: one query returned
 * 8 hits totalling about 15,000 tokens, and five were attachment chunks close to the 2,400-token
 * chunk target, so a single search could fill a fifth of a context window. 600 tokens keeps the
 * leading paragraphs a hit is judged on and bounds eight hits near 5,000 tokens; the rest of a
 * cut passage stays one `sed` call away at the path and lines the hit names.
 */
export const SEARCH_PASSAGE_TOKEN_BUDGET = 600;

/** How many whole leading lines fit in `budget` tokens, counting the newline that joins them. */
const leadingLines = (tokens: TokenCounter, lines: readonly string[], budget: number): number => {
	let used = 0;
	for (let index = 0; index < lines.length; index += 1) {
		used += tokens.count(lines[index]) + (index === 0 ? 0 : 1);
		if (used > budget) return index;
	}
	return lines.length;
};

/** The longest prefix of one over-budget line that fits, found by bisecting its length. */
const leadingCharacters = (tokens: TokenCounter, line: string, budget: number): string => {
	let fits = 0;
	let over = line.length;
	while (over - fits > 1) {
		const middle = Math.floor((fits + over) / 2);
		if (tokens.count(line.slice(0, middle)) <= budget) fits = middle;
		else over = middle;
	}
	return line.slice(0, fits);
};

/** A file read from its first line up to `budget` tokens, cut on whole lines. */
const fileWindow = (tokens: TokenCounter, file: AgentFile, budget: number): AgentFileWindow => {
	if (file.metadata.tokenCount <= budget)
		return { kind: 'inline', file: file.metadata, content: file.content };
	const lines = file.content.split('\n');
	const endLine = leadingLines(tokens, lines, budget);
	const continueAt = (startLine: number): AgentFileNextAction => ({
		reason: `Continue at the next unread line; ${file.metadata.lineCount - startLine + 1} lines remain.`,
		tool: 'sed',
		arguments: { path: file.metadata.path, range: { kind: 'to_end', startLine } }
	});
	if (endLine === 0) return { kind: 'file', file: file.metadata, nextActions: [continueAt(1)] };
	return {
		kind: 'paged',
		file: file.metadata,
		startLine: 1,
		endLine,
		content: lines.slice(0, endLine).join('\n'),
		nextActions: [continueAt(endLine + 1)]
	};
};

/** A passage cut to `budget` tokens on whole lines, or inside its first line when that alone is over. */
const passageExcerpt = (
	tokens: TokenCounter,
	content: string,
	budget: number
): { readonly content: string; readonly cut: boolean } => {
	if (tokens.count(content) <= budget) return { content, cut: false };
	const lines = content.split('\n');
	const kept = leadingLines(tokens, lines, budget);
	return {
		content:
			kept === 0 ? leadingCharacters(tokens, lines[0], budget) : lines.slice(0, kept).join('\n'),
		cut: true
	};
};

/**
 * Letters and digits only. Indexed text is derived (a note is chunked from its plain text, not
 * its Markdown), so markup, punctuation and spacing differ between a chunk and the file it came
 * from while the words do not. Link targets and HTML entities are Markdown that the plain text
 * never had, so they go before the comparison rather than counting as words.
 */
const comparable = (line: string): string =>
	line
		.replace(/\]\([^)]*\)/g, '')
		.replace(/&(?:[a-z]+|#\d+);/gi, '')
		.toLowerCase()
		.replace(/[^\p{L}\p{N}]+/gu, '');

/**
 * The inclusive line range a passage occupies in a file: every non-blank passage line must match
 * the next non-blank file line in order. The ends are compared by containment because a chunk
 * can begin or end inside a line; inner lines by containment either way, because Markdown can
 * add or drop a list marker or emphasis around the same words.
 */
const passageLines = (
	fileContent: string,
	passage: string
): { readonly startLine: number; readonly endLine: number } | undefined => {
	const wanted = passage.split('\n').map(comparable).filter(Boolean);
	if (wanted.length === 0) return undefined;
	const lines = fileContent
		.split('\n')
		.map((line, index) => ({ text: comparable(line), number: index + 1 }))
		.filter((line) => line.text.length > 0);
	for (let start = 0; start + wanted.length <= lines.length; start += 1) {
		if (!lines[start].text.includes(wanted[0])) continue;
		const matches = wanted.every((text, offset) => {
			const line = lines[start + offset].text;
			return offset === 0 || line.includes(text) || text.includes(line);
		});
		if (matches)
			return { startLine: lines[start].number, endLine: lines[start + wanted.length - 1].number };
	}
	return undefined;
};

/** Where agent-readable resources are mounted, and how a mounted file is described. */
export interface AgentFileReferences {
	attachmentPath(projectId: ProjectId, attachmentId: AttachmentId): string;
	diagramPath(diagram: Pick<Diagram, 'projectId' | 'id' | 'kind'>): string;
	/** A note's Markdown as a file, returned whole or as its first page within the body budget. */
	noteBody(note: Pick<Note, 'projectId' | 'id'>, markdown: string): AgentFileWindow;
}

export class AgentFileReferenceService implements AgentFileReferences {
	constructor(private readonly tokens: TokenCounter) {}

	attachmentPath(projectId: ProjectId, attachmentId: AttachmentId): string {
		return attachmentFilePath(projectId, attachmentId);
	}

	diagramPath(diagram: Pick<Diagram, 'projectId' | 'id' | 'kind'>): string {
		return diagramFilePath(diagram);
	}

	noteBody(note: Pick<Note, 'projectId' | 'id'>, markdown: string): AgentFileWindow {
		return fileWindow(
			this.tokens,
			agentFileOf(this.tokens, noteFilePath(note), 'text/markdown', markdown),
			NOTE_BODY_TOKEN_BUDGET
		);
	}
}

/** Places retrieved passages in the virtual filesystem so a hit leads straight into `sed`. */
export interface AgentPassageLocator {
	passage(source: KnowledgeSearchSource, content: string): Promise<AgentPassage>;
}

export interface AgentFileReader {
	ls(path?: string): Promise<AgentLsResult>;
	grep(input: {
		readonly pattern: string;
		readonly path: string;
		readonly fixed: boolean;
		readonly ignoreCase: boolean;
	}): Promise<AgentGrepResult>;
	sed(path: string, range: AgentSedRange): Promise<AgentSedResult>;
}

export class AgentVirtualFiles implements AgentFileReader, AgentPassageLocator {
	constructor(private readonly dependencies: AgentVirtualFilesDependencies) {}

	private async exactFile(path: string): Promise<AgentFile | undefined> {
		const stored = await this.dependencies.stored.findByPath(path);
		if (stored) return stored;

		const resource = readAgentResourcePath(path);
		if (resource?.kind === 'note') {
			const found = await this.dependencies.notes.findById(resource.noteId);
			if (!found || found.projectId !== resource.projectId || found.kind === 'folder')
				return undefined;
			return agentFileOf(
				this.dependencies.tokens,
				path,
				'text/markdown',
				this.dependencies.noteMarkdown.write(found.document)
			);
		}

		if (resource?.kind === 'version') {
			const found = await this.dependencies.notes.findById(resource.noteId);
			if (!found || found.projectId !== resource.projectId) return undefined;
			const revision = (await this.dependencies.notes.listRevisions(found.id)).find(
				(candidate) => candidate.revision === resource.revision
			);
			return revision
				? agentFileOf(
						this.dependencies.tokens,
						path,
						'text/markdown',
						this.dependencies.noteMarkdown.write(revision.document)
					)
				: undefined;
		}

		if (resource?.kind === 'attachment') {
			const found = await this.dependencies.attachments.findById(resource.attachmentId);
			if (
				!found ||
				found.attachment.projectId !== resource.projectId ||
				found.version.extractedText === undefined
			)
				return undefined;
			return agentFileOf(this.dependencies.tokens, path, 'text/plain', found.version.extractedText);
		}

		if (resource?.kind === 'diagram') {
			const found = await this.dependencies.diagrams.findById(resource.diagramId);
			if (
				!found ||
				found.projectId !== resource.projectId ||
				(found.kind === 'mermaid' ? 'mmd' : 'drawio') !== resource.extension
			)
				return undefined;
			return agentFileOf(
				this.dependencies.tokens,
				path,
				found.kind === 'mermaid' ? 'text/vnd.mermaid' : 'application/vnd.jgraph.mxfile+xml',
				found.source
			);
		}
		return undefined;
	}

	private async files(): Promise<readonly AgentFile[]> {
		const [projects, stored] = await Promise.all([
			this.dependencies.projects.listActive(),
			this.dependencies.stored.list()
		]);
		const files = await Promise.all(
			projects.map(async (project) => {
				const [notes, attachments, diagramPage] = await Promise.all([
					this.dependencies.notes.listActive(project.id),
					this.dependencies.attachments.listForProject(project.id),
					this.dependencies.diagrams.listForProject(project.id)
				]);
				const revisionFiles = (
					await Promise.all(
						notes
							.filter((note) => note.kind !== 'folder')
							.map(async (note) =>
								(await this.dependencies.notes.listRevisions(note.id)).map((revision) =>
									agentFileOf(
										this.dependencies.tokens,
										`/projects/${project.id}/notes/${note.id}/versions/${revision.revision}.md`,
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
							agentFileOf(
								this.dependencies.tokens,
								noteFilePath({ projectId: project.id, id: note.id }),
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
									agentFileOf(
										this.dependencies.tokens,
										attachmentFilePath(project.id, view.attachment.id),
										'text/plain',
										text
									)
								];
					}),
					...diagramPage.diagrams.map((diagram) =>
						agentFileOf(
							this.dependencies.tokens,
							diagramFilePath(diagram),
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

	async ls(requestedPath = '.'): Promise<AgentLsResult> {
		const path = normalizePath(requestedPath);
		const resolved = await this.exactFile(path);
		if (resolved) return { kind: 'listed', path, entries: [resolved.metadata] };
		const files = await this.files();
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

	async grep(input: {
		readonly pattern: string;
		readonly path: string;
		readonly fixed: boolean;
		readonly ignoreCase: boolean;
	}): Promise<AgentGrepResult> {
		const path = normalizePath(input.path);
		const files = await this.files();
		const directories = this.directories(files);
		const targets = files.filter(
			(file) =>
				file.metadata.path === path ||
				file.metadata.path.startsWith(path === '/' ? '/' : `${path}/`)
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

	private async sourcePath(source: KnowledgeSearchSource): Promise<string | undefined> {
		switch (source.kind) {
			case 'note':
				return noteFilePath({ projectId: source.projectId, id: source.id });
			case 'attachment':
				return attachmentFilePath(source.projectId, source.id);
			case 'diagram': {
				const diagram = await this.dependencies.diagrams.findById(source.id);
				return diagram ? diagramFilePath(diagram) : undefined;
			}
			case 'memory':
			case 'widget':
			case 'unavailable':
				return undefined;
		}
	}

	async passage(source: KnowledgeSearchSource, content: string): Promise<AgentPassage> {
		const path = await this.sourcePath(source);
		const file = path === undefined ? undefined : await this.exactFile(path);
		if (file === undefined) return { kind: 'detached', content };
		const excerpt = passageExcerpt(this.dependencies.tokens, content, SEARCH_PASSAGE_TOKEN_BUDGET);
		const located = passageLines(file.content, content);
		if (located === undefined)
			return {
				kind: 'file',
				path: file.metadata.path,
				content: excerpt.content,
				nextActions: excerpt.cut
					? [
							{
								reason:
									'The excerpt was cut and could not be matched to lines; read the source file.',
								tool: 'sed',
								arguments: { path: file.metadata.path, range: { kind: 'to_end', startLine: 1 } }
							}
						]
					: []
			};
		return {
			kind: 'lines',
			path: file.metadata.path,
			...located,
			content: excerpt.content,
			nextActions: excerpt.cut
				? [
						{
							reason: 'The excerpt was cut; read the whole passage.',
							tool: 'sed',
							arguments: { path: file.metadata.path, range: { kind: 'lines', ...located } }
						}
					]
				: []
		};
	}

	async sed(pathInput: string, range: AgentSedRange): Promise<AgentSedResult> {
		const path = normalizePath(pathInput);
		const file = await this.exactFile(path);
		if (!file) {
			const files = await this.files();
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
