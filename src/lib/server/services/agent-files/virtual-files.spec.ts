import { describe, expect, it } from 'vitest';
import type { AttachmentRepository } from '$lib/server/repositories/attachments/attachments';
import type { DiagramRepository } from '$lib/server/repositories/diagrams/diagrams';
import type { NoteRepository } from '$lib/server/repositories/notes/notes';
import type { ProjectRepository } from '$lib/server/repositories/projects/projects';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import {
	noteBuilder,
	noteRevisionBuilder,
	projectBuilder,
	testActor,
	testNoteId,
	testProjectId
} from '$lib/testing/workspace/fixtures/domain-builders';
import { AgentVirtualFiles, type AgentVirtualFilesDependencies } from './virtual-files';
import { InMemoryAgentFiles } from '$lib/testing/agent/fakes/in-memory-agent-files';

const projectId = testProjectId();
const noteId = testNoteId();
const notePath = `/projects/${projectId}/notes/${noteId}.md`;
const content = 'alpha\nbeta warning\ngamma';

const reader = (body = content): AgentVirtualFiles =>
	new AgentVirtualFiles(
		capabilityDependencies<AgentVirtualFilesDependencies>({
			projects: capabilityDependencies<ProjectRepository>({
				listActive: async () => [projectBuilder()]
			}),
			notes: capabilityDependencies<NoteRepository>({
				listActive: async () => [noteBuilder({ plainText: body })],
				findById: async () => noteBuilder({ plainText: body }),
				listRevisions: async () => []
			}),
			attachments: capabilityDependencies<AttachmentRepository>({
				listForProject: async () => []
			}),
			diagrams: capabilityDependencies<DiagramRepository>({
				listForProject: async () => ({ diagrams: [], total: 0 })
			}),
			stored: new InMemoryAgentFiles(),
			noteMarkdown: () => body
		})
	);

describe('AgentVirtualFiles ls', () => {
	it('always reports size and identity metadata for a file', async () => {
		const result = await reader().ls(testActor(), notePath);

		expect(result).toMatchObject({
			kind: 'listed',
			path: notePath,
			entries: [
				{
					kind: 'file',
					path: notePath,
					mediaType: 'text/markdown',
					byteSize: 24,
					lineCount: 3,
					id: expect.any(String),
					tokenCount: expect.any(Number),
					checksumSha256: expect.any(String)
				}
			]
		});
	});

	it('returns a typed missing-path recovery without guessing', async () => {
		const result = await reader().ls(testActor(), `${notePath}.wrong`);

		expect(result).toMatchObject({
			kind: 'error',
			code: 'path_not_found',
			requestedPath: `${notePath}.wrong`,
			nextActions: [{ tool: 'ls', arguments: { path: `/projects/${projectId}/notes` } }]
		});
	});

	it('mounts published note versions under the note directory', async () => {
		const revision = noteRevisionBuilder({ revision: 7 });
		const service = new AgentVirtualFiles(
			capabilityDependencies<AgentVirtualFilesDependencies>({
				projects: capabilityDependencies<ProjectRepository>({
					listActive: async () => [projectBuilder()]
				}),
				notes: capabilityDependencies<NoteRepository>({
					listActive: async () => [noteBuilder()],
					listRevisions: async () => [revision]
				}),
				attachments: capabilityDependencies<AttachmentRepository>({
					listForProject: async () => []
				}),
				diagrams: capabilityDependencies<DiagramRepository>({
					listForProject: async () => ({ diagrams: [], total: 0 })
				}),
				stored: new InMemoryAgentFiles(),
				noteMarkdown: () => 'published body'
			})
		);

		expect(
			await service.ls(testActor(), `/projects/${projectId}/notes/${noteId}/versions`)
		).toMatchObject({
			kind: 'listed',
			entries: [{ path: `/projects/${projectId}/notes/${noteId}/versions/7.md`, lineCount: 1 }]
		});
	});
});

describe('AgentVirtualFiles grep', () => {
	it('uses regex and Unix match exit semantics', async () => {
		const result = await reader().grep(testActor(), {
			pattern: 'warn(ing)?',
			path: `/projects/${projectId}`,
			fixed: false,
			ignoreCase: false
		});

		expect(result).toMatchObject({
			kind: 'matches',
			exitCode: 0,
			matches: [{ path: notePath, lineNumber: 2, line: 'beta warning' }]
		});
	});

	it('distinguishes no matches from a failed search', async () => {
		const result = await reader().grep(testActor(), {
			pattern: 'not present',
			path: notePath,
			fixed: true,
			ignoreCase: false
		});

		expect(result).toMatchObject({ kind: 'no_matches', exitCode: 1, searchedFileCount: 1 });
	});

	it('turns invalid regex into an exact fixed-string retry', async () => {
		const result = await reader().grep(testActor(), {
			pattern: '[',
			path: notePath,
			fixed: false,
			ignoreCase: false
		});

		expect(result).toMatchObject({
			kind: 'error',
			code: 'invalid_pattern',
			nextActions: [{ tool: 'grep', arguments: { pattern: '[', path: notePath, fixed: true } }]
		});
	});
});

describe('AgentVirtualFiles sed', () => {
	it('returns typed recovery for a malformed id instead of querying a repository', async () => {
		const malformed = `/projects/${projectId}/notes/77e6cf7b-e4a8-4343-bd11-41bdbd7859290.md`;
		const result = await reader().sed(testActor(), malformed, {
			kind: 'to_end',
			startLine: 1
		});

		expect(result).toMatchObject({
			kind: 'error',
			code: 'path_not_found',
			requestedPath: malformed
		});
	});

	it('reads an inclusive line range', async () => {
		const result = await reader().sed(testActor(), notePath, {
			kind: 'lines',
			startLine: 2,
			endLine: 3
		});

		expect(result).toMatchObject({
			kind: 'content',
			startLine: 2,
			endLine: 3,
			lineCount: 3,
			content: 'beta warning\ngamma'
		});
	});

	it('does not clamp a start after EOF', async () => {
		const result = await reader().sed(testActor(), notePath, {
			kind: 'to_end',
			startLine: 9
		});

		expect(result).toMatchObject({
			kind: 'error',
			code: 'range_starts_after_eof',
			lineCount: 3,
			nextActions: [
				{
					tool: 'sed',
					arguments: { path: notePath, range: { kind: 'lines', startLine: 3, endLine: 3 } }
				}
			]
		});
	});

	it('reports a directory with an ls correction', async () => {
		const directory = `/projects/${projectId}/notes`;
		const result = await reader().sed(testActor(), directory, {
			kind: 'to_end',
			startLine: 1
		});

		expect(result).toMatchObject({
			kind: 'error',
			code: 'path_is_directory',
			nextActions: [{ tool: 'ls', arguments: { path: directory } }]
		});
	});

	it('reports an empty file instead of suggesting line zero', async () => {
		const result = await reader('').sed(testActor(), notePath, {
			kind: 'to_end',
			startLine: 1
		});

		expect(result).toMatchObject({
			kind: 'error',
			code: 'empty_file',
			nextActions: [{ tool: 'ls', arguments: { path: `/projects/${projectId}/notes` } }]
		});
	});
});
