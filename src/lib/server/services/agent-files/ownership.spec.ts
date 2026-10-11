import { expect, it } from 'vitest';
import { AgentVirtualFiles, type AgentVirtualFilesDependencies } from './virtual-files';
import { NoteMarkdownCodec } from '$lib/infrastructure/notes/markdown';
import { InMemoryNoteRepository } from '$lib/testing/notes/fakes/in-memory-note-repositories';
import { InMemoryProjectRepository } from '$lib/testing/projects/fakes/in-memory-project-repository';
import { InMemoryDiagramRepository } from '$lib/testing/skills/fakes/in-memory-artifact-repositories';
import { InMemoryAgentFiles } from '$lib/testing/agent/fakes/in-memory-agent-files';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { testTokenizer } from '$lib/testing/tokenization/fixtures/tokenizer';
import {
	noteBuilder,
	diagramBuilder,
	testActor,
	testConversationId,
	testProjectId
} from '$lib/testing/workspace/fixtures/domain-builders';

const setup = () => {
	const notes = new InMemoryNoteRepository(testActor());
	const diagrams = new InMemoryDiagramRepository(testActor());
	const stored = new InMemoryAgentFiles(testActor());
	const files = new AgentVirtualFiles(
		capabilityDependencies<AgentVirtualFilesDependencies>({
			notes,
			diagrams,
			stored,
			projects: new InMemoryProjectRepository(testActor()),
			tokens: testTokenizer,
			noteMarkdown: new NoteMarkdownCodec()
		})
	);
	return { notes, diagrams, stored, files };
};
const wholeFile = { kind: 'to_end', startLine: 1 } as const;

it('does not read another actor’s note content', async () => {
	const { notes, files } = setup();
	const note = noteBuilder();
	notes.notes = [note];
	expect(
		await files.sed(`/projects/${note.projectId}/notes/${note.id}.md`, wholeFile)
	).toMatchObject({ kind: 'error', code: 'path_not_found' });
});
it('rejects a note mounted under a different project', async () => {
	const { notes, files } = setup();
	const note = noteBuilder();
	notes.notes = [note];
	expect(
		await files.sed(`/projects/${testProjectId(2)}/notes/${note.id}.md`, wholeFile)
	).toMatchObject({ kind: 'error', code: 'path_not_found' });
});
it('does not read another actor’s diagram source', async () => {
	const { diagrams, files } = setup();
	const diagram = diagramBuilder();
	diagrams.diagrams = [diagram];
	expect(
		await files.sed(`/projects/${diagram.projectId}/diagrams/${diagram.id}.mmd`, wholeFile)
	).toMatchObject({ kind: 'error', code: 'path_not_found' });
});
it('retains the persisted identity of stored files', async () => {
	const { files, stored } = setup();
	const file = await stored.store({
		conversationId: testConversationId(),
		path: '/history/result.txt',
		mediaType: 'text/plain',
		content: 'Saved result'
	});
	expect(await files.ls(file.metadata.path)).toEqual({
		kind: 'listed',
		path: file.metadata.path,
		entries: [file.metadata]
	});
});
it('does not disclose stored files belonging to another actor', async () => {
	const { files, stored } = setup();
	const file = await stored.store({
		conversationId: testConversationId(),
		path: '/history/result.txt',
		mediaType: 'text/plain',
		content: 'Saved result'
	});
	expect(await files.sed(file.metadata.path, wholeFile)).toMatchObject({
		kind: 'error',
		code: 'path_not_found'
	});
});
