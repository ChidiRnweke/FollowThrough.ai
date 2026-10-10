import {
	RE2JS,
	RE2JSCompileException,
	RE2JSFlagsException,
	RE2JSGroupException,
	RE2JSSyntaxException
} from 're2js';
import type {
	AgentFile,
	AgentFileCommandRules as AgentFileCommandRulesContract,
	AgentFileError,
	AgentFileNextAction,
	AgentGrepInput,
	AgentGrepResult,
	AgentLsResult,
	AgentPathMetadata,
	AgentSedRange,
	AgentSedResult
} from '$lib/models/agent-files';

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

interface AgentFileCommandRules {
	listDirectory: AgentFileCommandRulesContract['listDirectory'];
	search: AgentFileCommandRulesContract['search'];
	read: AgentFileCommandRulesContract['read'];
	missingRead: AgentFileCommandRulesContract['missingRead'];
}

export class AgentFileCommandRulesService implements AgentFileCommandRules {
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

	listDirectory(path: string, files: readonly AgentFile[]): AgentLsResult {
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
	search(path: string, input: AgentGrepInput, files: readonly AgentFile[]): AgentGrepResult {
		const directories = this.directories(files);
		const targets = [...files]
			.sort((left, right) => left.metadata.path.localeCompare(right.metadata.path))
			.filter(
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
	missingRead(path: string, files: readonly AgentFile[]): AgentFileError {
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
	read(file: AgentFile, range: AgentSedRange): AgentSedResult {
		const path = file.metadata.path;
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
