import { attachmentViewBuilder } from '$lib/testing/attachments/fixtures/views';
import { AgentResourcePaths } from '$lib/server/repositories/agent-files/agent-files';
import { AgentFileContentMeter } from '$lib/server/adapters/agent-files/content-measurement';
import { NodeNoteMarkdown } from '$lib/server/adapters/notes/markdown';
import { testTokenizer } from '$lib/testing/tokenization/fixtures/tokenizer';
import { describe, expect, it } from 'vitest';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import {
	noteBuilder,
	noteRevisionBuilder,
	projectBuilder,
	testActor,
	testConversationId,
	diagramBuilder,
	testNoteId,
	testProjectId
} from '$lib/testing/workspace/fixtures/domain-builders';
import { AgentFiles, type AgentFilesDependencies } from './controller';
import { AgentFilePathsService } from '$lib/server/services/agent-files/paths';
import { AgentFileMetadataService } from '$lib/server/services/agent-files/metadata';
import { AgentFileCommandRulesService } from '$lib/server/services/agent-files/commands';
import { InMemoryNoteRepository } from '$lib/testing/notes/fakes/in-memory-note-repositories';
import { InMemoryProjectRepository } from '$lib/testing/projects/fakes/in-memory-project-repository';
import { InMemoryAttachmentRepository } from '$lib/testing/attachments/fakes/processing';
import { InMemoryDiagramRepository } from '$lib/testing/skills/fakes/in-memory-artifact-repositories';

import { InMemoryAgentFiles } from '$lib/testing/agent/fakes/in-memory-agent-files';

const projectId = testProjectId();
const noteId = testNoteId();
const notePath = `/projects/${projectId}/notes/${noteId}.md`;
const content = 'alpha\nbeta warning\ngamma';

const setup = (body = content) => {
	const projects = new InMemoryProjectRepository();
	projects.projects = [projectBuilder()];
	const notes = new InMemoryNoteRepository();
	notes.notes = [
		noteBuilder({
			plainText: body,
			document: {
				type: 'doc',
				content: body ? [{ type: 'paragraph', content: [{ type: 'text', text: body }] }] : []
			}
		})
	];
	const stored = new InMemoryAgentFiles();
	const attachments = new InMemoryAttachmentRepository();
	const diagrams = new InMemoryDiagramRepository();
	const controller = new AgentFiles(
		capabilityDependencies<AgentFilesDependencies>({
			resourcePaths: new AgentResourcePaths(),
			paths: new AgentFilePathsService(),
			metadata: new AgentFileMetadataService(new AgentFileContentMeter(testTokenizer)),
			commands: new AgentFileCommandRulesService(),
			projects,
			notes,
			stored,
			attachments,
			diagrams,
			noteMarkdown: new NodeNoteMarkdown()
		})
	);
	return { controller, notes, projects, stored, attachments, diagrams };
};
const reader = (body = content) => setup(body).controller;

describe('AgentFiles ls', () => {
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
		const revision = noteRevisionBuilder({
			revision: 7,
			document: {
				type: 'doc',
				content: [{ type: 'paragraph', content: [{ type: 'text', text: 'published body' }] }]
			}
		});
		const { controller: service, notes } = setup('published body');
		notes.revisions = [revision];

		expect(
			await service.ls(testActor(), `/projects/${projectId}/notes/${noteId}/versions`)
		).toMatchObject({
			kind: 'listed',
			entries: [{ path: `/projects/${projectId}/notes/${noteId}/versions/7.md`, lineCount: 1 }]
		});
	});
});

