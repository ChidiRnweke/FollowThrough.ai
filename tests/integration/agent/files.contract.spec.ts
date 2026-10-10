import { expect, it } from 'vitest';
import type { ConversationId } from '$lib/models/agent';
import { AgentFiles } from '$lib/server/controllers/agent-files/controller';
import { createAgentFilesCapability } from '$lib/server/factories/capabilities/agent-files-capability-factory';
import { ConversationRecords } from '$lib/server/repositories/agent/postgres/conversations';
import { ProjectRecords } from '$lib/server/repositories/projects/postgres/projects';
import { NoteRecords } from '$lib/server/repositories/notes/postgres/notes';
import { agentToolResultsFixture } from '$lib/testing/agent/fixtures/tool-results';
import { testTokenizer } from '$lib/testing/tokenization/fixtures/tokenizer';
import { context, now, seedNote } from '../database-harness';

const setup = async (suffix: string) => {
	const seed = await seedNote(suffix);
	const conversation = await new ConversationRecords(context.db).insert(seed.owner, {
		id: crypto.randomUUID() as ConversationId,
		userId: seed.owner.userId,
		kind: 'chat',
		createdAt: now,
		updatedAt: now
	});
	const capability = createAgentFilesCapability({
		db: context.db,
		tokens: testTokenizer,
		projects: new ProjectRecords(context.db),
		notes: new NoteRecords(context.db)
	});
	const controller = new AgentFiles({
		...agentToolResultsFixture(),
		...capability,
		stored: capability.repository
	});
	return { ...seed, conversation, repository: capability.repository, controller };
};

it('persists exact content measurements and retains the stored identity on overwrite', async () => {
	const { owner, conversation, repository } = await setup('336401');
	const input = {
		conversationId: conversation.id,
		path: '/replay/result.txt',
		mediaType: 'text/plain',
		content: 'before'
	};
	const first = await repository.store(owner, input);
	await repository.store(owner, { ...input, content: 'é\n' });
	const saved = await repository.findByPath(owner, input.path);
	expect(saved).toEqual({
		conversationId: conversation.id,
		content: 'é\n',
		metadata: {
			kind: 'file',
			id: first.metadata.id,
			path: input.path,
			mediaType: 'text/plain',
			byteSize: 3,
			tokenCount: 2,
			lineCount: 2,
			checksumSha256: 'edd3a863872a04239eb29ad4bc12fc892b3d4ae57cc7e786a3697816f8e141c2'
		}
	});
});

it('keeps stored content ahead of a real note at the same exact path', async () => {
	const { owner, conversation, repository, controller, note } = await setup('336402');
	const path = `/projects/${note.projectId}/notes/${note.id}.md`;
	await repository.store(owner, {
		conversationId: conversation.id,
		path,
		mediaType: 'text/plain',
		content: 'stored override'
	});
	expect(await controller.sed(owner, path, { kind: 'to_end', startLine: 1 })).toEqual({
		kind: 'content',
		path,
		startLine: 1,
		endLine: 1,
		lineCount: 1,
		content: 'stored override',
		nextActions: []
	});
});

it('does not expose stored content to another established account', async () => {
	const { owner, conversation, repository, controller } = await setup('336403');
	const foreign = await seedNote('336404');
	const path = '/replay/private.txt';
	await repository.store(owner, {
		conversationId: conversation.id,
		path,
		mediaType: 'text/plain',
		content: 'private text'
	});
	expect(await controller.sed(foreign.owner, path, { kind: 'to_end', startLine: 1 })).toMatchObject(
		{ kind: 'error', code: 'path_not_found', requestedPath: path }
	);
});

it('rejects a real note mounted under a different owned project', async () => {
	const { owner, controller, note } = await setup('336405');
	const other = await seedNote('336406', owner);
	const path = `/projects/${other.project.id}/notes/${note.id}.md`;
	expect(await controller.sed(owner, path, { kind: 'to_end', startLine: 1 })).toMatchObject({
		kind: 'error',
		code: 'path_not_found',
		requestedPath: path
	});
});