describe('AgentFiles grep', () => {
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

describe('AgentFiles sed', () => {
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

it.each(['/', '.'])('searches every file beneath root %s', async (path) => {
	const result = await reader('root needle').grep(testActor(), {
		path,
		pattern: 'needle',
		fixed: true,
		ignoreCase: false
	});
	expect(result).toMatchObject({
		kind: 'matches',
		matches: [{ path: notePath, lineNumber: 1, line: 'root needle' }]
	});
});

it('uses the stored file metadata for an exact listing when a virtual path collides', async () => {
	const { controller, stored } = setup();
	const file = await stored.store(testActor(), {
		conversationId: testConversationId(),
		path: notePath,
		mediaType: 'text/plain',
		content: 'stored body'
	});
	expect(await controller.ls(testActor(), notePath)).toEqual({
		kind: 'listed',
		path: notePath,
		entries: [file.metadata]
	});
});

it('reads stored content before the mounted note', async () => {
	const { controller, stored } = setup();
	await stored.store(testActor(), {
		conversationId: testConversationId(),
		path: notePath,
		mediaType: 'text/plain',
		content: 'stored body'
	});
	expect(await controller.sed(testActor(), notePath, { kind: 'to_end', startLine: 1 })).toEqual({
		kind: 'content',
		path: notePath,
		startLine: 1,
		endLine: 1,
		lineCount: 1,
		content: 'stored body',
		nextActions: []
	});
});

it('retains generated then stored matches at duplicate paths', async () => {
	const { controller, stored } = setup('virtual needle');
	await stored.store(testActor(), {
		conversationId: testConversationId(),
		path: notePath,
		mediaType: 'text/plain',
		content: 'stored needle'
	});
	expect(
		await controller.grep(testActor(), {
			path: '/',
			pattern: 'needle',
			fixed: true,
			ignoreCase: false
		})
	).toEqual({
		kind: 'matches',
		exitCode: 0,
		path: '/',
		pattern: 'needle',
		matches: [
			{ path: notePath, lineNumber: 1, line: 'virtual needle' },
			{ path: notePath, lineNumber: 1, line: 'stored needle' }
		]
	});
});

it('keeps both directory entries when a stored and mounted path collide', async () => {
	const { controller, stored } = setup();
	const file = await stored.store(testActor(), {
		conversationId: testConversationId(),
		path: notePath,
		mediaType: 'text/plain',
		content: 'stored body'
	});
	expect(await controller.ls(testActor(), `/projects/${projectId}/notes`)).toMatchObject({
		kind: 'listed',
		entries: [{ path: notePath, byteSize: 24 }, file.metadata]
	});
});

it('does not list another actor’s mounted or stored files', async () => {
	const { controller, stored } = setup();
	await stored.store(testActor(), {
		conversationId: testConversationId(),
		path: '/private.txt',
		mediaType: 'text/plain',
		content: 'secret'
	});
	expect(await controller.ls(testActor(2), '/')).toEqual({
		kind: 'listed',
		path: '/',
		entries: []
	});
});

it('rejects a valid note id under the wrong project', async () => {
	const { controller } = setup();
	const path = `/projects/${testProjectId(2)}/notes/${noteId}.md`;
	expect(await controller.sed(testActor(), path, { kind: 'to_end', startLine: 1 })).toMatchObject({
		kind: 'error',
		code: 'path_not_found',
		requestedPath: path
	});
});

it('does not resolve another actor’s exact note path', async () => {
	expect(
		await reader().sed(testActor(2), notePath, { kind: 'to_end', startLine: 1 })
	).toMatchObject({ kind: 'error', code: 'path_not_found', requestedPath: notePath });
});

it('reads revision markdown instead of the current note body', async () => {
	const { controller, notes } = setup('current');
	notes.revisions = [
		noteRevisionBuilder({
			revision: 7,
			document: {
				type: 'doc',
				content: [{ type: 'paragraph', content: [{ type: 'text', text: 'historic' }] }]
			}
		})
	];
	expect(
		await controller.sed(testActor(), `/projects/${projectId}/notes/${noteId}/versions/7.md`, {
			kind: 'to_end',
			startLine: 1
		})
	).toMatchObject({ kind: 'content', content: 'historic', lineCount: 1 });
});

it('rejects a diagram source mounted with the other language extension', async () => {
	const { controller, diagrams } = setup();
	const diagram = diagramBuilder();
	diagrams.diagrams = [diagram];
	const path = `/projects/${projectId}/diagrams/${diagram.id}.drawio`;
	expect(await controller.sed(testActor(), path, { kind: 'to_end', startLine: 1 })).toMatchObject({
		kind: 'error',
		code: 'path_not_found',
		requestedPath: path
	});
});

it('keeps an empty successful extraction visible as an empty file', async () => {
	const { controller, attachments } = setup();
	const attachment = attachmentViewBuilder({ version: { extractedText: '' } });
	attachments.found = attachment;
	const path = `/projects/${projectId}/attachments/${attachment.attachment.id}.txt`;
	expect(await controller.ls(testActor(), path)).toMatchObject({
		kind: 'listed',
		entries: [{ path, byteSize: 0, tokenCount: 0, lineCount: 0 }]
	});
});

it('does not mount an attachment before extracted text exists', async () => {
	const { controller, attachments } = setup();
	const attachment = attachmentViewBuilder({
		version: { processingStatus: 'queued', parserKind: undefined, extractedText: undefined }
	});
	attachments.found = attachment;
	const path = `/projects/${projectId}/attachments/${attachment.attachment.id}.txt`;
	expect(await controller.sed(testActor(), path, { kind: 'to_end', startLine: 1 })).toMatchObject({
		kind: 'error',
		code: 'path_not_found',
		requestedPath: path
	});
});

it('does not search another actor’s mounted or stored files', async () => {
	const { controller, stored } = setup('secret');
	await stored.store(testActor(), {
		conversationId: testConversationId(),
		path: '/private.txt',
		mediaType: 'text/plain',
		content: 'secret'
	});
	expect(
		await controller.grep(testActor(2), {
			path: '/',
			pattern: 'secret',
			fixed: true,
			ignoreCase: false
		})
	).toMatchObject({ kind: 'no_matches', exitCode: 1, searchedFileCount: 0 });
});
